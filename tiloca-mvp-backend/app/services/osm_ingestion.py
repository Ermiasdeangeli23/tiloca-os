import json
import math
import urllib.parse
import urllib.request


def fetch_industrial_buildings(
    bbox: tuple[float, float, float, float],
    min_area_mq: int = 2000,
) -> list[dict]:
    lat_min, lon_min, lat_max, lon_max = bbox
    query = f"""
[out:json][timeout:60];
(
  way["building"~"industrial|warehouse|factory|manufacture|shed"]
     ({lat_min},{lon_min},{lat_max},{lon_max});
  way["building"="yes"]["landuse"="industrial"]
     ({lat_min},{lon_min},{lat_max},{lon_max});
);
out body geom;
"""
    url = "https://overpass-api.de/api/interpreter"
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(url, data=data)
    req.add_header("User-Agent", "TilocaScanner/2.0")

    with urllib.request.urlopen(req, timeout=70) as resp:
        result = json.loads(resp.read())

    buildings = []
    for el in result.get("elements", []):
        if el.get("type") != "way" or not el.get("geometry"):
            continue

        coords = [(node["lon"], node["lat"]) for node in el["geometry"]]
        if len(coords) < 3:
            continue
        if coords[0] != coords[-1]:
            coords.append(coords[0])

        area_deg = 0.0
        for i in range(len(coords) - 1):
            area_deg += coords[i][0] * coords[i + 1][1]
            area_deg -= coords[i + 1][0] * coords[i][1]
        area_deg = abs(area_deg) / 2

        lat_mid = (lat_min + lat_max) / 2
        area_mq = area_deg * (111320**2) * math.cos(math.radians(lat_mid))
        if area_mq < min_area_mq:
            continue

        lat_c = sum(node["lat"] for node in el["geometry"]) / len(el["geometry"])
        lon_c = sum(node["lon"] for node in el["geometry"]) / len(el["geometry"])
        tags = el.get("tags", {})

        buildings.append(
            {
                "osm_id": str(el["id"]),
                "lat": round(lat_c, 6),
                "lon": round(lon_c, 6),
                "area_mq": int(area_mq),
                "name": tags.get("name") or None,
                "building_type": tags.get("building") or None,
                "address": f"{tags.get('addr:street', '')} {tags.get('addr:housenumber', '')} {tags.get('addr:city', '')}".strip()
                or None,
                "tags": tags,
                "footprint_coords": coords,
            }
        )

    buildings.sort(key=lambda item: item["area_mq"], reverse=True)
    return buildings
