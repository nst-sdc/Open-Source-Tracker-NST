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
    print(f'{len(orgs)} dataset records ({new_records} new), {counts_known} official year counts applied -> {ORGS}, {PROG}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
