#!/usr/bin/env python3
"""Reconcile GSoC years 2022-2026 with the official GSoC site.

    python3 -I scripts/reconcile-gsoc-official.py <dir>

<dir> holds gsoc_official_<year>.json (GET https://summerofcode.withgoogle.com/api/archive/programs/<year>/organizations/)
and gsoc_details/<year>/<slug>.json (GET .../organizations/<slug>/, which carries the projects).

For each year from 2022 the official list decides who took part, and the
official organisation page decides how many projects (slots) it ran. This
updates data/gsoc-orgs.json (years, projectsByYear, and a record for every
official organisation the dataset lacks) and rewrites the gsoc2022…gsoc2026
sections of data/program-orgs.json from the official lists alone, so no
organisation is tagged with a year the official site does not confirm.
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORGS = os.path.join(ROOT, 'data', 'gsoc-orgs.json')
PROG = os.path.join(ROOT, 'data', 'program-orgs.json')
YEARS = range(2022, 2027)
# Official slugs whose organisation the dataset lists under another slug, or
# not at all, with the GitHub organisation (checked against the GitHub API).
GITHUB_FOR_SLUG = {
    'ceph': 'ceph', 'chromium-lj': 'chromium', 'django-software-foundation-8o': 'django', 'jenkins-wp': 'jenkinsci', 'weaviate': 'weaviate',
    'wellcome-sanger-institute': 'sanger-tol', 'jina-ai-sb': 'jina-ai', 'tensorflow-d1': 'tensorflow', 'datenlord-6z': 'datenlord', 'fossasia-bg': 'fossasia',
    'openrefine-j0': 'OpenRefine', 'the-jpf-team-hg': 'javapathfinder', 'dora-rs-tb': 'dora-rs', 'google-deepmind-sq': 'google-deepmind',
    'st-jude-childrens-research-hospital-ai': 'stjude', 'openms-inc': 'OpenMS', 'qubes-os-f3': 'QubesOS', 'gnu-project-av': None, 'wikimedia-foundation-nd': 'wikimedia',
}
# Dataset records whose GitHub link points at one member project instead of
# the organisation itself (NumFOCUS -> JuliaOpt, PSF -> PyAr, ...). Each login
# below is the organisation's own, checked against the GitHub API.
GITHUB_FIX = {
    'numfocus': 'numfocus', 'python-software-foundation': 'psf', 'cncf': 'cncf', 'osgeo-open-source-geospatial-foundation': 'OSGeo',
    'cern-hsf': 'HSF', 'r-project-for-statistical-computing': 'rstats-gsoc', 'the-julia-language': 'JuliaLang', 'incf': 'INCF',
    'openastronomy': 'OpenAstronomy', 'jboss-community': 'jboss', 'open-bioinformatics-foundation-obf': 'OBF', 'owasp-foundation': 'OWASP',
    'wikimedia-foundation': 'wikimedia', 'matrixorg': 'matrix-org', 'freifunk': 'freifunk', 'boost-c-libraries': 'boostorg',
    'open-chemistry': 'OpenChemistry', 'brl-cad': 'BRL-CAD', 'the-honeynet-project': 'honeynet',
}
# Umbrella organisations: GSoC counts their slots as one organisation, but the
# work happens in member projects. Their member projects are read from where
# each GSoC project's code lives.
UMBRELLAS = {
    'numfocus', 'python-software-foundation', 'cncf', 'osgeo-open-source-geospatial-foundation', 'cern-hsf', 'r-project-for-statistical-computing',
    'the-julia-language', 'incf', 'openastronomy', 'jboss-community', 'open-bioinformatics-foundation-obf', 'owasp-foundation', 'apache-software-foundation',
    'eclipse-foundation', 'the-linux-foundation', 'national-resource-for-network-biology-nrnb', 'gnu-project', 'open-chemistry', 'haskellorg',
    'open-genome-informatics', 'uc-ospo', 'wikimedia-foundation',
}
ARCHIVE = os.path.join(ROOT, 'data', 'gsoc-projects-archive.json')
CODE_OWNER = re.compile(r'https?://(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/')
CODE_REPO = re.compile(r'https?://(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)')


def code_owners(slug, src):
    """({year: {owner: projects}}, {owner: {repo: projects}}) from the code links of an organisation's GSoC projects."""
    per_year = {}
    repos = {}
    archive = json.load(open(ARCHIVE)).get(slug, {})
    links = [(str(y), p.get('c')) for y, projects in archive.items() for p in projects]
    for y in YEARS:
        path = os.path.join(src, 'gsoc_details', str(y), f'{slug}.json')
        if os.path.exists(path):
            links += [(str(y), p.get('project_code_url')) for p in json.load(open(path)).get('projects') or []]
    for y, link in links:
        m = CODE_OWNER.match(link or '')
        if m:
            per_year.setdefault(y, {}).setdefault(m.group(1), 0)
            per_year[y][m.group(1)] += 1
        r = CODE_REPO.match(link or '')
        if r and r.group(2) not in ('pulls', 'issues', 'blob', 'tree'):
            repos.setdefault(r.group(1), {}).setdefault(r.group(2), 0)
            repos[r.group(1)][r.group(2)] += 1
    return per_year, repos


