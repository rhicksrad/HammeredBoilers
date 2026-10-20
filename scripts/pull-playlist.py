"""Snapshot the crew's Spotify playlist into src/data/playlist.json for the DJ Booth's search and genre chart.

Spotify's API only shows a playlist's songs to its owner, and the public embed stops at 100, so this opens the
normal playlist page in a headless browser, scrolls the whole list, and reads every row. Genres come from Deezer's
open API (each song's album genre). Re-run it whenever the playlist changes, then commit the JSON:

    pip install playwright && playwright install chromium
    python3 scripts/pull-playlist.py
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path
from playwright.sync_api import sync_playwright

PLAYLIST_ID = '3t5Iw9vyFz2vmcE7XL0d8c'
OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'playlist.json'
GRID = '[data-testid="playlist-tracklist"]'  # the playlist itself, not Spotify's "Recommended" list under it

ROWS_JS = """(grid) => [...document.querySelectorAll(grid + ' [data-testid="tracklist-row"]')].map(r => {
  const row = r.closest('[aria-rowindex]')
  const track = r.querySelector('a[href*="/track/"]')
  const local = r.querySelector('a[href*="/local/"]')
  const cells = [...r.querySelectorAll('[aria-colindex]')]
  return {
    row: Number(row?.getAttribute('aria-rowindex')),
    id: track ? track.getAttribute('href').split('/track/')[1].split('?')[0] : null,
    title: (track || local)?.textContent.trim() || null,
    artists: track ? [...new Set([...r.querySelectorAll('a[href*="/artist/"]')].map(a => a.textContent.trim()))] : [],
    album: r.querySelector('a[href*="/album/"]')?.textContent.trim() || null,
    duration: cells.length ? cells[cells.length - 1].textContent.trim() : null,
  }
})"""


def pull():
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    with sync_playwright() as p:
        browser = p.chromium.launch(proxy={'server': proxy} if proxy else None)
        page = browser.new_page(viewport={'width': 1400, 'height': 1000}, locale='en-US')
        page.goto(f'https://open.spotify.com/playlist/{PLAYLIST_ID}', wait_until='domcontentloaded', timeout=60000)
        for label in ('Accept Cookies', 'Close'):
            try: page.get_by_role('button', name=label).first.click(timeout=2500)
            except Exception: pass
        page.wait_for_selector(f'{GRID} [data-testid="tracklist-row"]', timeout=45000)
        name = page.get_attribute(GRID, 'aria-label')
        expected = int(page.get_attribute(GRID, 'aria-rowcount')) - 1  # minus the header row
        owner = page.get_attribute('meta[property="og:description"]', 'content').split(' · ')[1]

        rows = {}
        page.mouse.move(700, 600)
        for direction in (1, -1):  # down, then back up to catch anything the virtual list skipped
            stall = 0
            while stall < 10 and len(rows) < expected:
                before = len(rows)
                for r in page.evaluate(ROWS_JS, GRID):
                    if r['row'] and r['title']: rows[r['row']] = r
                page.mouse.wheel(0, 500 * direction)
                time.sleep(0.7)
                stall = stall + 1 if len(rows) == before else 0
        browser.close()
    if len(rows) != expected:
        sys.exit(f'Only read {len(rows)} of {expected} songs; run it again.')
    return name, owner, [rows[k] for k in sorted(rows)]


def deezer(path, **q):
    url = f'https://api.deezer.com/{path}' + (f'?{urllib.parse.urlencode(q)}' if q else '')
    for attempt in range(4):
        try:
            data = json.load(urllib.request.urlopen(url, timeout=15))
            if 'error' not in data: return data
        except Exception: pass
        time.sleep(1 + attempt)
    return {}


def genres(tracks):
    albums = {}
    for i, t in enumerate(tracks):
        if not t['id']: continue  # local files aren't in any catalog
        title = re.sub(r'\s+-\s+.*$', '', t['title'])  # "Panama - 2015 Remaster" -> "Panama"
        hit = (deezer('search', q=f"{title} {t['artists'][0]}", limit=1).get('data') or [None])[0]
        if not hit: continue
        a = hit['album']['id']
        if a not in albums:
            albums[a] = ((deezer(f'album/{a}').get('genres') or {}).get('data') or [{}])[0].get('name')
        t['genre'] = albums[a]
        print(f"{i + 1}/{len(tracks)} {t['title']}: {t['genre']}", file=sys.stderr)
        time.sleep(0.12)  # Deezer allows 50 calls per 5 seconds


def seconds(d):
    m = re.fullmatch(r'(?:(\d+):)?(\d+):(\d+)', d or '')
    return int(m[1] or 0) * 3600 + int(m[2]) * 60 + int(m[3]) if m else None


name, owner, rows = pull()
slug = lambda t: re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')[:60]
# key: what ratings are stored under. Spotify's track id, or local:<title> for files Kevin uploaded himself.
tracks = [{'key': r['id'] or f"local:{slug(r['title'])}", 'id': r['id'], 'title': r['title'], 'artists': r['artists'], 'album': r['album'],
           'seconds': seconds(r['duration']), 'genre': None} for r in rows]
genres(tracks)
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps({'id': PLAYLIST_ID, 'name': name, 'owner': owner, 'pulled': date.today().isoformat(),
                           'tracks': tracks}, ensure_ascii=False, indent=1) + '\n')
missing = [t['title'] for t in tracks if not t['genre']]
print(f'{len(tracks)} songs -> {OUT}. No genre: {missing}')
