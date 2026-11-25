"""Sub-organisations named on GSoC umbrella organisations' ideas lists.

Reads the pages that scripts/fetch-gsoc-ideas.py saved under <dir>/ideas and
returns, per umbrella and year, the sub-organisations (member projects) the
list names: {year: [{name, url, github?}]}. Every list has its own shape, so
each umbrella has its own small reader; umbrellas whose list does not name
sub-organisations (a table of project ideas, a page of workgroups) give nothing
here and keep only what the projects' code links show.

Where a list names a project without linking its code (Apache's Jira projects,
Eclipse's issue titles) the GitHub organisation or repository is looked up and
kept only when GitHub confirms it exists; the answers are cached in
<dir>/github_exists.json. GITHUB_TOKEN raises the limit for those lookups."""
import glob, html, json, os, re, urllib.request, urllib.error

YEARS = range(2022, 2027)
CURRENT = 2026
GH = re.compile(r'https?://(?:www\.)?github\.com/([A-Za-z0-9_.-]+)(?:/([A-Za-z0-9_.-]+))?')
GENERIC = {'orgs', 'topics', 'search', 'features', 'settings', 'login', 'join', 'about', 'marketplace', 'sponsors', 'apps', 'site', 'explore', 'events', 'pulls', 'issues', 'notifications', 'new', 'enterprise', 'pricing', 'security', 'platform'}


def text(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).replace('\xa0', ' ').strip()


def github_of(url):
    """'owner/repo' or 'owner' for a GitHub link, None otherwise."""
    m = GH.match(url or '')
    if not m or m.group(1).lower() in GENERIC:
        return None
    repo = m.group(2)
    if repo in (None, '', 'issues', 'pulls', 'wiki', 'blob', 'tree', 'discussions', 'projects'):
        return m.group(1)
    return f'{m.group(1)}/{repo}'


def entry(name, url=None, github=None):
    # "Kubebuilder (https://github.com/...)" names its link in the name.
    m = re.search(r'\((https?://[^)\s]+)\)', name)
    if m:
        url = url or m.group(1)
        name = name[:m.start()] + name[m.end():]
    e = {'name': re.sub(r'\s+', ' ', name).strip(' -–:')}
    if url:
        e['url'] = url
    gh = github or github_of(url)
    if gh:
        e['github'] = gh
    return e


def read(path):
    return open(path, encoding='utf-8', errors='replace').read()


def pages(src, slug):
    """{year: [paths]} of the fetched pages, '0' pages (no year) under 0."""
    out = {}
    for p in sorted(glob.glob(os.path.join(src, 'ideas', slug, '*'))):
        key = os.path.basename(p).split('.')[0].split('-')[0]
        if key.isdigit():
            out.setdefault(int(key), []).append(p)
    return out


