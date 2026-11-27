#!/usr/bin/env python3
"""
Import the campus roster workbook into the tracker.

Downloads the Google Sheets workbook (one tab per campus and admission
batch, e.g. "RU 2025-2029"), works out each tab's login, email and name
columns from their content (several tabs have no header row), maps the
batch to the current year of study, and posts one import per tab to
POST /api/admin/students/import, which adds unknown logins, fills names,
emails, year and campus on known ones, and never removes anyone.

  ADMIN_PASSWORD=... python3 scripts/roster-import.py --base https://os.nstsdc.org \
      --sheet 1kEbCrGpSpkUN7PcFVZ_uxZ-l9YX1YXsjKC5o9xGgdm4 [--tab "RU 2026-2030"] [--dry-run]

Standard library only, so it runs anywhere python3 does (a GitHub runner,
a laptop, a pod). Nothing is written to disk except a temp copy of the
workbook.
"""
from __future__ import annotations
import argparse, io, json, os, re, sys, time, urllib.request, zipfile
import xml.etree.ElementTree as ET
from http.cookiejar import CookieJar

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
CAMPUS = {'ADYPU': 'ADYPU', 'RU': 'Rishihood', 'SVYASA': 'SVYASA', 'SMRU': 'SMRU'}
LOGIN = re.compile(r'^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$')


def year_of(batch: str, now_year: int) -> str | None:
    """'2025-2029' -> '2nd year' in the 2026-27 academic year (starts in July)."""
    m = re.match(r'(\d{4})-(\d{4})', batch)
    if not m:
        return None
    n = now_year - int(m.group(1)) + 1
    return {1: '1st year', 2: '2nd year', 3: '3rd year', 4: '4th year'}.get(n)


def read_workbook(data: bytes):
    z = zipfile.ZipFile(io.BytesIO(data))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    for sh in wb.find('m:sheets', NS):
        target = rels[sh.get('{%s}id' % NS['r'])]
        target = target if target.startswith('xl/') else 'xl/' + target.lstrip('/')
        rows = []
        for row in ET.fromstring(z.read(target)).iter('{%s}row' % NS['m']):
            cells = []
            for c in row.findall('m:c', NS):
                v = c.find('m:v', NS); t = c.get('t')
                val = '' if v is None else (shared[int(v.text)] if t == 's' else v.text)
                if t == 'inlineStr':
                    val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
                cells.append((val or '').strip())
            if any(cells):
                rows.append(cells)
        yield sh.get('name'), rows


def login_of(v: str):
    m = re.search(r'github\.com/([A-Za-z0-9-]+)', v, re.I)
    if m:
        return m.group(1)
    v = v.strip().lstrip('@')
    return v if LOGIN.match(v) and not v.isdigit() and '.' not in v and len(v) > 1 else None


