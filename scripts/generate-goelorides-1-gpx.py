#!/usr/bin/env python3
"""
Génère le GPX officiel « GoëloRides #1 - La boucle des ports du Goëlo » (~45 km).

Itinéraire routier calculé via OSRM (profil bike = routes goudronnées, pas chemins).
Élévation via Open-Meteo. Relancer après modification des étapes :

  python3 scripts/generate-goelorides-1-gpx.py
"""
from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GPX_OUT = ROOT / "gpx" / "GoeloRides-1-Boucle-Ports-du-Goelo.gpx"
CONFIG_OUT = ROOT / "routes" / "goelorides-1-front-config.json"

ROUTE_NAME = "GoëloRides #1 - La boucle des ports du Goëlo"
ROUTE_DESC = (
    "Sortie de lancement GoëloRides — boucle découverte d'environ 45 km dans les "
    "petites routes de campagne du Goëlo (Port d'Armor). Parcours convivial en "
    "peloton, peu de difficultés, ouvert aux niveaux Blanc (Découverte), Vert "
    "(Intermédiaire) et Bleu (Confirmé). Départ et arrivée : parking du Casino, "
    "Saint-Quay-Portrieux."
)

# Étapes imposées + détour Plouézec (routes de campagne, ~46 km)
WAYPOINTS = [
    {"key": "depart", "name": "Départ — Parking du Casino", "sym": "Flag, Green",
     "lon": -2.8368541, "lat": 48.6547862, "type": "start"},
    {"key": "treneuc", "name": "Tréveneuc", "sym": "Waypoint",
     "lon": -2.8708469, "lat": 48.6646572, "type": "via"},
    {"key": "plouezec", "name": "Plouézec (détour campagne)", "sym": "Waypoint",
     "lon": -2.9855088, "lat": 48.7495700, "type": "via"},
    {"key": "plouha", "name": "Pause — Plouha", "sym": "Coffee",
     "lon": -2.9282960, "lat": 48.6755038, "type": "pause"},
    {"key": "plourhan", "name": "Plourhan", "sym": "Waypoint",
     "lon": -2.8698225, "lat": 48.6307804, "type": "via"},
    {"key": "epine", "name": "L'Épine Habet", "sym": "Waypoint",
     "lon": -2.8611724, "lat": 48.6197471, "type": "via"},
    {"key": "etables", "name": "Étables-sur-Mer", "sym": "Waypoint",
     "lon": -2.8400063, "lat": 48.6266514, "type": "via"},
    {"key": "arrivee", "name": "Arrivée — Port d'Armor, Saint-Quay-Portrieux", "sym": "Flag, Red",
     "lon": -2.8368541, "lat": 48.6547862, "type": "finish"},
]