def anchors(s):
    return [(u, text(t)) for u, t in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', s, re.S)]


def headings(s, levels='23'):
    """[(name, first link in the heading, position)]"""
    out = []
    for m in re.finditer(r'<h[%s][^>]*>(.*?)</h[%s]>' % (levels, levels), s, re.S):
        link = re.search(r'href="([^"]+)"', m.group(1))
        out.append((text(m.group(1)), link.group(1) if link else None, m.end()))
    return out


def tokens(name):
    return [t for t in re.split(r'[^a-z0-9]+', name.lower()) if len(t) > 2 and t not in ('the', 'and', 'for', 'project', 'apache', 'eclipse', 'owasp', 'gnu')]


def best_link(name, urls):
    """The GitHub link that carries the project's name in its owner or repository,
    else None: a section's first link is often an upstream issue elsewhere."""
    for u in urls:
        gh = github_of(u)
        if gh and any(t in gh.lower().replace('-', '').replace('_', '') or t in gh.lower() for t in tokens(name)):
            return u
    return None


def section_link(name, s, start, end):
    return best_link(name, [u for u, _ in anchors(s[start:end])])


# ---- readers, one per umbrella ---------------------------------------------

def numfocus(path):
    md = re.sub(r'<!--.*?-->', '', read(path), flags=re.S)
    out = [entry(n, u) for n, u in re.findall(r'^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)', md, re.M) if 'README' not in u]
    # 2022 wrote "- Name https://..." without markdown links.
    out += [entry(n, u) for n, u in re.findall(r'^\s*[-*]\s*([^\[\n]+?)\s+(https?://\S+)\s*$', md, re.M)]
    return out


def cncf(path):
    md = read(path)
    # The template names the heading level projects use ("#### CNCF Project Name" from 2024, "### " before).
    tpl = re.search(r'^(#+) CNCF Project Name', md, re.M)
    level = tpl.group(1) if tpl else '###'  # 2022 had no template: projects at ###, ideas at ####
    md = md[md.find('## Ideas'):] if '## Ideas' in md else md[md.find('## Project Ideas'):]
    out = []
    heads = list(re.finditer(r'^%s (.+)$' % level, md, re.M))
    for i, m in enumerate(heads):
        name = m.group(1).strip()
        link = re.search(r'\[([^\]]+)\]\(([^)]+)\)', name)
        if link:
            name, url = link.group(1), link.group(2)
        else:
            url = None
        if name.lower().startswith('cncf project name'):
            continue
        body = md[m.end():heads[i + 1].start() if i + 1 < len(heads) else len(md)]
        gh = github_of(url) if url else None
        if not gh:
            hit = best_link(name, re.findall(r'https?://github\.com/[^\s)>\]]+', body))
            if hit:
                url, gh = hit, github_of(hit)
        out.append(entry(name, url, gh))
    return out


APACHE_SUMMARY = re.compile(r'^(?:\[[^\]]*\]\s*)?(Apache [A-Z][\w.-]+(?: \(Incubating\))?)')


def apache(path, exists):
    out = []
    for issue in json.load(open(path)).get('issues', []):
        f = issue['fields']
        name = f['project']['name']
        if name == 'Comdev GSOC':
            m = APACHE_SUMMARY.match(f['summary'])
            if not m:
                continue
            name = m.group(1)
        if not name.startswith('Apache '):
            name = f'Apache {name}'
        slug = re.sub(r'\s*\(incubating\)', '', name[len('Apache '):], flags=re.I).strip().lower().replace(' ', '-')
        gh = f'apache/{slug}' if exists('repo', f'apache/{slug}') else None
        out.append(entry(name, f'https://issues.apache.org/jira/browse/{issue["key"]}', gh))
    return out


def eclipse(path, exists):
    out = []
    for issue in json.load(open(path)):
        title = issue['title']
        m = re.search(r'\[(Eclipse [^\]]+)\]', title) or re.search(r'\b(Eclipse [A-Z][\w.-]+)', title)
        if not m:
            continue
        name = m.group(1).strip()
        if name in ('Eclipse Project', 'Eclipse Foundation', 'Eclipse IDE'):
            continue
        word = name[len('Eclipse '):].lower()
        gh = None
        for cand in (f'eclipse-{word}', f'eclipse/{word}', f'eclipse-{word}/{word}'):
            kind = 'repo' if '/' in cand else 'org'
            if exists(kind, cand):
                gh = cand
                break
        out.append(entry(name, issue['web_url'], gh))
    return out


def osgeo(path):
    return [entry(n, u) for u, n in re.findall(r"\*\s*\[(\S+)\s+'''([^']+)'''\s*Ideas\s*\]", read(path))]


def psf(path):
    s = read(path)
    hs = headings(s)
    start = next((i for i, h in enumerate(hs) if 'getting started' in h[0].lower()), -1)
    out = []
    for i, (name, link, pos) in enumerate(hs[start + 1:], start + 1):
        if len(name) > 60 or re.search(r'ideas for|how to|apply|contact|timeline|faq', name, re.I):
            continue
        if name.lower() in ('ideas', 'sub-orgs', 'projects') or re.search(r'archive|ideas \d{4}', name, re.I):
            continue
        end = hs[i + 1][2] if i + 1 < len(hs) else len(s)
        out.append(entry(name, link or section_link(name, s, pos, end)))
    return out


def gnu(path):
    return [entry(n, l) for n, l, _ in headings(read(path), '3') if n.startswith('GNU') or n.startswith('Gnu') or len(n) < 40]


def owasp(path, exists):
    s = read(path)
    hs = headings(s)
    start = next((i for i, h in enumerate(hs) if 'list of project ideas' in h[0].lower()), -1)
    out = []
    for i, (name, link, pos) in enumerate(hs[start + 1:], start + 1):
        if len(name) > 70 or re.search(r'how to|apply|contact|timeline|faq|idea template|student', name, re.I):
            continue
        end = hs[i + 1][2] if i + 1 < len(hs) else len(s)
        url = link or section_link(name, s, pos, end)
        gh = github_of(url) if url else None
        if not gh:
            # OWASP projects live under github.com/OWASP, named like the project.
            short = re.sub(r'^OWASP\s+', '', re.sub(r'\s*\([^)]*\)', '', name)).strip()
            short = re.sub(r'[^A-Za-z0-9 .-]', '', short).strip()
            for cand in (short.replace(' ', '-'), short.replace(' ', ''), f'www-project-{short.lower().replace(" ", "-")}'):
                if cand and exists('repo', f'OWASP/{cand}'):
                    gh = f'OWASP/{cand}'
                    break
        out.append(entry(name, url, gh))
    return out


def incf(path):
    out, seen = [], set()
    for m in re.finditer(r'^\s*\d+\)\s*(.+?)\s+[-–]\s', read(path), re.M):
        name = m.group(1).strip()
        if name.lower() not in seen and len(name) < 50:
            seen.add(name.lower())
            out.append(entry(name))
    return out


def jboss(path):
    s = read(path)
    hs = headings(s, '123')
    start = next((i for i, h in enumerate(hs) if 'idea proposals' in h[0].lower()), -1)
    out, seen = [], set()
    for name, link, _ in hs[start + 1:]:
        head = re.split(r'\s[-–:]\s', name)[0].strip()
        if head == name or len(head) > 40 or head.lower() in seen:
            continue
        seen.add(head.lower())
        out.append(entry(head, link))
    return out


def openastronomy(src, year):
    members = {}
    for p in glob.glob(os.path.join(src, 'ideas', 'openastronomy', '0*')):
        cur = None
        for line in read(p).splitlines():
            m = re.match(r'^([A-Za-z0-9_-]+):\s*$', line)
            if m:
                cur = m.group(1)
                members[cur] = {}
            elif cur and re.match(r'^\s+name:\s*(.+)$', line):
                members[cur]['name'] = re.match(r'^\s+name:\s*(.+)$', line).group(1).strip()
            elif cur and re.match(r'^\s+github:\s*(.+)$', line):
                members[cur]['github'] = re.match(r'^\s+github:\s*(.+)$', line).group(1).strip().strip('/')
            elif cur and re.match(r'^\s+url:\s*(.+)$', line):
                members[cur]['url'] = re.match(r'^\s+url:\s*(.+)$', line).group(1).strip()
    out = []
    for p in glob.glob(os.path.join(src, 'ideas', 'openastronomy', f'{year}.json')):
        for item in json.load(open(p)):
            if item.get('type') != 'dir':
                continue
            m = members.get(item['name'], {})
            out.append(entry(m.get('name', item['name']), m.get('url', f'https://openastronomy.org/gsoc/gsoc{year}/'), m.get('github')))
    return out


# ---- lookups -----------------------------------------------------------------

def existence_checker(src):
    cache_path = os.path.join(src, 'github_exists.json')
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    token = os.environ.get('GITHUB_TOKEN')

    def exists(kind, name):
        key = f'{kind}:{name.lower()}'
        if key in cache:
            return cache[key]
        if not token:
            return False
        url = f'https://api.github.com/{"repos" if kind == "repo" else "orgs"}/{name}'
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}', 'User-Agent': 'oss-tracker-reconcile'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = json.load(r)
                # A renamed repository answers for its old name; keep the real one only.
                cache[key] = body.get('full_name', name).lower() == name.lower() if kind == 'repo' else body.get('type') == 'Organization'
        except urllib.error.HTTPError as e:
            cache[key] = False if e.code == 404 else cache.get(key, False)
        json.dump(cache, open(cache_path, 'w'), indent=0, sort_keys=True)
        return cache[key]
    return exists


