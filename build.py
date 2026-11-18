#!/usr/bin/env python3
"""Builds geography.aimantas.com (World Survey) into dist/ from an explicit allowlist.

    python3 build.py          # build and check dist/
    python3 serve.py --dist   # preview the build at http://127.0.0.1:4462/

Only the page, its modules, the built data, the assets the code references and the three.js files it imports
are copied. Plans, tools, test pages, screenshots and caches never ship. Three Node generators then write the
pre-rendered pages into dist/, in this order:

    tools/encyclopedia/build.mjs   /countries/ (195 countries, 5 regions, index) and the first sitemap
    tools/reference/build.mjs      /lists/ and /compare/ (skipped while that generator is not in the tree)
    tools/seo/build.mjs            a shell per game route, lesson and atlas page, the final sitemap, robots.txt,
                                   llms.txt, the manifest and the IndexNow key file

The build fails on private markers, missing referenced files, a generator that exits non-zero or a blown
size budget. Set AIMANTAS_PRIVATE_MARKERS to a file (one name per line) to check private names too.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST = HERE / 'dist'

TOP = ['index.html', 'styles.css', 'robots.txt', '404.html']
DATA = ['data/countries.json', 'data/world.json', 'data/LICENSE-world-atlas.txt']
ASSET_GLOBS = ['assets/icons/*.png', 'assets/icon.svg', 'assets/og.png', 'assets/og/*.png', 'assets/encyclopedia.css', 'assets/analytics.js', 'assets/fonts/*.woff2', 'assets/fonts/OFL-*.txt', 'assets/flags/*.svg', 'assets/flags/LICENSE.txt', 'assets/relief-[248]k.webp', 'assets/elevation-18k-*.png']
VENDOR = ['vendor/three/three.module.min.js', 'vendor/three/LICENSE', 'vendor/topojson/topojson-client.min.js', 'vendor/topojson/LICENSE']
SKIP_SRC = re.compile(r'(^|/)_shots/|\.test\.js$')

# The one outside host the site loads: the analytics script, named only in assets/analytics.js (and the CSP header).
ANALYTICS_SCRIPT = ''  # set to your analytics script URL if you turn analytics on
GENERIC_MARKERS = r'/Users/|@gmail\.com|127\.0\.0\.1|localhost:'
BUDGET_INITIAL = 6.5 * 1024 * 1024  # the game's own payload: excludes the 8k relief, the zoom detail tiles, flags and the pre-rendered pages
# Folders of pre-rendered pages and on-demand images: outside the game's first-load budget.
OFF_BUDGET = {'flags', 'icons', 'og', 'countries', 'lists', 'compare', 'learn', 'atlas', 'play', 'higher-or-lower'}
# Reference pages (tools/reference): linked from the country pages, present only once that generator has run.
REFERENCE_SECTIONS = ('/lists/', '/compare/')

HEADERS = """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/src/*
  Cache-Control: public, max-age=0, must-revalidate

/styles.css
  Cache-Control: public, max-age=0, must-revalidate

/data/*
  Cache-Control: public, max-age=3600, must-revalidate

/assets/flags/*
  Cache-Control: public, max-age=604800

/assets/fonts/*
  Cache-Control: public, max-age=2592000

/assets/icons/*
  Cache-Control: public, max-age=604800

/assets/og/*
  Cache-Control: public, max-age=86400

/assets/relief-*
  Cache-Control: public, max-age=604800

/assets/elevation-*
  Cache-Control: public, max-age=604800

/assets/coast-*
  Cache-Control: public, max-age=604800

/sw.js
  Cache-Control: no-cache

/vendor/*
  Cache-Control: public, max-age=2592000

/countries/*
  Cache-Control: public, max-age=3600, must-revalidate

/lists/*
  Cache-Control: public, max-age=3600, must-revalidate

/compare/*
  Cache-Control: public, max-age=3600, must-revalidate
"""


def fail(msg):
    print(f'BUILD FAILED: {msg}')
    sys.exit(1)


def copy(rel):
    src = HERE / rel
    if not src.exists():
        fail(f'missing {rel}')
    dst = DIST / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return dst


def generate(name, script):
    """Run a Node page generator on dist/. A non-zero exit fails the build; its warnings are passed on."""
    r = subprocess.run(['node', str(script), str(DIST)], cwd=HERE, capture_output=True, text=True)
    if r.returncode != 0:
        fail(f'{name} build failed:\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}')
    for line in r.stderr.strip().splitlines():
        print(f'  {name}: {line}')
    print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else f'{name} built')


def three_addons(js_files):
    """Follow three/addons imports (and their relative imports) from the shipped modules."""
    need, queue = set(), []
    pat = re.compile(r"""(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)""")
    for f in js_files:
        for m in pat.finditer(f.read_text()):
            spec = m.group(1) or m.group(2)
            if spec.startswith('three/addons/'):
                queue.append(HERE / 'vendor/three/addons' / spec[len('three/addons/'):])
    while queue:
        p = queue.pop().resolve()
        if p in need:
            continue
        if not p.exists():
            fail(f'addon not vendored: {p.relative_to(HERE)}')
        need.add(p)
        for m in pat.finditer(p.read_text()):
            spec = m.group(1) or m.group(2)
            if spec.startswith('.'):
                queue.append((p.parent / spec))
            elif spec.startswith('three/addons/'):
                queue.append(HERE / 'vendor/three/addons' / spec[len('three/addons/'):])
    return sorted(need)


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()

    for rel in TOP + DATA + VENDOR:
        if (HERE / rel).exists() or rel not in ('robots.txt', '404.html'):
            copy(rel)

    src_files = [p for p in (HERE / 'src').rglob('*.js') if not SKIP_SRC.search(p.relative_to(HERE).as_posix())]
    for p in src_files:
        copy(p.relative_to(HERE).as_posix())
    for p in three_addons(src_files):
        copy(p.relative_to(HERE).as_posix())

    for pattern in ASSET_GLOBS:
        for p in sorted(HERE.glob(pattern)):
            copy(p.relative_to(HERE).as_posix())

    # Raster assets: ship only the ones the globe code names.
    code = '\n'.join(p.read_text() for p in src_files)
    for p in sorted((HERE / 'assets').glob('*')):
        if p.suffix in ('.webp', '.png', '.jpg') and p.name not in ('og.png',) and p.name in code:
            copy(p.relative_to(HERE).as_posix())

    # The direction contract and other build notes stay in source, not in the public page.
    idx = DIST / 'index.html'
    idx.write_text(re.sub(r'<!--.*?-->\n?', '', idx.read_text(), flags=re.S))

    # Encyclopedia: static, pre-rendered country pages plus sitemap.xml.
    gen = HERE / 'tools' / 'encyclopedia' / 'build.mjs'
    if gen.exists():
        generate('encyclopedia', gen)

    # Reference pages: /lists/ and /compare/, which the country pages link to. The generator copies its own
    # stylesheet and script into dist/assets/.
    ref = HERE / 'tools' / 'reference' / 'build.mjs'
    if ref.exists():
        generate('reference', ref)

    # Licence notices inside the public data files (ODbL for the world-countries database).
    import json
    odbl = 'https://opendatacommons.org/licenses/odbl/1-0/'
    cj = DIST / 'data' / 'countries.json'
    table = json.loads(cj.read_text())
    table = {'licence': f'Country facts derived from world-countries (mledoze), available under the Open Database License 1.0 ({odbl}); figures from the World Bank under CC BY 4.0. Every source and licence is listed in sources.', **table}
    cj.write_text(json.dumps(table, ensure_ascii=False, separators=(',', ':')))
    wj = DIST / 'data' / 'world.json'
    topo = json.loads(wj.read_text())
    topo['licence'] = f'Geometry: Natural Earth 1:50m (public domain) via world-atlas (ISC, see /data/LICENSE-world-atlas.txt). Country names from world-countries under the Open Database License 1.0 ({odbl}).'
    wj.write_text(json.dumps(topo, ensure_ascii=False, separators=(',', ':')))

    (DIST / '_headers').write_text(HEADERS)
    robots = 'User-agent: *\nAllow: /\n'
    extra = DIST / 'robots-sitemap.txt'
    if extra.exists():
        robots += '\n' + extra.read_text().strip() + '\n'
        extra.unlink()
    elif (DIST / 'sitemap.xml').exists():
        robots += '\nSitemap: https://geography.aimantas.com/sitemap.xml\n'
    (DIST / 'robots.txt').write_text(robots)

    # SEO: one pre-rendered HTML per route, lesson and atlas page, the final sitemap, robots, llms.txt, manifest
    # and the IndexNow key file. It runs last so the sitemap and llms.txt can list everything built above.
    seo = HERE / 'tools' / 'seo' / 'build.mjs'
    if seo.exists():
        generate('seo', seo)

    # Service worker: the offline copy of the game. Last of all, so its version covers the final files.
    sw = HERE / 'tools' / 'sw' / 'build.mjs'
    if sw.exists():
        generate('sw', sw)

    check()


def check():
    markers = GENERIC_MARKERS
    extra = os.environ.get('AIMANTAS_PRIVATE_MARKERS')
    if extra and Path(extra).exists():
        names = [re.escape(l.strip()) for l in Path(extra).read_text().splitlines() if l.strip()]
        if names:
            markers += '|' + '|'.join(names)
    rx = re.compile(markers, re.I)
    problems = []
    for p in DIST.rglob('*'):
        if p.is_file() and p.suffix in ('.html', '.js', '.css', '.json', '.txt', '.svg') and 'vendor' not in p.parts:
            analytics = p.relative_to(DIST).as_posix() == 'assets/analytics.js'
            for i, line in enumerate(p.read_text(errors='ignore').splitlines(), 1):
                m = rx.search(line.replace(ANALYTICS_SCRIPT, '') if analytics else line)
                if m:
                    problems.append(f'{p.relative_to(DIST)}:{i}: {m.group(0)}')
    if problems:
        fail('private markers found:\n  ' + '\n  '.join(problems[:20]))

    # Every local file the page and modules name must exist in dist/. Links to the reference pages are held
    # back until those pages are part of the build, and counted so their absence is not silent.
    reference_built = (DIST / 'lists' / 'index.html').exists()
    unbuilt = set()
    refs = set()
    for p in list(DIST.rglob('*.html')) + list(DIST.rglob('*.css')) + list((DIST / 'src').rglob('*.js')):
        text = p.read_text()
        for m in re.finditer(r"""(?:src|href)=["']([^"'#:]+)["']|url\(([^)"':]+)\)|['"`]((?:assets|data|vendor)/[^'"`$]+\.[a-z0-9]+)['"`]""", text):
            ref = (m.group(1) or m.group(2) or m.group(3)).strip()
            if '${' in ref or ref.startswith('%23'):
                continue  # template placeholders and in-SVG fragment ids, not files
            if ref.startswith('/') and not ref.startswith('//'):
                path = ref.split('?')[0]
                if not reference_built and path.startswith(REFERENCE_SECTIONS):
                    unbuilt.add(path)
                    continue
                target = DIST / path.lstrip('/')
                refs.add((target / 'index.html' if path.endswith('/') else target).resolve())
            elif ref and not ref.startswith(('http', 'data', '#', 'mailto')):
                base = DIST if p.suffix != '.css' or p.parent == DIST else p.parent
                refs.add((base / ref).resolve())
    missing = [str(r.relative_to(DIST.resolve())) for r in refs if not r.exists() and str(DIST.resolve()) in str(r)]
    if missing:
        fail('referenced files missing from dist:\n  ' + '\n  '.join(sorted(missing)))
    if unbuilt:
        print(f'WARNING: {len(unbuilt)} pages under /lists/ and /compare/ are linked but not in dist/ '
              '(the reference generator, tools/reference/build.mjs, did not run); those links would be dead if this were deployed')

    total = sum(p.stat().st_size for p in DIST.rglob('*') if p.is_file())
    initial = sum(p.stat().st_size for p in DIST.rglob('*') if p.is_file() and not OFF_BUDGET & set(p.relative_to(DIST).parts) and '8k' not in p.name and not p.name.startswith('elevation-18k-') and p.suffix not in ('.xml', '.txt') and p.name != 'og.png')
    if initial > BUDGET_INITIAL:
        fail(f'initial payload {initial / 1e6:.2f} MB over the {BUDGET_INITIAL / 1e6:.1f} MB budget')
    files = sum(1 for p in DIST.rglob('*') if p.is_file())
    print(f'dist/ ok: {files} files, {total / 1e6:.2f} MB total, {initial / 1e6:.2f} MB before on-demand assets')


if __name__ == '__main__':
    main()
