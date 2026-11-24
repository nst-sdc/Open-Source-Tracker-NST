#!/usr/bin/env python3
"""Rebuild data/gsoc-orgs.json from the gsocorganizations dataset.

    git clone --depth 1 https://github.com/ketankauntia/gsoc-orgs /tmp/gsoc-orgs
    python3 -I scripts/build-gsoc-orgs.py /tmp/gsoc-orgs/new-api-details/organizations

One record per organisation (2016-2026): slug, name, GitHub organisation,
category, description, website, logo, years, technologies, topics, project
counts. The GitHub organisation comes from the existing data file (those were
resolved by hand and by owner-type checks); a new slug keeps the dataset's
GitHub link only when it is listed in GITHUB_OVERRIDES below, and is printed
for review otherwise. Organisations without a GitHub organisation are kept
with `github: null`; the explorer lists them by website.
"""
import collections, glob, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'gsoc-orgs.json')
SKIP = {'organizations-index', 'organizations-metadata'}
GITHUB_OVERRIDES = {'apache-datafusion': 'apache', 'beeware-project': 'beeware', 'openkeychain-openpgp-for-android': 'open-keychain',
                    'xapian-search-engine-library': 'xapian', 'illumosorg': 'illumos', 'openelis-global': 'openelisglobal', 'moganlab': 'MoganLab'}
ALIAS = {'python 3': 'python', 'python3': 'python', 'golang': 'go', 'js': 'javascript', 'node': 'node.js', 'nodejs': 'node.js', 'node js': 'node.js',
         'cpp': 'c++', 'c/c++': 'c++', 'c / c++': 'c++', 'reactjs': 'react', 'react.js': 'react', 'ts': 'typescript', 'html5': 'html', 'css3': 'css',
         'postgres': 'postgresql', 'k8s': 'kubernetes', 'ml': 'machine learning', 'dl': 'deep learning', 'vue': 'vue.js', 'vuejs': 'vue.js',
         'angularjs': 'angular', 'gtk+': 'gtk', 'java script': 'javascript', 'javascipt': 'javascript', 'c sharp': 'c#', '.net core': '.net',
         'dotnet': '.net', 'artificial intelligence': 'ai', 'llms': 'llm', 'large language models': 'llm', 'genai': 'generative ai'}


def norm_list(items):
    c = collections.Counter()
    for t in items or []:
        name = t.get('name') if isinstance(t, dict) else t
        n = t.get('count', 1) if isinstance(t, dict) else 1
        if not isinstance(name, str):
            continue
        k = re.sub(r'\s+', ' ', name.strip().lower())
        k = ALIAS.get(k, k)
        if k:
            c[k] += n
    return [k for k, _ in c.most_common()]


def strip_html(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def main(src):
    try:
        existing = {o['slug']: o for o in json.load(open(OUT))}
    except Exception:
        existing = {}
    out, review = [], []
    for f in sorted(glob.glob(os.path.join(src, '*.json'))):
        d = json.load(open(f))
        slug = d.get('slug')
        if not slug or slug in SKIP:
            continue
        name = d.get('name') or slug.replace('-', ' ').title()
        if slug in existing:
            login = existing[slug]['github']
        elif slug in GITHUB_OVERRIDES:
            login = GITHUB_OVERRIDES[slug]
        else:
            login = None
            review.append((slug, name))
        pby = {str(k).replace('year_', ''): int(v) for k, v in (d.get('stats', {}).get('projects_by_year') or {}).items() if v}
        out.append({
            'slug': slug, 'name': name, 'github': login,
            'category': d.get('category') or 'Other',
            'description': strip_html(d.get('description'))[:600],
            'url': d.get('url') or None,
            'image': d.get('img_r2_url') or d.get('image_url') or None,
            'years': sorted(int(y) for y in d.get('active_years', [])),
            'technologies': norm_list(d.get('technologies'))[:12],
            'topics': norm_list(d.get('topics'))[:12],
            'projects': int(d.get('total_projects') or 0),
            'projectsByYear': pby,
        })
    out.sort(key=lambda r: r['name'].lower())
    with open(OUT, 'w') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    print(f'{len(out)} organisations, {sum(1 for r in out if r["github"])} with a GitHub organisation -> {OUT}')
    if review:
        print('new organisations without a GitHub mapping (check github.com and add to GITHUB_OVERRIDES or the data file):')
        for slug, name in review:
            print(f'  {slug}: {name}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
