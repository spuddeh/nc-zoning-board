"""
Regenerate data/subdistricts.json with proper parent-chain transforms.

Walks the full parent transform chain for each trigger component, applying
rotation and translation at each level. This correctly handles:
  - Pacifica (65 degree yaw rotation in pacifica_transform)
  - Pacifica sub-districts (coastview, west_wind_estate — also rotated)
  - NCX/Spaceport (parented to morro_rock_trigger)
  - Dogtown (chains through pacifica_data0633)
"""
import json
import math
import os
import sys

ENT_JSON_PATH = r"D:\Modding\CP2077 Mods\MyMods\map_data_export\source\raw\base\entities\cameras\3dmap\3dmap_view.ent.json"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_PATH = os.path.join(REPO_ROOT, "data", "subdistricts.json")


# District structure with sub-districts and their trigger names
DISTRICT_STRUCTURE = [
    {
        "id": "city_center", "name": "City Center", "trigger": "city_center_trigger",
        "subdistricts": [
            {"id": "corpo_plaza", "name": "Corporate Plaza", "trigger": "corpo_plaza_trigger"},
            {"id": "downtown", "name": "Downtown", "trigger": "downtown_trigger"},
        ]
    },
    {
        "id": "watson", "name": "Watson", "trigger": "watson_trigger",
        "subdistricts": [
            {"id": "arasaka_waterfront", "name": "Arasaka Waterfront", "trigger": "arasaka_waterfront_trigger"},
            {"id": "northside", "name": "Northside Industrial District", "trigger": "northside_trigger"},
            {"id": "kabuki", "name": "Kabuki", "trigger": "kabuki_trigger"},
            {"id": "little_china", "name": "Little China", "trigger": "little_china_trigger"},
        ]
    },
    {
        "id": "westbrook", "name": "Westbrook", "trigger": "westbrook_trigger",
        "subdistricts": [
            {"id": "japan_town", "name": "Japantown", "trigger": "japan_town_trigger"},
            {"id": "north_oak", "name": "North Oak", "trigger": "north_oak_trigger"},
            {"id": "charter_hill", "name": "Charter Hill", "trigger": "charter_hill_trigger"},
        ]
    },
    {
        "id": "heywood", "name": "Heywood", "trigger": "heywood_trigger",
        "subdistricts": [
            {"id": "wellspring", "name": "Wellsprings", "trigger": "wellspring_trigger"},
            {"id": "glen", "name": "The Glen", "trigger": "glen_trigger"},
            {"id": "vista_del_rey", "name": "Vista Del Rey", "trigger": "vista_del_rey_trigger"},
        ]
    },
    {
        "id": "santo_domingo", "name": "Santo Domingo", "trigger": "santo_domingo_trigger",
        "subdistricts": [
            {"id": "arroyo", "name": "Arroyo", "trigger": "arroyo_trigger"},
            {"id": "rancho_coronado", "name": "Rancho Coronado", "trigger": "rancho_coronado_trigger"},
        ]
    },
    {
        "id": "pacifica", "name": "Pacifica", "trigger": "pacifica_trigger",
        "subdistricts": [
            {"id": "coastview", "name": "Coastview", "trigger": "coastview_trigger"},
            {"id": "west_wind_estate", "name": "West Wind Estate", "trigger": "west_wind_estate_trigger"},
        ]
    },
    {
        "id": "dogtown", "name": "Dogtown", "trigger": "dogtown_trigger",
        "subdistricts": []
    },
    {
        # NCX trigger and morro_rock_trigger share the exact same outline —
        # NCX is parented to morro_rock_trigger. They're the same area.
        "id": "ncx_morro_rock", "name": "NCX Spaceport / Morro Rock", "trigger": "ncx_trigger",
        "subdistricts": []
    },
]