GPX_NS = "http://www.topografix.com/GPX/1/1"
ET.register_namespace("", GPX_NS)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fetch_osrm_route() -> tuple[list[tuple[float, float]], float, float]:
    coord_str = ";".join(f"{w['lon']},{w['lat']}" for w in WAYPOINTS)
    url = (
        "https://router.project-osrm.org/route/v1/bike/"
        f"{coord_str}?overview=full&geometries=geojson&steps=false"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "GoeloRides/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())
    if data.get("code") != "Ok":
        raise RuntimeError(f"OSRM error: {data}")
    route = data["routes"][0]
    coords = [(c[1], c[0]) for c in route["geometry"]["coordinates"]]  # lat, lon
    return coords, route["distance"], route["duration"]


def fetch_elevations(coords: list[tuple[float, float]]) -> list[float]:
    """Open-Elevation API (POST, batch 100)."""
    elevs: list[float] = []
    batch = 100
    for i in range(0, len(coords), batch):
        chunk = coords[i : i + batch]
        payload = {
            "locations": [{"latitude": lat, "longitude": lon} for lat, lon in chunk]
        }
        body = json.dumps(payload).encode()
        for attempt in range(5):
            try:
                req = urllib.request.Request(
                    "https://api.open-elevation.com/api/v1/lookup",
                    data=body,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "GoeloRides/1.0",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=120) as resp:
                    data = json.loads(resp.read().decode())
                elevs.extend(float(r["elevation"]) for r in data["results"])
                break
            except urllib.error.HTTPError as err:
                if err.code in (429, 503) and attempt < 4:
                    time.sleep(2 ** attempt)
                    continue
                raise
        time.sleep(0.2)
    if len(elevs) != len(coords):
        raise RuntimeError(f"Elevation count mismatch: {len(elevs)} vs {len(coords)}")
    return elevs


def compute_elev_gain_m(elevs: list[float]) -> int:
    gain = 0.0
    for i in range(1, len(elevs)):
        d = elevs[i] - elevs[i - 1]
        if d > 0:
            gain += d
    return int(round(gain))


def simplify_points(
    coords: list[tuple[float, float]], elevs: list[float], min_step_m: float = 25.0
) -> tuple[list[tuple[float, float]], list[float]]:
    if not coords:
        return [], []
    out_c = [coords[0]]
    out_e = [elevs[0]]
    acc = 0.0
    for i in range(1, len(coords)):
        d = haversine_m(out_c[-1][0], out_c[-1][1], coords[i][0], coords[i][1])
        acc += d
        if acc >= min_step_m or i == len(coords) - 1:
            out_c.append(coords[i])
            out_e.append(elevs[i])
            acc = 0.0
    return out_c, out_e


def format_duration_hm(seconds: float) -> str:
    total_min = int(round(seconds / 60))
    h, m = divmod(total_min, 60)
    return f"{h}h{m:02d}" if h else f"{m} min"


def build_gpx(
    coords: list[tuple[float, float]],
    elevs: list[float],
    distance_m: float,
    duration_s: float,
) -> ET.ElementTree:
    start = datetime(2026, 7, 19, 8, 30, tzinfo=timezone.utc)
    # Vitesse peloton convivial (~20 km/h) pour timestamps GPX
    speed_mps = 20_000 / 3600

    root = ET.Element(
        "gpx",
        {
            "version": "1.1",
            "creator": "GoeloRides Route Generator",
            "xmlns": GPX_NS,
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "xsi:schemaLocation": (
                "http://www.topografix.com/GPX/1/1 "
                "http://www.topografix.com/GPX/1/1/gpx.xsd"
            ),
        },
    )

    meta = ET.SubElement(root, "metadata")
    ET.SubElement(meta, "name").text = ROUTE_NAME
    ET.SubElement(meta, "desc").text = ROUTE_DESC
    ET.SubElement(meta, "time").text = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    author = ET.SubElement(meta, "author")
    ET.SubElement(author, "name").text = "GoëloRides"

    bounds = ET.SubElement(meta, "bounds")
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]
    bounds.set("minlat", f"{min(lats):.6f}")
    bounds.set("maxlat", f"{max(lats):.6f}")
    bounds.set("minlon", f"{min(lons):.6f}")
    bounds.set("maxlon", f"{max(lons):.6f}")

    for wp in WAYPOINTS:
        wpt = ET.SubElement(root, "wpt", {"lat": f"{wp['lat']:.7f}", "lon": f"{wp['lon']:.7f}"})
        ET.SubElement(wpt, "name").text = wp["name"]
        ET.SubElement(wpt, "sym").text = wp["sym"]
        if wp["type"] == "start":
            ET.SubElement(wpt, "type").text = "Départ"
        elif wp["type"] == "finish":
            ET.SubElement(wpt, "type").text = "Arrivée"
        elif wp["type"] == "pause":
            ET.SubElement(wpt, "type").text = "Pause"

    trk = ET.SubElement(root, "trk")
    ET.SubElement(trk, "name").text = ROUTE_NAME
    ET.SubElement(trk, "desc").text = ROUTE_DESC
    ET.SubElement(trk, "type").text = "cycling"

    trkseg = ET.SubElement(trk, "trkseg")
    elapsed = 0.0
    for i, ((lat, lon), ele) in enumerate(zip(coords, elevs)):
        if i > 0:
            elapsed += haversine_m(coords[i - 1][0], coords[i - 1][1], lat, lon) / speed_mps
        t = start + timedelta(seconds=elapsed)
        trkpt = ET.SubElement(
            trkseg, "trkpt", {"lat": f"{lat:.7f}", "lon": f"{lon:.7f}"}
        )
        ET.SubElement(trkpt, "ele").text = f"{ele:.1f}"
        ET.SubElement(trkpt, "time").text = t.strftime("%Y-%m-%dT%H:%M:%SZ")

    return ET.ElementTree(root)