def owner_types(logins, src):
    """GitHub account type per login (lower-case), cached in <src>/github_owner_types.json
    and fetched in batches through GraphQL when GITHUB_TOKEN is set. Logins the
    API does not know (renamed, deleted) are recorded as 'Missing'."""
    cache_path = os.path.join(src, 'github_owner_types.json')
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    todo = sorted({l.lower() for l in logins} - set(cache))
    token = os.environ.get('GITHUB_TOKEN')
    if todo and not token:
        print(f'!! {len(todo)} code-link owners have no cached account type and GITHUB_TOKEN is unset; member projects fall back to repeat owners')
        return cache
    import urllib.request
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        q = '{' + ' '.join(f'o{j}: repositoryOwner(login: {json.dumps(l)}) {{ __typename }}' for j, l in enumerate(batch)) + '}'
        req = urllib.request.Request('https://api.github.com/graphql', data=json.dumps({'query': q}).encode(),
                                     headers={'Authorization': f'bearer {token}', 'Content-Type': 'application/json'})
        body = json.load(urllib.request.urlopen(req, timeout=60))
        data = body.get('data') or {}
        for j, l in enumerate(batch):
            node = data.get(f'o{j}')
            cache[l] = node['__typename'] if node else 'Missing'
        with open(cache_path, 'w') as fh:
            json.dump(cache, fh, indent=0, sort_keys=True)
    return cache


def member_repos(repos, kept_owners):
    """{owner: {repo: projects}} for the member projects kept, most projects first."""
    lower = {o.lower() for o in kept_owners}
    out = {}
    for owner, counts in repos.items():
        if owner.lower() in lower:
            out[owner] = {r: n for r, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))}
    return out


def member_projects(per_year, types, known):
    """Keep organisations only: a link into a student's own account is their
    fork, not a member project. Without a known type, an owner counts when it
    appears more than once or is an organisation the explorer already lists."""
    total = {}
    for counts in per_year.values():
        for owner, n in counts.items():
            total[owner.lower()] = total.get(owner.lower(), 0) + n
    def keep(owner):
        t = types.get(owner.lower())
        if t is not None:
            return t == 'Organization'
        return total[owner.lower()] > 1 or owner.lower() in known
    out = {}
    for y, counts in sorted(per_year.items(), key=lambda kv: int(kv[0])):
        kept = {o: n for o, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower())) if keep(o)}
        if kept:
            out[y] = kept
    return out


