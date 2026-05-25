"""
build-mrt-distances.py

Downloads sg-rail.geojson from cheeaun/sgraildata and computes per-line
cumulative distances (km from terminus) for each MRT station via Haversine.

Branch lines (EWL CG, CCL CE) are stored as separate "lines" so that
interchange routing handles them correctly — the simple |cum[A]-cum[B]|
formula only works for unbranched (linear) sequences.

Outputs public/data/mrt-distances.json:
{
  "lines": {
    "NSL": { "jurong east": 0.0, ... },
    "EWL": { "tuas link": 0.0, ..., "pasir ris": 46.7 },  // main line only
    "EWL_CG": { "tanah merah": 0.0, "expo": 2.0, "changi airport": 5.8 },
    "CCL": { "dhoby ghaut": 0.0, ..., "harbourfront": 30.4 },  // main arc only
    "CCL_CE": { "promenade": 0.0, "bayfront": 1.3, "marina bay": 2.2 },
    ...
  }
}

Interchange stations appear in multiple lines; computeTrainLegDistance routes
through them to find the minimum network distance.

Run: python scripts/build-mrt-distances.py
"""

import json
import math
import re
import urllib.request
from pathlib import Path
from datetime import date

GEOJSON_URL = "https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/v1/sg-rail.geojson"

# Main lines: no branches included.
# terminus="low"  → lowest code number = 0 km
# terminus="high" → highest code number = 0 km
MAIN_LINE_CONFIG = {
    "NSL": {"prefix": "NS", "terminus": "low"},   # NS1 JE → NS28 Marina South Pier
    "EWL": {"prefix": "EW", "terminus": "high"},  # EW33 Tuas Link → EW1 Pasir Ris (no CG)
    "NEL": {"prefix": "NE", "terminus": "low"},   # NE1 HarbourFront → NE18 Punggol Coast
    "CCL": {"prefix": "CC", "terminus": "low"},   # CC1 Dhoby Ghaut → CC29 HarbourFront (no CE)
    "DTL": {"prefix": "DT", "terminus": "low"},   # DT1 Bukit Panjang → DT35 Expo
    "TEL": {"prefix": "TE", "terminus": "low"},   # TE1 Woodlands North → TE29 Bayshore
}

# Branch lines: computed from an anchor station in the parent line.
# The anchor station is at cum=0 in the branch line.
BRANCH_LINE_CONFIG = [
    {
        "name": "EWL_CG",
        "anchor_code": "EW4",  # Tanah Merah — junction station
        "branch_prefix": "CG",
        "terminus": "low",     # CG1 Expo → CG2 Changi Airport
    },
    {
        "name": "CCL_CE",
        "anchor_code": "CC4",  # Promenade — junction station
        "branch_prefix": "CE",
        "terminus": "low",     # CE1 Bayfront → CE2 Marina Bay
    },
]


def haversine(lon1, lat1, lon2, lat2) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def normalize(name: str) -> str:
    return re.sub(r'\s+', ' ', name.strip().lower())


def code_number(code: str) -> float:
    """NS3A → 3.1 so it sorts after NS3 but before NS4."""
    m = re.match(r'^[A-Z]+(\d+)([A-Z]?)$', code)
    if not m:
        return 0
    n = int(m.group(1))
    suffix = m.group(2)
    return n + (0.1 if suffix else 0)


def fetch_geojson(url: str) -> dict:
    print(f"Downloading {url} ...")
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode())


def parse_stations(geojson: dict) -> dict[str, dict]:
    """
    Returns dict: individual_code → {name, norm, lon, lat}.
    Splits combined codes like 'NS1-EW24' on '-'.
    Includes both singapore-mrt and singapore-lrt.singapore-mrt networks.
    """
    by_code: dict[str, dict] = {}
    VALID_NETWORKS = {"singapore-mrt", "singapore-lrt.singapore-mrt"}

    for feature in geojson["features"]:
        props = feature.get("properties", {})
        if props.get("stop_type") != "station":
            continue
        if props.get("network") not in VALID_NETWORKS:
            continue
        geom = feature.get("geometry", {})
        if geom.get("type") != "Point":
            continue

        lon, lat = geom["coordinates"]
        name = props.get("name", "").strip()
        raw_codes = props.get("station_codes", "")

        for part in raw_codes.split("-"):
            part = part.strip()
            if re.match(r'^[A-Z]{1,3}\d+[A-Z]?$', part):
                by_code[part] = {
                    "name": name,
                    "norm": normalize(name),
                    "lon": lon,
                    "lat": lat,
                }

    return by_code


