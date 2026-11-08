"""Add each playlist song's Apple Music link to src/data/playlist.json.

Looks every song up in Apple's open iTunes Search API (no key needed) and stores the song's music.apple.com page as
`apple`. Songs it can't match are left null, and the site falls back to an Apple Music search for them.
pull-playlist.py runs this after a fresh pull; run it alone to refresh just the links:

    python3 scripts/apple-links.py
"""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'playlist.json'


def norm(s):
    # Same idea as norm() in src/lib/playlist.ts: "Panama - 2015 Remaster" and "Thrift Shop (feat. Wanz)" match the plain title.
    s = re.sub(r'\s+-\s+.*$', '', s.lower())
    s = re.sub(r'[(\[](feat|ft|with|from|remaster|\d{4} remaster)[^)\]]*[)\]]', '', s)
    return re.sub(r'[^a-z0-9]', '', s.replace('&', 'and'))


def search(term):
    url = 'https://itunes.apple.com/search?' + urllib.parse.urlencode({'term': term, 'entity': 'song', 'limit': 25, 'country': 'us'})
    for attempt in range(4):
        try:
            return json.load(urllib.request.urlopen(url, timeout=15)).get('results') or []
        except Exception:
            time.sleep(3 * (attempt + 1))  # Apple allows about 20 calls a minute
    return []


def apple_url(t):
    if not t['id'] or not t['artists']: return None  # local files aren't in any catalog
    title = re.sub(r'\s+-\s+.*$', '', t['title'])
    want_t, want_a = norm(t['title']), [norm(a) for a in t['artists']]
    results = search(f"{title} {t['artists'][0]}")
    artist_ok = lambda r: any(a and (a in norm(r.get('artistName', '')) or norm(r.get('artistName', '')) in a) for a in want_a)
    title_ok = lambda r: norm(r.get('trackName', '')) == want_t
    hit = next((r for r in results if title_ok(r) and artist_ok(r)), None) \
        or next((r for r in results if artist_ok(r) and want_t and (want_t in norm(r.get('trackName', '')))), None)
    if not hit: return None
    # trackViewUrl is the song's spot on its album page; drop the iTunes affiliate/tracking params.
    u = urllib.parse.urlsplit(hit['trackViewUrl'])
    i = urllib.parse.parse_qs(u.query).get('i')
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, f'i={i[0]}' if i else '', ''))


def add_links(tracks):
    for n, t in enumerate(tracks):
        t['apple'] = apple_url(t)
        print(f"{n + 1}/{len(tracks)} {t['title']}: {t['apple']}", file=sys.stderr)
        time.sleep(3.2)


if __name__ == '__main__':
    data = json.loads(OUT.read_text())
    add_links(data['tracks'])
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
    missing = [t['title'] for t in data['tracks'] if not t['apple']]
    print(f"{len(data['tracks']) - len(missing)}/{len(data['tracks'])} songs linked. Not found: {missing}")