def strip_html(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def main(src):
    orgs = json.load(open(ORGS))
    by_slug = {o['slug']: o for o in orgs}
    official = {}  # year -> {slug: listing}
    for y in YEARS:
        official[y] = {o['slug']: o for o in json.load(open(os.path.join(src, f'gsoc_official_{y}.json')))}
    # Forget what the dataset believed about these years; the official site decides.
    for o in orgs:
        o['years'] = [y for y in o['years'] if y < YEARS[0]]
        o['projectsByYear'] = {y: n for y, n in o['projectsByYear'].items() if int(y) < YEARS[0]}
    new_records = 0
    counts_known = 0
    for y in YEARS:
        for slug, listing in official[y].items():
            o = by_slug.get(slug)
            if o is None:
                if slug not in GITHUB_FOR_SLUG:
                    print(f'!! {y}: official organisation {slug!r} ({listing["name"]}) has no dataset record and no GitHub mapping; add it to GITHUB_FOR_SLUG')
                o = {
                    'slug': slug, 'name': listing['name'], 'github': GITHUB_FOR_SLUG.get(slug),
                    'category': (listing.get('categories') or ['Other'])[0],
                    'description': strip_html(listing.get('description_html'))[:600] or listing.get('tagline') or '',
                    'url': listing.get('website_url') or None, 'image': listing.get('logo_url') or None,
                    'years': [], 'technologies': [t.lower() for t in listing.get('tech_tags') or []][:12],
                    'topics': [t.lower() for t in listing.get('topic_tags') or []][:12],
                    'projects': 0, 'projectsByYear': {},
                }
                orgs.append(o); by_slug[slug] = o; new_records += 1
            if not o.get('github') and GITHUB_FOR_SLUG.get(slug):
                o['github'] = GITHUB_FOR_SLUG[slug]
            if y not in o['years']:
                o['years'].append(y)
            detail_path = os.path.join(src, 'gsoc_details', str(y), f'{slug}.json')
            if os.path.exists(detail_path):
                n = len(json.load(open(detail_path)).get('projects') or [])
                o['projectsByYear'][str(y)] = n
                counts_known += 1
    for o in orgs:
        o['years'].sort()
        o['projectsByYear'] = {y: n for y, n in sorted(o['projectsByYear'].items(), key=lambda kv: int(kv[0]))}
        o['projects'] = sum(o['projectsByYear'].values())
        if o['slug'] in GITHUB_FIX:
            o['github'] = GITHUB_FIX[o['slug']]
    known = {o['github'].lower() for o in orgs if o.get('github')}
    for section in json.load(open(PROG)).values():
        known.update(l.lower() for l in section)
    owners = {o['slug']: code_owners(o['slug'], src) for o in orgs if o['slug'] in UMBRELLAS}
    types = owner_types([l for per_year, _ in owners.values() for counts in per_year.values() for l in counts], src)
    umbrellas = 0
    for o in orgs:
        o.pop('umbrella', None)
        if o['slug'] in UMBRELLAS:
            per_year, repos = owners[o['slug']]
            by_year = member_projects(per_year, types, known)
            kept = {owner for counts in by_year.values() for owner in counts}
            o['umbrella'] = {'membersByYear': by_year, 'memberRepos': member_repos(repos, kept)}
            umbrellas += 1
    missing = UMBRELLAS - {o['slug'] for o in orgs}
    if missing:
        print(f'!! umbrella slugs not in the dataset: {sorted(missing)}')
    orgs.sort(key=lambda r: r['name'].lower())
    with open(ORGS, 'w') as fh:
        json.dump(orgs, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    # Programme list: 2022-2026 strictly from the official site.
    prog = json.load(open(PROG))
    before = {y: set(l.lower() for l in prog.get(f'gsoc{y}', [])) for y in YEARS}
    for y in YEARS:
        logins = sorted({by_slug[s]['github'] for s in official[y] if by_slug[s].get('github')}, key=str.lower)
        prog[f'gsoc{y}'] = logins
    with open(PROG, 'w') as fh:
        json.dump(prog, fh, indent=2)
        fh.write('\n')
    for y in YEARS:
        after = set(l.lower() for l in prog[f'gsoc{y}'])
        print(f'gsoc{y}: {len(after)} organisations (dropped {len(before[y] - after)} unconfirmed, added {len(after - before[y])})')
    print(f'{len(orgs)} dataset records ({new_records} new), {counts_known} official year counts applied, {umbrellas} umbrellas with member projects -> {ORGS}, {PROG}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