is_email = lambda v: bool(re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', v.strip()))
is_id = lambda v: bool(re.match(r'^[0-9.E+\-]+$', v.strip())) or bool(re.match(r'^\d{4}-[A-Z]-\d+[A-Z]?$', v.strip()))


def parse_tab(rows):
    """Rows of one tab -> (import rows, skipped-without-login, dropped-duplicates)."""
    if not rows:
        return [], 0, 0
    hdr = rows[0]
    has_header = any(re.search(r'name|github|email|urn|en no', c, re.I) for c in hdr) and not any(is_email(c) for c in hdr)
    data = rows[1:] if has_header else rows
    ncol = max((len(r) for r in data), default=0)
    roles = {}
    for i in range(ncol):
        col = [r[i] for r in data if i < len(r) and r[i]]
        if not col:
            continue
        roles[i] = {
            'email': sum(is_email(v) for v in col) / len(col),
            'login': sum(1 for v in col if 'github.com/' in v.lower() or (login_of(v) and not is_email(v) and not is_id(v) and ' ' not in v)) / len(col),
            'id': sum(is_id(v) for v in col) / len(col),
            'name': sum(1 for v in col if ' ' in v.strip() and not is_email(v) and 'http' not in v) / len(col),
            'n': len(col),
        }
    def best(kind, exclude=()):
        c = [(i, r[kind]) for i, r in roles.items() if i not in exclude and r['n'] >= max(3, 0.2 * len(data)) and r[kind] >= 0.5]
        return max(c, key=lambda x: x[1])[0] if c else None
    ei = best('email'); ni = best('name', exclude=(ei,))
    li = None
    if has_header:
        for i, h in enumerate(hdr):
            if re.search(r'github', h, re.I) and not re.search(r'profile|link', h, re.I):
                li = i
    if li is None:
        cands = [(i, r['login']) for i, r in roles.items() if i not in (ei, ni) and r['id'] < 0.5 and r['email'] < 0.5 and r['name'] < 0.5]
        li = max(cands, key=lambda x: x[1])[0] if cands else None
    out, seen, no_login, dups = [], set(), 0, 0
    for r in data:
        g = login_of(r[li]) if li is not None and li < len(r) and r[li] else None
        if not g:
            no_login += 1; continue
        if g.lower() in seen:
            dups += 1; continue
        seen.add(g.lower())
        name = r[ni] if ni is not None and ni < len(r) else ''
        email = r[ei].lower() if ei is not None and ei < len(r) and is_email(r[ei]) else ''
        out.append({'github': g, 'name': name or None, 'email': email or None})
    return out, no_login, dups


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='https://os.nstsdc.org')
    ap.add_argument('--sheet', required=True, help='Google Sheets id of the roster workbook')
    ap.add_argument('--tab', action='append', help='only these tab names (repeatable)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--pause', type=float, default=5)
    a = ap.parse_args()
    pw = os.environ.get('ADMIN_PASSWORD')
    if not a.dry_run and not pw:
        sys.exit('ADMIN_PASSWORD is not set')
    print('downloading workbook', flush=True)
    data = urllib.request.urlopen(f'https://docs.google.com/spreadsheets/d/{a.sheet}/export?format=xlsx', timeout=60).read()
    # Academic year starts in July: before July, batches are one year less far along.
    t = time.gmtime(); now_year = t.tm_year if t.tm_mon >= 7 else t.tm_year - 1
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    if not a.dry_run:
        req = urllib.request.Request(f'{a.base}/api/admin/auth', data=json.dumps({'password': pw}).encode(), headers={'Content-Type': 'application/json'})
        with opener.open(req, timeout=30) as r:
            if r.status != 200:
                sys.exit(f'admin login answered {r.status}')
    total = {'added': 0, 'updated': 0, 'unchanged': 0, 'skipped': 0}
    for name, rows in read_workbook(data):
        parts = name.split()
        campus = CAMPUS.get(parts[0]) if parts else None
        year = year_of(parts[1], now_year) if len(parts) > 1 else None
        if a.tab and name not in a.tab:
            continue
        if not campus or not year:
            print(f'{name}: skipped (tab name is not "<campus> <batch>")'); continue
        out, no_login, dups = parse_tab(rows)
        line = f'{name:18s} {campus:9s} {year:8s} rows {len(out):4d}  no-login {no_login:3d}  dup {dups:2d}'
        if a.dry_run or not out:
            print(line, '(dry run)' if a.dry_run else '(nothing to send)'); continue
        req = urllib.request.Request(f'{a.base}/api/admin/students/import', data=json.dumps({'rows': out, 'year': year, 'campus': campus}).encode(), headers={'Content-Type': 'application/json'})
        try:
            with opener.open(req, timeout=180) as r:
                res = json.load(r)
        except Exception as e:  # noqa: BLE001 — report and carry on with the next tab
            print(line, 'FAILED:', str(e)[:120]); continue
        for k in total:
            total[k] += len(res.get(k, []))
        print(line, f"-> added {len(res.get('added', []))} updated {len(res.get('updated', []))} unchanged {len(res.get('unchanged', []))} skipped {len(res.get('skipped', []))}", flush=True)
        time.sleep(a.pause)
    print('TOTAL', total)


if __name__ == '__main__':
    main()
