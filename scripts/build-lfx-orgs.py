#!/usr/bin/env python3
"""Rebuild data/lfx-orgs.json: LFX Mentorship history per GitHub organisation.

Source: the LFX Mentorship Metrics dump (EshaanAgg/LFXMM-Backend, sql/backup.sql),
625 projects from 2019 to 2023 with their LFX parent organisation, term, skills and
repository. The LFX API itself (api.mentorship.lfx.linuxfoundation.org, endpoints
/projects/cache/paginate?from=&size=&sortby=updatedStamp and /projects/{id}) was
down for an upgrade when this was written; when it returns, add a fetch mode here.

    curl -sL https://raw.githubusercontent.com/EshaanAgg/LFXMM-Backend/main/sql/backup.sql -o /tmp/lfx-backup.sql
    python3 -I scripts/build-lfx-orgs.py /tmp/lfx-backup.sql [owner-types.tsv]

owner-types.tsv (optional): "<owner lower>\t<Type>\t<Login>" lines from the GitHub
API, so personal accounts are left out and logins keep GitHub's spelling.
"""
import collections, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'lfx-orgs.json')
GH = re.compile(r'^https?://(?:www\.)?github\.com/([^/\s?#]+)')


def read_copy(lines, table):
    start = next(i for i, l in enumerate(lines) if l.startswith(f'COPY public.{table} '))
    rows = []
    for l in lines[start + 1:]:
        if l == '\\.':
            break
        rows.append([c.replace('\\n', ' ') for c in l.split('\t')])
    return rows


def pg_array(s):
    s = s.strip()
    if not s or s == '\\N' or s == '{}':
        return []
    return [x.strip().strip('"') for x in s[1:-1].split(',') if x.strip()]


def main(dump, types_path=None):
    lines = open(dump, encoding='utf-8').read().split('\n')
    orgs = {r[0]: r for r in read_copy(lines, 'parentorgs')}
    projects = read_copy(lines, 'projects')
    types = {}
    if types_path and os.path.exists(types_path):
        for l in open(types_path):
            parts = l.rstrip('\n').split('\t')
            if len(parts) >= 3:
                types[parts[0].lower()] = (parts[1], parts[2])
    by_login = {}
    skipped_users, skipped_hosts = set(), collections.Counter()
    for r in projects:
        _id, _lfxid, name, _industry, _desc, skills, year, term, repo, website, _amt, org_id = r[:12]
        m = GH.match(repo)
        if not m:
            skipped_hosts[re.sub(r'^https?://([^/]+).*$', r'\1', repo)] += 1
            continue
        owner = m.group(1)
        t = types.get(owner.lower())
        if t and t[0] != 'Organization':
            skipped_users.add(owner)
            continue
        login = t[1] if t else owner
        e = by_login.setdefault(login.lower(), {
            'login': login, 'orgs': [], 'logo': None, 'skills': collections.Counter(), 'projects': 0,
            'projectsByYear': collections.Counter(), 'termsByYear': collections.defaultdict(set), 'recent': [],
        })
        parent = orgs.get(org_id)
        if parent:
            if parent[1] not in e['orgs']:
                e['orgs'].append(parent[1])
            if not e['logo'] and parent[2] and parent[2] != '\\N':
                e['logo'] = parent[2]
        e['projects'] += 1
        e['projectsByYear'][year] += 1
        tn = int(re.sub(r'\D', '', term) or 0)
        if tn:
            e['termsByYear'][year].add(tn)
        for s in pg_array(skills):
            e['skills'][s.lower()] += 1
        e['recent'].append({'name': name, 'year': int(year), 'term': tn, 'repo': repo, 'lfx': parent[1] if parent else None})
    out = []
    for e in by_login.values():
        recent = sorted(e['recent'], key=lambda p: (p['year'], p['term']), reverse=True)[:8]
        years = sorted(int(y) for y in e['projectsByYear'])
        out.append({
            'login': e['login'], 'orgs': e['orgs'], 'logo': e['logo'],
            'skills': [s for s, _ in e['skills'].most_common(12)],
            'projects': e['projects'], 'years': years,
            'projectsByYear': {y: n for y, n in sorted(e['projectsByYear'].items())},
            'termsByYear': {y: sorted(t) for y, t in sorted(e['termsByYear'].items())},
            'recent': recent,
        })
    out.sort(key=lambda r: r['login'].lower())
    with open(OUT, 'w') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    print(f'{len(out)} GitHub organisations, {sum(r["projects"] for r in out)} projects -> {OUT}')
    print('skipped personal accounts:', sorted(skipped_users))
    print('skipped non-GitHub repositories:', dict(skipped_hosts))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
