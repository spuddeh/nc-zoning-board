"""
fix_building_heights.py
=======================
Sets building Y (elevation) in buildings_3d.json by raycasting down against the
terrain mesh at each building's CET XZ position.

The terrain GLB is exported at ~1.32× CET scale. This script scales the terrain
mesh down to CET space before raycasting, so building CET coordinates can be used
directly as query points.

Method:
  1. Load 3dmap_terrain.glb
  2. Scale all vertices by 1/GLB_SCALE to bring terrain into CET coordinate space
  3. For each building (cetX, -cetY), raycast downward to find terrain surface Y
  4. Replace the cetZ field in buildings_3d.json with the terrain surface Y (in CET-scaled space)

The Three.js scene also applies the same 1/GLB_SCALE to all GLB meshes,
so the terrain Y values from this script match what Three.js renders.

Usage:
  python scripts/fix_building_heights.py

Output:
  data/buildings_3d.json (updated in-place, field index 2 replaced)
"""

import json
import os
import sys
import time

import numpy as np
import trimesh

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT   = os.path.dirname(SCRIPT_DIR)
TERRAIN_GLB = os.path.join(REPO_ROOT, 'assets', 'glb', '3dmap_terrain.glb')
JSON_PATH   = os.path.join(REPO_ROOT, 'data', 'buildings_3d.json')

# Terrain GLB is exported at this scale relative to CET game coordinates.
# Derived from: terrain X range (15998) / CET X range (12113) = 1.3207
# Same ratio holds for Z axis. Y (height) is also scaled.
GLB_SCALE = 1.3209


def main():
    print('Loading terrain GLB...')
    t0 = time.time()
    scene = trimesh.load(TERRAIN_GLB)

    # Combine all meshes into one, applying any scene graph transforms
    if hasattr(scene, 'geometry'):
        meshes = []
        for name, geom in scene.geometry.items():
            # Apply the node transform if present
            try:
                transform = scene.graph[name][0]
                geom = geom.apply_transform(transform)
            except (KeyError, TypeError):
                pass
            meshes.append(geom)
        combined = trimesh.util.concatenate(meshes)
    else:
        combined = scene

    print(f'  {len(combined.vertices):,} vertices, {len(combined.faces):,} faces loaded in {time.time()-t0:.1f}s')

    # NO scaling — terrain GLB and CET share the same coordinate space.
    # The terrain extends beyond the CET playable bounds (ocean, outer badlands)
    # but within the playable area the coordinates are 1:1.

    verts = combined.vertices
    print(f'  Scaled X: [{verts[:,0].min():.0f}, {verts[:,0].max():.0f}]')
    print(f'  Scaled Y: [{verts[:,1].min():.0f}, {verts[:,1].max():.0f}]')
    print(f'  Scaled Z: [{verts[:,2].min():.0f}, {verts[:,2].max():.0f}]')

    # Validation: check terrain surface at known CET ground points
    # In CET-scaled terrain: query at (CET_X, -CET_Y), expect terrain surface Y near CET Z
    print('\nValidation (raycast at known CET positions):')
    known = [
        ('Pier (Heywood)',     -2635.3,  563.8,   7.8),
        ('Koi Fish (City Ctr)', -1425.9,  73.8,  30.3),
        ('Nash (Badlands)',     2159.5, -261.8,  68.2),
    ]
    for name, qx, qz, player_z in known:
        # Raycast downward from high above
        origins = np.array([[qx, 5000.0, qz]])
        directions = np.array([[0.0, -1.0, 0.0]])
        locations, index_ray, index_tri = combined.ray.intersects_location(origins, directions)
        if len(locations) > 0:
            # Take highest hit (closest to camera from above)
            hit_y = locations[:, 1].max()
            print(f'  {name}: terrain Y={hit_y:.2f}, player CET Z={player_z} (diff={hit_y-player_z:.1f})')
        else:
            print(f'  {name}: NO HIT at X={qx}, Z={qz}')

    # Load buildings
    print('\nLoading buildings_3d.json...')
    with open(JSON_PATH, encoding='utf-8') as f:
        data = json.load(f)
    instances = data['instances']
    count = len(instances)
    print(f'  {count:,} instances')

    # Batch raycast: shoot rays downward at each building XZ
    print('Raycasting terrain Y at all building positions...')
    t0 = time.time()

    # Building positions: cetX at index 0, cetY at index 1
    # Three.js/GLB: X = cetX, Z = -cetY
    origins = np.array([[inst[0], 5000.0, -inst[1]] for inst in instances])
    directions = np.tile([0.0, -1.0, 0.0], (count, 1))

    # trimesh batch ray intersection
    locations, index_ray, index_tri = combined.ray.intersects_location(origins, directions)

    # Group hits by ray index, take highest Y for each
    terrain_y = np.full(count, np.nan)
    if len(locations) > 0:
        for loc, ray_idx in zip(locations, index_ray):
            if np.isnan(terrain_y[ray_idx]) or loc[1] > terrain_y[ray_idx]:
                terrain_y[ray_idx] = loc[1]

    hit_count = np.count_nonzero(~np.isnan(terrain_y))
    miss_count = count - hit_count
    print(f'  Done in {time.time()-t0:.1f}s: {hit_count:,} hits, {miss_count:,} misses')

    # For misses, fall back to nearest vertex Y
    if miss_count > 0:
        print(f'  Falling back to nearest-vertex for {miss_count:,} misses...')
        from scipy.spatial import KDTree
        xz = verts[:, [0, 2]]
        tree = KDTree(xz)
        miss_mask = np.isnan(terrain_y)
        miss_xz = np.array([[instances[i][0], -instances[i][1]] for i in range(count) if miss_mask[i]])
        _, miss_idx = tree.query(miss_xz)
        j = 0
        for i in range(count):
            if miss_mask[i]:
                terrain_y[i] = verts[miss_idx[j], 1]
                j += 1

    # Update buildings_3d.json with terrain surface Y (raw, not negated)
    print('Updating building Y positions...')
    for i, inst in enumerate(instances):
        inst[2] = round(float(terrain_y[i]), 2)

    print(f'Writing {JSON_PATH}...')
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))
    size_mb = os.path.getsize(JSON_PATH) / (1024 * 1024)
    print(f'Done -- {size_mb:.1f} MB')

    # Summary stats
    print(f'\nTerrain Y stats: min={terrain_y.min():.1f} max={terrain_y.max():.1f} mean={terrain_y.mean():.1f}')


if __name__ == '__main__':
    main()