def build_sequence(by_code: dict, prefix: str, terminus: str) -> list[tuple[str, dict]]:
    """Collect stations by prefix, sort by code number asc or desc."""
    seq = [
        (code, info) for code, info in by_code.items()
        if re.match(r'^' + re.escape(prefix) + r'\d', code)
    ]
    seq.sort(key=lambda x: code_number(x[0]), reverse=(terminus == "high"))
    return seq


def compute_cumulative(sequence: list[tuple[str, dict]],
                       start_cum: float = 0.0,
                       prev_info: dict | None = None) -> dict[str, float]:
    """
    Walk sequence, summing Haversine between consecutive stations.
    Returns norm_name → cumulative_km (rounded to 1 dp).
    """
    result: dict[str, float] = {}
    cumulative = start_cum
    prev = prev_info

    for _code, info in sequence:
        if prev is not None:
            cumulative += haversine(prev["lon"], prev["lat"], info["lon"], info["lat"])
        key = info["norm"]
        if key not in result:
            result[key] = round(cumulative, 1)
        prev = info

    return result


def find_by_prefix_num(by_code: dict, prefix: str, num: int) -> dict | None:
    """Find a station info by prefix+number, ignoring combined codes."""
    target = f"{prefix}{num}"
    if target in by_code:
        return by_code[target]
    return None


def main():
    geojson = fetch_geojson(GEOJSON_URL)
    by_code = parse_stations(geojson)
    print(f"Parsed {len(by_code)} individual MRT station codes")

    lines_out: dict[str, dict[str, float]] = {}

    # Build main lines (no branches)
    for line_name, cfg in MAIN_LINE_CONFIG.items():
        seq = build_sequence(by_code, cfg["prefix"], cfg["terminus"])
        if not seq:
            print(f"  WARNING: no stations found for {line_name}")
            continue
        cum = compute_cumulative(seq)
        lines_out[line_name] = cum
        keys = list(cum.keys())
        vals = list(cum.values())
        print(f"  {line_name}: {len(cum)} stations, "
              f"0..{max(vals):.1f} km  "
              f"({keys[0]} .. {keys[-1]})")

    # Build branch lines (anchor is at cum=0)
    for bcfg in BRANCH_LINE_CONFIG:
        anchor_info = by_code.get(bcfg["anchor_code"])
        if anchor_info is None:
            print(f"  WARNING: anchor {bcfg['anchor_code']} not found for {bcfg['name']}")
            continue

        branch_seq = build_sequence(by_code, bcfg["branch_prefix"], bcfg["terminus"])
        if not branch_seq:
            print(f"  WARNING: no stations for prefix '{bcfg['branch_prefix']}'")
            continue

        # Anchor at cum=0 (included so interchange routing finds it), then branch stations
        cum: dict[str, float] = {anchor_info["norm"]: 0.0}
        cum.update(compute_cumulative(branch_seq, start_cum=0.0, prev_info=anchor_info))
        lines_out[bcfg["name"]] = cum
        keys = list(cum.keys())
        vals = list(cum.values())
        print(f"  {bcfg['name']}: {len(cum)} stations, "
              f"anchor={anchor_info['norm']}, "
              f"0..{max(vals):.1f} km  "
              f"({keys[0]} .. {keys[-1]})")

    # Output
    out_path = Path(__file__).parent.parent / "public" / "data" / "mrt-distances.json"
    output = {
        "_notes": (
            f"Per-line cumulative distances (km from terminus). "
            f"Haversine from cheeaun/sgraildata station coordinates. "
            f"Station names lowercase-normalised. "
            f"Branch lines (EWL_CG, CCL_CE) use their junction as cum=0. "
            f"computeTrainLegDistance: same-line = |cum[A]-cum[B]|; "
            f"cross-line = min distance via any shared interchange station. "
            f"Generated {date.today().isoformat()}."
        ),
        "lines": lines_out,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {out_path}")
    print(f"Total lines: {list(lines_out.keys())}")
    total_stations = sum(len(v) for v in lines_out.values())
    print(f"Total station-line entries: {total_stations}")


if __name__ == "__main__":
    main()
