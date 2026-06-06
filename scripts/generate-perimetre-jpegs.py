#!/usr/bin/env python3
"""
Génère des JPEG du contour (enveloppe GPX) par niveau — relancer si les .gpx changent.

  python3 scripts/generate-perimetre-jpegs.py
"""
from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
W, H = 1200, 900
PAD = 72
MARGIN_FRAC = 0.08

LEVELS = [
    ("blanc.gpx", "perimetre-blanc.jpg", "#e2e8f0", "#2a3544", "Blanc · enveloppe indicative"),
    ("vert.gpx", "perimetre-vert.jpg", "#4ade80", "#14532d", "Vert · enveloppe indicative"),
    ("bleu.gpx", "perimetre-bleu.jpg", "#60a5fa", "#1e3a5f", "Bleu · enveloppe indicative"),
    ("rouge.gpx", "perimetre-rouge.jpg", "#f87171", "#450a0a", "Rouge · enveloppe indicative"),
]


def parse_trkpts(gpx_path: Path) -> list[tuple[float, float]]:
    tree = ET.parse(gpx_path)
    root = tree.getroot()
    pts: list[tuple[float, float]] = []
    for el in root.iter():
        if el.tag.endswith("trkpt"):
            lat = float(el.get("lat", "nan"))
            lon = float(el.get("lon", "nan"))
            if not math.isnan(lat) and not math.isnan(lon):
                pts.append((lat, lon))
    return pts


def lonlat_to_xy(
    lat: float,
    lon: float,
    min_lat: float,
    max_lat: float,
    min_lon: float,
    max_lon: float,
) -> tuple[int, int]:
    lon_span = max_lon - min_lon
    lat_span = max_lat - min_lat
    if lon_span < 1e-9:
        lon_span = 1e-6
    if lat_span < 1e-9:
        lat_span = 1e-6
    inner_w = W - 2 * PAD
    inner_h = H - 2 * PAD
    x = PAD + (lon - min_lon) / lon_span * inner_w
    y = PAD + (max_lat - lat) / lat_span * inner_h
    return int(round(x)), int(round(y))


def expand_bounds(
    min_lat: float,
    max_lat: float,
    min_lon: float,
    max_lon: float,
) -> tuple[float, float, float, float]:
    lat_span = max_lat - min_lat
    lon_span = max_lon - min_lon
    lat_pad = max(lat_span * MARGIN_FRAC, 0.002)
    lon_pad = max(lon_span * MARGIN_FRAC, 0.002)
    return (
        min_lat - lat_pad,
        max_lat + lat_pad,
        min_lon - lon_pad,
        max_lon + lon_pad,
    )


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def render_one(gpx_name: str, out_name: str, stroke: str, fill_hex: str, title: str) -> None:
    gpx_path = ROOT / gpx_name
    pts = parse_trkpts(gpx_path)
    if len(pts) < 3:
        raise SystemExit(f"Pas assez de points dans {gpx_name}")

    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat, min_lon, max_lon = expand_bounds(min_lat, max_lat, min_lon, max_lon)

    img = Image.new("RGB", (W, H), (10, 18, 28))
    draw = ImageDraw.Draw(img)

    xy = [lonlat_to_xy(lat, lon, min_lat, max_lat, min_lon, max_lon) for lat, lon in pts]

    fr, fg, fb = hex_rgb(fill_hex)
    draw.polygon(xy, fill=(fr, fg, fb), outline=stroke)
    draw.line(xy + [xy[0]], fill=stroke, width=5)

    out_path = ASSETS / out_name
    img.save(out_path, "JPEG", quality=90, optimize=True)
    print(f"OK {out_path.relative_to(ROOT)} ({title})")


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for gpx, jpg, stroke, fill, title in LEVELS:
        render_one(gpx, jpg, stroke, fill, title)


if __name__ == "__main__":
    main()
