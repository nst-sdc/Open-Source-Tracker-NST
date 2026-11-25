"""Fetch each GSoC umbrella organisation's ideas list for 2022-2026, so the
reconcile script can read which sub-organisations it listed each year.

    python3 scripts/fetch-gsoc-ideas.py <dir>      # pages land in <dir>/ideas/<slug>/<year>.<ext>

The official GSoC API only keeps an organisation's current ideas-list URL, so
earlier years are reached by putting the year into that URL where it carries
one; lists without a year in the URL are fetched for the current year only.
GITHUB_TOKEN raises the limit for the GitHub API sources (NRNB's issues)."""
import json, os, re, sys, time, urllib.request, urllib.error
if len(sys.argv) != 2:
    sys.exit(__doc__)
OUT = os.path.join(sys.argv[1], 'ideas')
TOKEN = os.environ.get('GITHUB_TOKEN')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': '*/*'}
YEARS = [2022, 2023, 2024, 2025, 2026]

def T(url): return [(y, url.format(y=y, yy=str(y)[2:])) for y in YEARS]
SOURCES = {
  'numfocus': T('https://raw.githubusercontent.com/numfocus/gsoc/master/{y}/ideas-list.md'),
  'python-software-foundation': [(2026, 'https://python-gsoc.org/ideas.html')] + [(y, f'https://python-gsoc.org/{y}/ideas.html') for y in YEARS[:-1]],
  'cncf': T('https://raw.githubusercontent.com/cncf/mentoring/main/programs/summerofcode/{y}.md'),
  'osgeo-open-source-geospatial-foundation': T('https://wiki.osgeo.org/wiki/Google_Summer_of_Code_{y}_Ideas?action=raw'),
  'cern-hsf': T('https://hepsoftwarefoundation.org/gsoc/{y}/summary.html'),
  'r-project-for-statistical-computing': T('https://github.com/rstats-gsoc/gsoc{y}/wiki/table-of-proposed-coding-projects'),
  'the-julia-language': [(2026, 'https://julialang.org/jsoc/projects/')],
  'incf': [(2026, 'https://docs.google.com/document/d/1XkelmTUV8zMtg99GsZhbYvPoyUG5uzEIWji7IXj0M4k/export?format=txt')],
  # The ideas site is a single-page app; the site's repository holds one folder per sub-organisation and year, and names them in members.yaml.
  'openastronomy': [(y, f'https://api.github.com/repos/OpenAstronomy/openastronomy.github.io/contents/_projects/{y}') for y in YEARS] + [(0, 'https://raw.githubusercontent.com/OpenAstronomy/openastronomy.github.io/main/_data/members.yaml')],
  'jboss-community': [(2026, 'https://redhat.atlassian.net/wiki/spaces/GSOC/pages/183304705/Google+Summer+of+Code+2026+Ideas')],
  'open-bioinformatics-foundation-obf': [(2026, 'https://www.open-bio.org/events/gsoc/gsoc-project-ideas/')],
  'owasp-foundation': T('https://owasp.org/www-community/initiatives/gsoc/gsoc{y}ideas/'),
  'apache-software-foundation': T('https://s.apache.org/gsoc{y}ideas') + [(y, f'https://issues.apache.org/jira/rest/api/2/search?jql=labels%20in%20(gsoc{y},gsoc{y}ideas,GSOC{y},mentor)%20AND%20created%20%3E%3D%20{y}-01-01%20AND%20created%20%3C%3D%20{y}-12-31&fields=components,project,summary,labels&maxResults=1000') for y in YEARS],
  'eclipse-foundation': [(y, f'https://gitlab.eclipse.org/api/v4/projects/eclipsefdn%2Femo-team%2Fgsoc-at-the-ef/issues?labels=GSoC%20{y}&state=all&per_page=100&page={p}') for y in YEARS for p in (1, 2)],
  'the-linux-foundation': T('https://github.com/LinuxFoundationGSoC/ProjectIdeas/wiki/Google-Summer-of-Code-{y}'),
  'national-resource-for-network-biology-nrnb': [(0, f'https://api.github.com/repos/nrnb/GoogleSummerOfCode/issues?state=all&per_page=100&page={p}') for p in (1, 2, 3, 4)],
  'gnu-project': T('https://www.gnu.org/software/soc-projects/ideas-{y}.html'),
  'open-chemistry': T('https://wiki.openchemistry.org/GSoC_Ideas_{y}?action=raw'),
  'haskellorg': [(2026, 'https://summer.haskell.org/ideas.html')],
  'open-genome-informatics': T('https://gmod.org/wiki/GSOC_Project_Ideas_{y}?action=raw'),
  'uc-ospo': T('https://ucsc-ospo.github.io/osre{yy}/'),
  'wikimedia-foundation': T('https://www.mediawiki.org/wiki/Google_Summer_of_Code/{y}?action=raw'),
}
LINK = re.compile(r'https?://(?:www\.)?(github\.com|gitlab\.com|gitlab\.[a-z0-9.-]+)/([A-Za-z0-9_.-]+)(?:/([A-Za-z0-9_.-]+))?')
SKIP_OWNERS = {'orgs', 'topics', 'search', 'features', 'settings', 'login', 'join', 'about', 'marketplace', 'sponsors', 'apps', 'site', 'explore', 'collections', 'events', 'pulls', 'issues', 'notifications', 'new', 'enterprise', 'pricing', 'readme', 'security', 'customer-stories', 'team', 'contact', 'blog', 'users', 'groups', 'help', '-'}

class Redirect308(urllib.request.HTTPRedirectHandler):
    def http_error_308(self, req, fp, code, msg, headers):
        return self.http_error_301(req, fp, 301, msg, headers)
OPENER = urllib.request.build_opener(Redirect308())


def fetch(url):
    h = dict(UA)
    if 'api.github.com' in url and TOKEN: h['Authorization'] = f'Bearer {TOKEN}'
    req = urllib.request.Request(url, headers=h)
    with OPENER.open(req, timeout=40) as r:
        return r.status, r.geturl(), r.read().decode('utf-8', 'replace')

links = {}
log = []
for slug, pages in SOURCES.items():
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    for i, (year, url) in enumerate(pages):
        key = f'{year}' + (f'-{i}' if sum(1 for y, _ in pages if y == year) > 1 else '')
        try:
            status, final, body = fetch(url)
        except urllib.error.HTTPError as e:
            log.append(f'{slug} {key}: HTTP {e.code} {url}'); continue
        except Exception as e:
            log.append(f'{slug} {key}: {type(e).__name__} {url}'); continue
        ext = 'json' if body.lstrip().startswith(('{', '[')) else ('md' if url.endswith('.md') or 'action=raw' in url else 'html')
        with open(os.path.join(OUT, slug, f'{key}.{ext}'), 'w') as fh: fh.write(body)
        found = {}
        for host, owner, repo in LINK.findall(body):
            if owner.lower() in SKIP_OWNERS: continue
            found.setdefault(f'{host}/{owner}', set())
            if repo and repo not in ('issues', 'pulls', 'wiki', 'blob', 'tree', 'projects', 'discussions', 'releases', 'actions'): found[f'{host}/{owner}'].add(repo)
        links.setdefault(slug, {})[key] = {'url': url, 'final': final, 'bytes': len(body), 'owners': {k: sorted(v) for k, v in found.items()}}
        log.append(f'{slug} {key}: ok {len(body)}B, {len(found)} owners')
        time.sleep(0.3)
json.dump(links, open(os.path.join(OUT, 'links.json'), 'w'), indent=1)
print('\n'.join(log))
