/**
 * NC Zoning Board — Three.js Scene
 * Namespace: NCZ.ThreeScene
 *
 * Manages the WebGL renderer, orthographic camera, OrbitControls,
 * GLB loading (tiered), lighting, and render loop for the schematic 3D view.
 *
 * Camera/coordinate notes (derived from render_terrain_3d.html):
 *   GLB space: X = CET_X, Y = height, Z = -CET_Y
 *   Camera sits high on Y, looks down, up vector = (0, 0, -1) so north faces up.
 *   Cliffs GLB requires a position offset: (-2255, 0, 3050).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

window.NCZ = window.NCZ || {};

const AMBIENT_INTENSITY = 0.35;
const SUN_DIR = new THREE.Vector3(-1, 1.5, -1).normalize();


// World centre in CET space (from Realistic Map mod quad UV mapping)
const WORLD_CX =  ((-6298 + 5815) / 2);   //  -241.5
const WORLD_CY = ((-7684 + 4427) / 2);    // -1628.5
const WORLD_H  = 4427 - (-7684);           //  12111 (CET units)

const ThreeScene = (() => {
  let renderer, camera, scene, controls;
  let animationId = null;
  let initialized = false;
  let loadingEl = null;

  // ── Helpers ────────────────────────────────────────────────────────────

  function readThemeColor(varName, fallback) {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(varName).trim();
    return new THREE.Color(raw || fallback);
  }

  function makeHillshadeMaterial(colorVar, fallback) {
    return new THREE.MeshLambertMaterial({
      color: readThemeColor(colorVar, fallback),
      flatShading: true,
      side: THREE.DoubleSide,
    });
  }

  function makeFlatMaterial(colorVar, fallback) {
    return new THREE.MeshBasicMaterial({
      color: readThemeColor(colorVar, fallback),
      side: THREE.DoubleSide,
    });
  }

  function applyMaterial(root, material) {
    root.traverse(child => {
      if (child.isMesh) child.material = material;
    });
  }

  function loadGLB(path) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(path, gltf => resolve(gltf.scene), undefined, reject);
    });
  }

  function setLoadingText(text) {
    if (loadingEl) loadingEl.textContent = text;
  }

  function hideLoading() {
    if (loadingEl) loadingEl.style.display = 'none';
  }

  // ── Scene init ─────────────────────────────────────────────────────────

  function init(containerId) {
    if (initialized) return;
    initialized = true;

    const container = document.getElementById(containerId);
    loadingEl = container.querySelector('.scene-loading');

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Scene background matches theme primary color
    scene = new THREE.Scene();
    scene.background = readThemeColor('--primary', '#0a192f');

    // Orthographic camera — frustum updated after terrain loads
    const aspect = container.clientWidth / container.clientHeight;
    const frustumH = WORLD_H / 2;
    camera = new THREE.OrthographicCamera(
      -frustumH * aspect, frustumH * aspect,
       frustumH, -frustumH,
      -50000, 50000
    );
    // Positioned above world centre, looking straight down.
    // Z = -WORLD_CY because GLB_Z = -CET_Y.
    camera.position.set(WORLD_CX, 10000, -WORLD_CY);
    camera.lookAt(WORLD_CX, 0, -WORLD_CY);
    camera.up.set(0, 1, 0);  // Standard Three.js up vector
    camera.updateProjectionMatrix();

    // Lighting — hillshade from NW, matching game's DarkEdgeWidth effect
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0 - AMBIENT_INTENSITY);
    dirLight.position.copy(SUN_DIR);
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));

    // OrbitControls — left=pan, right=tilt, middle=zoom
    controls = new OrbitControls(camera, renderer.domElement);
    controls.mouseButtons = {
      LEFT:   THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT:  THREE.MOUSE.ROTATE,
    };
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI * 0.39; // ~70° max tilt
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    controls.target.set(WORLD_CX, 0, -WORLD_CY);
    controls.update();
    controls.addEventListener('change', updateDistrictZoom);

    window.addEventListener('resize', onResize);

    loadTerrain();
  }

  function onResize() {
    if (!renderer) return;
    const container = renderer.domElement.parentElement;
    if (!container || container.style.display === 'none') return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    const aspect = w / h;
    const frustumH = (camera.top - camera.bottom) / 2;
    camera.left   = -frustumH * aspect;
    camera.right  =  frustumH * aspect;
    camera.updateProjectionMatrix();
    // LineMaterial needs the viewport resolution to compute pixel-width lines correctly
    for (const mat of districtLineMaterials) {
      mat.resolution.set(w, h);
    }
  }

  // ── Layer registry ─────────────────────────────────────────────────────
  // Named scene groups — toggled by setLayerVisibility()

  const layers = {
    roads:     null,
    metro:     null,
    districts: null,  // parent group — toggled as a unit
    buildings: null,
  };

  // Sub-groups inside layers.districts (parent group controls overall visibility):
  let _districtOuter = null; // districts with subs — visible when zoomed OUT
  let _districtSub   = null; // canonical subdistricts — visible when zoomed IN

  // OrbitControls orthographic zoom changes camera.zoom (not frustum size).
  // camera.zoom > threshold = zoomed in → swap outer→sub.
  // Tuned to feel equivalent to Leaflet DISTRICT_ZOOM_THRESHOLD=3.
  const SUBDISTRICT_ZOOM_THRESHOLD = 2.5;

  function setLayerVisibility(name, visible) {
    if (name === 'districts') {
      if (layers.districts) layers.districts.visible = visible;
      if (visible) updateDistrictZoom();
      return;
    }
    if (layers[name]) layers[name].visible = visible;
  }

  function updateDistrictZoom() {
    if (!_districtOuter || !_districtSub) return;
    const zoomedIn = camera.zoom > SUBDISTRICT_ZOOM_THRESHOLD;
    _districtOuter.visible = !zoomedIn;
    _districtSub.visible   =  zoomedIn;
  }

  // ── GLB loading (tiered) ───────────────────────────────────────────────

  async function loadTerrain() {
    setLoadingText('Loading terrain...');
    try {
      // Tier 1: terrain + water + cliffs in parallel
      const [terrainScene, waterScene, cliffsScene] = await Promise.all([
        loadGLB('assets/glb/3dmap_terrain.glb'),
        loadGLB('assets/glb/3dmap_water.glb'),
        loadGLB('assets/glb/3dmap_cliffs.glb'),
      ]);

      applyMaterial(terrainScene, makeHillshadeMaterial('--scene-terrain', '#566c88'));
      applyMaterial(waterScene,   makeFlatMaterial('--scene-water',         '#2a3f57'));
      applyMaterial(cliffsScene,  makeHillshadeMaterial('--scene-cliffs',   '#566c88'));


      // Cliffs GLB entity localTransform offset (resolved from WolvenKit export):
      // CET pos (-2255, -3050) → GLB offset X=-2255, Z=+3050
      cliffsScene.position.set(-2255, 0, 3050);

      scene.add(terrainScene, waterScene, cliffsScene);

      // Fit camera frustum to the terrain bounding box
      const box = new THREE.Box3().setFromObject(terrainScene);
      fitCameraToBox(box);

      hideLoading();

      // Tier 2: roads + metro (after terrain, during idle)
      loadRoadsMetro();

      // Tier 2: district lines from subdistricts.json
      loadDistricts();

      // Tier 3: buildings instanced mesh
      loadBuildings();

    } catch (err) {
      console.error('[NCZ] Terrain GLB load failed:', err);
      setLoadingText('Failed to load terrain. Check console for details.');
    }
  }

  async function loadRoadsMetro() {
    try {
      const [roadsScene, metroScene] = await Promise.all([
        loadGLB('assets/glb/3dmap_roads.glb'),
        loadGLB('assets/glb/3dmap_metro.glb'),
      ]);

      // Roads GLB has inverted X axis — rotate 180° around Y to correct
      roadsScene.rotation.y = Math.PI;
      metroScene.rotation.y = Math.PI;




      const roadColor  = readThemeColor('--overlay-road-color',  '#504b41');
      const metroColor = readThemeColor('--overlay-metro-color', '#dcaa28');

      applyMaterial(roadsScene, new THREE.MeshBasicMaterial({ color: roadColor,  transparent: true, opacity: 0.8 }));
      applyMaterial(metroScene, new THREE.MeshBasicMaterial({ color: metroColor, transparent: true, opacity: 0.9 }));

      const roadsGroup = new THREE.Group();
      roadsGroup.add(roadsScene);
      const metroGroup = new THREE.Group();
      metroGroup.add(metroScene);

      layers.roads = roadsGroup;
      layers.metro = metroGroup;

      scene.add(roadsGroup, metroGroup);
    } catch (err) {
      console.error('[NCZ] Roads/metro GLB load failed:', err);
    }
  }

  async function loadDistricts() {
    try {
      const data = await fetch('data/subdistricts.json').then(r => r.json());
      const outerGroup  = new THREE.Group(); // districts with subs — zoom-out only
      const alwaysGroup = new THREE.Group(); // no-sub districts + canonical:false subs — always visible
      const subGroup    = new THREE.Group(); // canonical subdistricts — zoom-in only

      for (const dist of data.districts) {
        const color = new THREE.Color(window.NCZ.DISTRICT_COLORS[dist.id] || '#ffffff');
        const canonicalSubs = (dist.subdistricts || []).filter(s => s.canonical !== false);
        const hasSubs = canonicalSubs.length > 0;

        // District outline — always group if no canonical subs, outer group otherwise
        if (dist.polygon?.length) {
          (hasSubs ? outerGroup : alwaysGroup).add(buildLine(dist.polygon, color, window.NCZ.DISTRICT_LINE_WIDTH));
        }

        for (const sub of dist.subdistricts || []) {
          if (!sub.polygon?.length) continue;
          if (sub.canonical === false) {
            alwaysGroup.add(buildLine(sub.polygon, color, window.NCZ.SUBDISTRICT_LINE_WIDTH)); // casino etc — always visible
          } else {
            subGroup.add(buildLine(sub.polygon, color, window.NCZ.SUBDISTRICT_LINE_WIDTH));    // zoom-gated
          }
        }
      }

      // Wrap all three in a parent so districts toggle works as a unit
      const parent = new THREE.Group();
      parent.add(alwaysGroup, outerGroup, subGroup);
      subGroup.visible  = false;
      outerGroup.visible = true;

      _districtOuter = outerGroup;
      _districtSub   = subGroup;
      layers.districts = parent;
      scene.add(parent);
    } catch (err) {
      console.error('[NCZ] District lines load failed:', err);
    }
  }

  // ── Buildings (Tier 3) ─────────────────────────────────────────────────
  // ~254k instanced cubes. Each instance: [cetX, cetY, cetZ, width, depth, height, brightness, districtIdx]

  async function loadBuildings() {
    try {
      const data = await fetch('data/buildings_3d.json').then(r => r.json());
      const instances = data.instances;
      const count = instances.length;


      const baseColor = readThemeColor('--scene-terrain', '#566c88');
      const geometry  = new THREE.BoxGeometry(1, 1, 1);
      // Buildings and terrain now share CET coordinate space (terrain scaled by GLB_TO_CET).
      // terrainY in the data was raycasted against the scaled-down terrain mesh.
      // Building height (h) is in CET units from the instance texture — needs the same
      // GLB_TO_CET scaling so building proportions match the scaled terrain.
      const buildingColor = readThemeColor('--scene-terrain', '#566c88');
      // MeshBasicMaterial: not affected by light normals — avoids the inverted-Y
      // lighting issue where Lambert shading makes the camera-facing face dark.
      const material = new THREE.MeshBasicMaterial({ color: buildingColor });
      const mesh     = new THREE.InstancedMesh(geometry, material, count);
      mesh.renderOrder = 1;

      const dummy = new THREE.Object3D();
      const color = new THREE.Color();

      for (let i = 0; i < count; i++) {
        const inst = instances[i];
        const cetX    = inst[0];
        const cetY    = inst[1];
        const surfY   = inst[2];  // terrain surface Y from raycast
        const width   = inst[3];
        const depth   = inst[4];
        const height  = inst[5];
        const brightness = inst[6];
        // inst[7] = districtIdx
        const yaw     = inst[8] || 0;  // radians, rotation around game Z (= Three.js Y)

        const h = Math.max(height, 0.5);

        // surfY = terrain surface Y from raycast. Position center at surfY + h/2
        // so box base sits on terrain surface.
        dummy.position.set(cetX, surfY + h / 2, -cetY);
        // Yaw rotation: game Z-axis rotation = Three.js Y-axis rotation
        // Game uses CET where Z is up; Three.js Y is up. Same rotation axis.
        dummy.rotation.set(0, yaw, 0);  // CET Z-up yaw → Three.js Y-up rotation (same direction)
        dummy.scale.set(width, h, depth);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        const b = 0.5 + brightness * 0.6;
        color.setRGB(
          Math.min(baseColor.r * b, 1),
          Math.min(baseColor.g * b, 1),
          Math.min(baseColor.b * b, 1),
        );
        mesh.setColorAt(i, color);
      }

      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate  = true;

      layers.buildings = mesh;
      scene.add(mesh);
      console.log(`[NCZ] Buildings: ${count.toLocaleString()} instances loaded`);
    } catch (err) {
      console.error('[NCZ] Buildings load failed:', err);
    }
  }

  // District line materials — stored so resolution can be updated on resize
  const districtLineMaterials = [];

  // Build a Line2 (fat line) from CET [x, y] ring points.
  // depthTest:false means lines always render over terrain, matching the game's UI overlay approach.
  function buildLine(ring, color, lineWidth) {
    const positions = [];
    for (const pt of ring) positions.push(pt[0], 0, -pt[1]);
    // Close the ring
    if (ring.length > 0) positions.push(ring[0][0], 0, -ring[0][1]);

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    const { clientWidth: w, clientHeight: h } = renderer.domElement;
    const material = new LineMaterial({
      color,
      linewidth: lineWidth,
      resolution: new THREE.Vector2(w, h),
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    districtLineMaterials.push(material);

    const line = new Line2(geometry, material);
    line.computeLineDistances();
    return line;
  }

  function fitCameraToBox(box) {
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z);
    const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;

    camera.left   = -maxDim * aspect / 2;
    camera.right  =  maxDim * aspect / 2;
    camera.top    =  maxDim / 2;
    camera.bottom = -maxDim / 2;
    camera.updateProjectionMatrix();

    controls.target.set(center.x, 0, center.z);
    camera.position.set(center.x, 10000, center.z);
    camera.lookAt(center.x, 0, center.z);
    controls.update();
  }

  // ── Render loop ────────────────────────────────────────────────────────

  const tiltDisplay = document.getElementById('scene-tilt-display');

  function renderLoop() {
    animationId = requestAnimationFrame(renderLoop);
    controls.update();
    renderer.render(scene, camera);
    // Compute tilt: 0° = horizontal, 90° = straight down (top-down)
    // Convert OrbitControls polarAngle (distance from up vector) to camera tilt angle
    // tilt = 90° - polarAngle
    if (tiltDisplay) {
      const polarDegrees = controls.getPolarAngle() * 180 / Math.PI;
      const tilt = Math.round(90 - polarDegrees);
      tiltDisplay.textContent = `Tilt: ${tilt}°`;
    }
  }

  function startRenderLoop() {
    if (animationId === null) renderLoop();
  }

  function stopRenderLoop() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  // ── Theme update ───────────────────────────────────────────────────────
  // Called by app.js when the user switches theme.

  function resetCamera() {
    if (!controls) return;
    const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
    const frustumH = WORLD_H / 2;
    camera.left   = -frustumH * aspect;
    camera.right  =  frustumH * aspect;
    camera.top    =  frustumH;
    camera.bottom = -frustumH;
    camera.updateProjectionMatrix();

    // Reset to top-down view: target at sea level, camera directly above
    controls.target.set(WORLD_CX, 0, -WORLD_CY);
    camera.position.set(WORLD_CX, 10000, -WORLD_CY);
    camera.lookAt(WORLD_CX, 0, -WORLD_CY);
    camera.up.set(0, 1, 0);

    // Reset OrbitControls state (polar angle = π/2 for top-down)
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0;
    controls.update();
  }

  function updateMaterials() {
    if (!scene) return;
    scene.background = readThemeColor('--primary', '#0a192f');
    // Material updates for individual meshes come in Phase 6
    // (requires storing material refs — deferred to keep Phase 1 focused)
  }

  return { init, startRenderLoop, stopRenderLoop, resetCamera, setLayerVisibility, updateMaterials };
})();

window.NCZ.ThreeScene = ThreeScene;