def main():
    if not os.path.exists(ENT_JSON_PATH):
        print(f"ERROR: .ent JSON not found: {ENT_JSON_PATH}")
        sys.exit(1)

    with open(ENT_JSON_PATH, "r") as f:
        data = json.load(f)

    chunks = data["Data"]["RootChunk"]["compiledData"]["Data"]["Chunks"]

    # Build component lookup by name
    components = {}
    for chunk in chunks:
        name = chunk.get("name", {})
        if isinstance(name, dict):
            name = name.get("$value", "")
        if name:
            components[name] = chunk

    def get_local_transform(comp):
        lt = comp.get("localTransform", {})
        pos = lt.get("Position", {})
        ori = lt.get("Orientation", {})
        tx = pos.get("x", {}).get("Bits", 0) / 131072.0
        ty = pos.get("y", {}).get("Bits", 0) / 131072.0
        qr = ori.get("r", 1.0)
        qi = ori.get("i", 0.0)
        qj = ori.get("j", 0.0)
        qk = ori.get("k", 0.0)
        yaw = math.atan2(2.0 * (qr * qk + qi * qj),
                         1.0 - 2.0 * (qj * qj + qk * qk))
        return tx, ty, yaw

    def get_parent_name(comp):
        pt = comp.get("parentTransform", {})
        if not pt or not isinstance(pt, dict):
            return None
        pd = pt.get("Data", {})
        if not pd:
            return None
        bn = pd.get("bindName", {})
        return bn.get("$value", None) if bn else None

    def compute_world_points(comp):
        """Walk parent chain, apply rotate+translate at each level."""
        outline = comp["outline"]["Data"]["points"]
        chain = []
        current = comp
        while current is not None:
            tx, ty, yaw = get_local_transform(current)
            chain.append((tx, ty, yaw))
            pn = get_parent_name(current)
            current = components.get(pn) if pn else None

        pts = [(p["X"], p["Y"]) for p in outline]
        for tx, ty, yaw in chain:
            if abs(yaw) > 1e-6:
                cos_a = math.cos(yaw)
                sin_a = math.sin(yaw)
                pts = [(x * cos_a - y * sin_a, x * sin_a + y * cos_a)
                       for x, y in pts]
            if abs(tx) > 1e-6 or abs(ty) > 1e-6:
                pts = [(x + tx, y + ty) for x, y in pts]
        return [[round(x, 2), round(y, 2)] for x, y in pts]

    def find_trigger(trigger_name):
        for chunk in chunks:
            if chunk.get("$type") == "gameStaticTriggerAreaComponent":
                if chunk["name"]["$value"] == trigger_name:
                    return chunk
        return None

    # Build output
    output = {
        "description": (
            "District and sub-district boundary polygons extracted from "
            "CP2077 3dmap_view.ent trigger areas. Coordinates are in CET "
            "world-space (game coordinates). Full parent transform chain "
            "(rotation + translation) applied."
        ),
        "source": "base/entities/cameras/3dmap/3dmap_view.ent.json",
        "districts": []
    }

    for dist in DISTRICT_STRUCTURE:
        comp = find_trigger(dist["trigger"])
        if not comp:
            print(f"WARNING: trigger not found: {dist['trigger']}")
            continue

        polygon = compute_world_points(comp)
        xs = [p[0] for p in polygon]
        ys = [p[1] for p in polygon]
        print(f"{dist['id']:20s} {len(polygon):3d} pts  "
              f"X [{min(xs):8.0f}, {max(xs):8.0f}]  "
              f"Y [{min(ys):8.0f}, {max(ys):8.0f}]")

        district_entry = {
            "id": dist["id"],
            "name": dist["name"],
            "trigger": dist["trigger"],
            "polygon": polygon,
            "subdistricts": []
        }

        for sub in dist["subdistricts"]:
            sub_comp = find_trigger(sub["trigger"])
            if not sub_comp:
                print(f"  WARNING: sub-trigger not found: {sub['trigger']}")
                continue
            sub_polygon = compute_world_points(sub_comp)
            sxs = [p[0] for p in sub_polygon]
            sys_ = [p[1] for p in sub_polygon]
            print(f"  {sub['id']:18s} {len(sub_polygon):3d} pts  "
                  f"X [{min(sxs):8.0f}, {max(sxs):8.0f}]  "
                  f"Y [{min(sys_):8.0f}, {max(sys_):8.0f}]")
            district_entry["subdistricts"].append({
                "id": sub["id"],
                "name": sub["name"],
                "trigger": sub["trigger"],
                "polygon": sub_polygon,
            })

        output["districts"].append(district_entry)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nWritten {OUTPUT_PATH}")
    total_districts = len(output["districts"])
    total_subs = sum(len(d["subdistricts"]) for d in output["districts"])
    print(f"  {total_districts} districts, {total_subs} sub-districts")


if __name__ == "__main__":
    main()