def write_front_config(
    coords: list[tuple[float, float]],
    elevs: list[float],
    distance_m: float,
    duration_s: float,
) -> None:
    km = round(distance_m / 1000, 1)
    dplus = compute_elev_gain_m(elevs)
    # Durée affichée : peloton ~20 km/h (plus réaliste que OSRM bike sportif)
    peloton_duration_s = distance_m / (20_000 / 3600)
    embedded = [[round(lat, 6), round(lon, 6)] for lat, lon in coords]

    config = {
        "route_id": "goelorides_1",
        "track_name": ROUTE_NAME,
        "group_label": "Multi-niveaux · Blanc · Vert · Bleu",
        "pace_label": "18–26 km/h",
        "sort_order": 1,
        "route_kind": "custom",
        "front_config": {
            "visibility": "public",
            "sortieStatus": "publiee",
            "raceType": "route",
            "levelClass": "level-blanc",
            "rideDateIso": "2026-07-19",
            "rideTime": "08:30",
            "meetTime": "08:15",
            "meetPlace": "Parking du Casino — Port d'Armor",
            "meetLat": 48.654786,
            "meetLon": -2.836854,
            "city": "Saint-Quay-Portrieux",
            "cp": "22410",
            "captain": "GoëloRides Team",
            "niveau": "tous_niveaux",
            "maxParticipants": 40,
            "description": (
                "<p><strong>Sortie de lancement officielle GoëloRides</strong> — "
                "environ 45 km sur les petites routes de campagne du Goëlo, "
                "départ et arrivée au <em>Port d'Armor</em> (parking du Casino).</p>"
                "<p>Parcours découverte convivial en peloton, peu de difficultés, "
                "ouvert aux cyclistes des groupes <strong>Blanc</strong> (Découverte), "
                "<strong>Vert</strong> (Intermédiaire) et <strong>Bleu</strong> (Confirmé).</p>"
                "<p>Étapes : Tréveneuc → Plouézec → Plouha (pause) → Plourhan → "
                "L'Épine Habet → Étables-sur-Mer → retour Saint-Quay-Portrieux.</p>"
            ),
            "km": km,
            "dplus": dplus,
            "estimatedDurationHm": format_duration_hm(peloton_duration_s),
            "stats": {"totalKm": km, "elevGainM": dplus},
            "embeddedPoints": embedded,
            "routeCities": [
                "Saint-Quay-Portrieux",
                "Tréveneuc",
                "Plouézec",
                "Plouha",
                "Plourhan",
                "Étables-sur-Mer",
            ],
            "file": "GoeloRides-1-Boucle-Ports-du-Goelo.gpx",
            "launchRide": True,
            "thumbSrc": "assets/goeloRidesHomePage-thumb.jpg",
        },
    }

    CONFIG_OUT.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_OUT.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    print("Calcul itinéraire OSRM (profil bike)…")
    coords, distance_m, duration_s = fetch_osrm_route()
    print(f"  → {distance_m / 1000:.1f} km, {format_duration_hm(duration_s)}")

    print("Simplification du tracé (~25 m entre points)…")
    coords, _ = simplify_points(coords, [0.0] * len(coords), min_step_m=25.0)
    print(f"  → {len(coords)} points track")

    print("Récupération élévation Open-Elevation…")
    elevs = fetch_elevations(coords)
    dplus = compute_elev_gain_m(elevs)
    print(f"  → D+ {dplus} m")

    tree = build_gpx(coords, elevs, distance_m, duration_s)
    try:
        ET.indent(tree, space="  ")
    except AttributeError:
        pass
    GPX_OUT.parent.mkdir(parents=True, exist_ok=True)
    tree.write(GPX_OUT, encoding="UTF-8", xml_declaration=True)
    print(f"GPX écrit : {GPX_OUT}")

    write_front_config(coords, elevs, distance_m, duration_s)
    print(f"Config : {CONFIG_OUT}")

    print("\nRésumé :")
    print(f"  Distance : {distance_m / 1000:.1f} km")
    print(f"  D+       : {dplus} m")
    print(f"  Durée    : {format_duration_hm(distance_m / (20_000 / 3600))} (peloton ~20 km/h)")


if __name__ == "__main__":
    main()