# ---- entry point -------------------------------------------------------------

def sub_orgs(src, slug):
    """{year: [entries]} for one umbrella, empty when its list names none."""
    exists = existence_checker(src)
    got = pages(src, slug)
    out = {}

    def put(year, entries):
        seen, kept = set(), []
        for e in entries:
            key = e['name'].lower()
            if key not in seen:
                seen.add(key)
                kept.append(e)
        if kept:
            out[str(year)] = kept

    per_year = {
        'numfocus': numfocus, 'cncf': cncf, 'osgeo-open-source-geospatial-foundation': osgeo,
        'python-software-foundation': psf, 'gnu-project': gnu, 'owasp-foundation': lambda p: owasp(p, exists),
    }
    if slug in per_year:
        for year, paths in got.items():
            if year:
                put(year, [e for p in paths for e in per_year[slug](p)])
    elif slug == 'apache-software-foundation':
        for year, paths in got.items():
            put(year, [e for p in paths if p.endswith('.json') for e in apache(p, exists)])
    elif slug == 'eclipse-foundation':
        for year, paths in got.items():
            put(year, [e for p in paths for e in eclipse(p, exists)])
    elif slug == 'openastronomy':
        for year in YEARS:
            put(year, openastronomy(src, year))
    elif slug == 'jboss-community':
        for year, paths in got.items():
            if year:
                put(year, [e for p in paths for e in jboss(p)])
    # INCF's list names host institutions and projects alike, and the others name
    # ideas, not sub-organisations: nothing from the ideas list for those.
    return out
