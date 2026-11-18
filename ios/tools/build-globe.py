#!/usr/bin/env python3
"""Bakes the globe texture for the iOS app from the web game's sources.

Land colour comes from assets/relief-8k.webp. The land mask is drawn from the country outlines in
data/world.json, the same lines the app draws as coast and borders, so paint and line work agree.
The ocean is flat survey blue with a pale shelf and four water lines that follow every coast,
taken from assets/coast-sdf-2k.png (0 on land and at the coast, 255 at about 800 km offshore).
On the web the same picture is drawn by a shader; a phone gets it as one texture.

Run from anywhere: python3 ios/tools/build-globe.py
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "ios" / "WorldSurvey" / "Resources"
W, H = 8192, 4096
SS = 2  # the mask is drawn at twice the size and scaled down for smooth coasts

WATER = (169, 210, 228)       # DESIGN.md water
SHELF = (196, 226, 237)
WATER_LINE = (93, 156, 192)   # DESIGN.md water-line
LINES = [(7, 0.50), (15, 0.40), (25, 0.28), (37, 0.17)]  # (sdf value, opacity)
LINE_HALF_WIDTH = 1.7


def rings(topo):
    """Outer rings of every country as lists of (lng, lat)."""
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(indexes):
        out = []
        for i in indexes:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(pts if not out else pts[1:])
        return out

    for geom in topo["objects"]["countries"]["geometries"]:
        polys = [geom["arcs"]] if geom["type"] == "Polygon" else geom["arcs"]
        for poly in polys:
            yield ring(poly[0])  # holes are enclaves, which are land too


def land_mask(topo):
    w, h = W * SS, H * SS
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for r in rings(topo):
        if len(r) < 3:
            continue
        # A ring that crosses the antimeridian jumps from 180 to -180 in the data. Unwrap it into
        # one continuous outline and draw it on both edges of the map.
        unwrapped, shift, crossed = [], 0.0, False
        for i, (lng, lat) in enumerate(r):
            if i and abs(lng - r[i - 1][0]) > 180:
                shift += 360 if lng < r[i - 1][0] else -360
                crossed = True
            unwrapped.append((lng + shift, lat))
        for offset in ((0, -360, 360) if crossed else (0,)):
            draw.polygon([((lng + offset + 180) / 360 * w, (90 - lat) / 180 * h) for lng, lat in unwrapped], fill=255)
    return mask.resize((W, H), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    relief = Image.open(ROOT / "assets" / "relief-8k.webp").convert("RGB")
    assert relief.size == (W, H), relief.size
    land = land_mask(json.loads((ROOT / "data" / "world.json").read_text()))

    sdf = Image.open(ROOT / "assets" / "coast-sdf-2k.png").convert("L").resize((W, H), Image.BICUBIC)
    shelf_alpha = sdf.point([round(255 * 0.5 * max(0.0, 1 - v / 26)) for v in range(256)])
    line_alpha = sdf.point([
        round(255 * min(1.0, sum(a * max(0.0, 1 - abs(v - c) / LINE_HALF_WIDTH) for c, a in LINES)))
        for v in range(256)
    ])

    ocean = Image.new("RGB", (W, H), WATER)
    ocean = Image.composite(Image.new("RGB", (W, H), SHELF), ocean, shelf_alpha)
    ocean = Image.composite(Image.new("RGB", (W, H), WATER_LINE), ocean, line_alpha)

    globe = Image.composite(relief, ocean, land)
    globe.save(OUT / "globe.jpg", quality=88, optimize=True)
    print("globe.jpg", (OUT / "globe.jpg").stat().st_size, "bytes")
    globe.resize((1024, 512), Image.LANCZOS).save(Path(__file__).with_name("globe-preview.jpg"), quality=80)


if __name__ == "__main__":
    main()
