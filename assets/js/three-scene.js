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
  let _dirLight      = null; // stored so setSunPosition can update it live
  let _ambLight      = null;
  let _shadowsOn     = false; // tracks the checkbox state — off by default
  let _sunSphere     = null; // visible sun disc — shown during showcase only
  let _sunAz = Math.PI * 0.25, _sunEl = Math.PI * 0.35; // last setSunPosition args

  // Material refs — stored so updateMaterials() can re-apply theme colors live
  let terrainMat = null;
  let waterMat   = null;
  let cliffsMat  = null;
  let roadsMat   = null;
  let metroMat   = null;
  let buildingMeshes     = [];    // one InstancedMesh per district
  let buildingMaterials  = [];    // parallel ShaderMaterial array for theme updates

  // District metadata — sourced directly from 3dmap_triangle_soup.Material.json.
  // dataDds: _data.dds (DXGI_FORMAT_R16G16B16A16_UNORM — raw 16-bit RGBA instance data)
  // mDds:    _m.dds   (DXGI_FORMAT_R8_UNORM — 8-bit greyscale surface detail, 10 mips)
  // transMin/transMax: district-local CET XYZ bounds (before district offset)
  // offset: world XY offset applied to decoded positions (no Z offset)
  // cubeSize: half-extent multiplier (from CubeSize shader parameter)
  const DISTRICT_META = [
    { name: 'westbrook',     dataDds: 'assets/dds/westbrook_data.dds',    mDds: 'assets/dds/westbrook_m.dds',    cubeSize: 197.0,        transMin: [-1078.94739, -1148.69434, -18.4205875],  transMax: [1155.12,      1562.87903,  507.894714],  offset: [  -97.209,    590.849] },
    { name: 'city_center',   dataDds: 'assets/dds/city_center_data.dds',  mDds: 'assets/dds/city_center_m.dds',  cubeSize: 168.289993,   transMin: [ -770.609192, -530.549133, -40.6581497],  transMax: [1316.82483,    649.75531,  642.893127],  offset: [-2116.637,    106.508] },
    { name: 'heywood',       dataDds: 'assets/dds/heywood_data.dds',      mDds: 'assets/dds/heywood_m.dds',      cubeSize: 197.236832,   transMin: [-1080.35107,  -418.153046, -38.4002304],  transMax: [1136.94556,   1372.15979,  374.181305],  offset: [-1576.732,  -1002.811] },
    { name: 'pacifica',      dataDds: 'assets/dds/pacifica_data.dds',     mDds: 'assets/dds/pacifica_m.dds',     cubeSize: 305.600006,   transMin: [-4008.396,   -4575.14941, -51.9539986],  transMax: [8258.31641,   7254.10059,  264.306946],  offset: [-2422.441,  -2368.156] },
    { name: 'santo_domingo', dataDds: 'assets/dds/santo_domingo_data.dds',mDds: 'assets/dds/santo_domingo_m.dds',cubeSize: 139.342102,   transMin: [-1328.95288, -1880.02502, -37.5960007],  transMax: [1555.26318,   1369.01294,  332.348328],  offset: [  -15.944,  -1610.080] },
    { name: 'watson',        dataDds: 'assets/dds/watson_data.dds',       mDds: 'assets/dds/watson_m.dds',       cubeSize: 237.175003,   transMin: [-1254.46997, -1258.68469, -24.7028503],  transMax: [1988.5448,    2032.52405,  475.268005],  offset: [-1979.372,   1873.951] },
    { name: 'ep1_dogtown',   dataDds: 'assets/dds/dogtown_data.dds',      mDds: 'assets/dds/dogtown_m.dds',      cubeSize: 198.020691,   transMin: [-2650.0,     -3126.6084,   -0.750015974], transMax: [-1025.51855, -1803.58118,  493.576111],  offset: [    0.0,        0.0  ] },
    { name: 'ep1_spaceport', dataDds: 'assets/dds/spaceport_data.dds',    mDds: 'assets/dds/spaceport_m.dds',    cubeSize: 115.298218,   transMin: [-1168.5874,   -765.104614, -41.4592323],  transMax: [1219.45483,   1018.70129,  296.498138],  offset: [-4200.000,    200.000] },
  ];

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

  // ── DDS loaders ─────────────────────────────────────────────────────────
  // DDS files exported by WolvenKit use DX10 extended headers (FourCC='DX10').
  // Standard header = 128 bytes, DX10 extension = 20 bytes → pixel data at offset 148.
  // _data.dds: DXGI_FORMAT_R16G16B16A16_UNORM — raw 16-bit RGBA, 1 mip, no compression.
  // _m.dds:    DXGI_FORMAT_R8_UNORM            — 8-bit greyscale, 10 mips, no compression.
  const DDS_PIXEL_OFFSET = 148;

  // Load _data.dds → Uint16Array of raw 16-bit RGBA pixel values.
  // Width and height are read from the DDS header (offsets 16 and 12).
  async function loadDataDds(path) {
    const buf    = await fetch(path).then(r => r.arrayBuffer());
    const header = new Uint32Array(buf, 0, 32);
    const width  = header[4];   // DDS header offset 16 = uint32 index 4
    const height = header[3];   // DDS header offset 12 = uint32 index 3
    const pixels = new Uint16Array(buf, DDS_PIXEL_OFFSET);
    return { pixels, width, height };
  }

  // Load _m.dds → DataTexture (mip 0 only, WebGL generates the rest).
  // R8_UNORM: each pixel is one uint8 byte, normalised to [0,1] on GPU.
  async function loadMDds(path) {
    const buf    = await fetch(path).then(r => r.arrayBuffer());
    const header = new Uint32Array(buf, 0, 32);
    const width  = header[4];
    const height = header[3];
    const mip0   = new Uint8Array(buf, DDS_PIXEL_OFFSET, width * height);
    const tex    = new THREE.DataTexture(mip0, width, height, THREE.RedFormat, THREE.UnsignedByteType);
    tex.flipY = true;  // WolvenKit corrects VFlip on export; flipY matches TextureLoader convention
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
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

    // Renderer — pass updateStyle:false so Three.js never writes px dimensions
    // onto the canvas element. The canvas is kept at width/height:100% in CSS
    // so it always fills #map-3d without ever pushing surrounding layout elements.
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    // Take the canvas out of document flow so its pixel-buffer dimensions
    // can never push or displace surrounding layout elements.
    // inset:0 stretches it to fill #map-3d on all four sides — no explicit
    // width/height needed (and adding them alongside inset:0 can cause squishing).
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset    = '0';
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

    // Lighting — direction set to current real sun position via SunCalc if available,
    // otherwise falls back to the default NW hillshade direction.
    _dirLight = new THREE.DirectionalLight(0xffffff, 1.0 - AMBIENT_INTENSITY);
    _dirLight.position.copy(SUN_DIR).multiplyScalar(8000);

    // Shadow map: 4096² covers the ~14 000-unit world at ~3.4 units/texel.
    // Frustum centred on Night City (WORLD_CX, 0, -WORLD_CY).
    _dirLight.castShadow                    = false; // off by default; checkbox enables it
    _dirLight.shadow.mapSize.set(4096, 4096);
    _dirLight.shadow.camera.left            = -7000;
    _dirLight.shadow.camera.right           =  7000;
    _dirLight.shadow.camera.top             =  7000;
    _dirLight.shadow.camera.bottom          = -7000;
    _dirLight.shadow.camera.near            =    10;
    _dirLight.shadow.camera.far             = 25000;
    _dirLight.shadow.bias                   = -0.001;
    _dirLight.shadow.normalBias             =  0.02;

    // Centre the shadow frustum on Night City, not the world origin
    _dirLight.target.position.set(WORLD_CX, 0, -WORLD_CY);

    scene.add(_dirLight);
    scene.add(_dirLight.target);
    _ambLight = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
    scene.add(_ambLight);
    // Sun position is applied by app.js via the slider once terrain has loaded.

    // Visible sun sphere — hidden by default, shown during showcase only.
    // Radius 600 units at 20 000 distance ≈ 1.7° apparent diameter (≈3× real sun).
    _sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(600, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 })
    );
    _sunSphere.visible = false;
    scene.add(_sunSphere);

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
    renderer.setSize(w, h, false); // updateStyle:false — CSS width/height stay at 100%
    const aspect = w / h;
    const frustumH = (camera.top - camera.bottom) / 2;
    camera.left   = -frustumH * aspect;
    camera.right  =  frustumH * aspect;
    camera.updateProjectionMatrix();
    // flyCamera resize is handled in flyover.js
    // LineMaterial needs the viewport resolution to compute pixel-width lines correctly
    for (const mat of districtLineMaterials) {
      mat.resolution.set(w, h);
    }
  }

  // ── Layer registry ─────────────────────────────────────────────────────
  // Named scene groups — toggled by setLayerVisibility()

  const layers = {
    terrain:   null,
    water:     null,
    cliffs:    null,
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

      terrainMat = makeHillshadeMaterial('--scene-terrain', '#566c88');
      waterMat   = makeHillshadeMaterial('--scene-water',     '#2a3f57');
      cliffsMat  = makeHillshadeMaterial('--scene-cliffs',   '#566c88');
      applyMaterial(terrainScene, terrainMat);
      applyMaterial(waterScene,   waterMat);
      applyMaterial(cliffsScene,  cliffsMat);

      // Shadow flags — terrain and cliffs cast and receive (hills shadow valleys);
      // water receives only (no hard shadow edges on flat ocean); buildings skipped.
      terrainScene.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      waterScene.traverse(c =>   { if (c.isMesh) { c.receiveShadow = true; } });
      cliffsScene.traverse(c =>  { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });



      // Cliffs GLB entity localTransform offset (resolved from WolvenKit export):
      // CET pos (-2255, -3050) → GLB offset X=-2255, Z=+3050
      cliffsScene.position.set(-2255, 0, 3050);

      layers.terrain = terrainScene;
      layers.water   = waterScene;
      layers.cliffs  = cliffsScene;
      scene.add(terrainScene, waterScene, cliffsScene);

      // Fit camera frustum to the terrain bounding box
      const box = new THREE.Box3().setFromObject(terrainScene);
      fitCameraToBox(box);

      hideLoading();

      // Trigger the sun slider so app.js applies the correct initial sun position.
      // Done here (post-terrain) because ThreeScene.setSunPosition now exists and
      // the directional light is in the scene — the slider fires too early otherwise.
      document.getElementById('scene-sun-slider')?.dispatchEvent(new Event('input'));

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

      roadsMat = new THREE.MeshBasicMaterial({ color: roadColor,  transparent: true, opacity: 0.8 });
      metroMat = new THREE.MeshBasicMaterial({ color: metroColor, transparent: true, opacity: 0.9 });
      applyMaterial(roadsScene, roadsMat);
      applyMaterial(metroScene, metroMat);

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

  // ── Buildings ──────────────────────────────────────────────────────────
  // CPU decodes _data.dds (16-bit RGBA) → InstancedMesh matrices.
  // MeshLambertMaterial + onBeforeCompile adds _m.dds planar UV and edge highlight.
  // Shadow casting/receiving handled automatically by Three.js.

  async function loadBuildings() {
    try {
      const baseGeo = new THREE.BoxGeometry(1, 1, 1);
      const group   = new THREE.Group();
      const dummy   = new THREE.Object3D();

      for (const meta of DISTRICT_META) {
        setLoadingText(`Loading buildings [${meta.name}]…`);

        // ── _data.dds → CPU decode → instance matrices ─────────────────
        const { pixels, width: texW, height: texH } = await loadDataDds(meta.dataDds);
        const blockW = Math.floor(texW / 3);
        const blockH = Math.min(texH, blockW);

        // Pre-allocate mesh for max possible instances; trim count after decode.
        const mat  = buildBuildingMaterial(meta, await loadMDds(meta.mDds));
        const mesh = new THREE.InstancedMesh(baseGeo, mat, blockW * blockH);

        let validCount = 0;
        for (let y = 0; y < blockH; y++) {
          for (let x = 0; x < blockW; x++) {
            const pi = (y * texW + x)           * 4;   // position block
            const ri = (y * texW + x + blockW)  * 4;   // rotation block
            const si = (y * texW + x + 2*blockW)* 4;   // scale block

            if (pixels[pi + 3] < 655) continue;  // alpha < ~1% → invalid slot

            // Decode position → CET world space
            const pr = pixels[pi+0] / 65535.0, pg = pixels[pi+1] / 65535.0, pb = pixels[pi+2] / 65535.0;
            const cetX = meta.transMin[0] + (meta.transMax[0] - meta.transMin[0]) * pr + meta.offset[0];
            const cetY = meta.transMin[1] + (meta.transMax[1] - meta.transMin[1]) * pg + meta.offset[1];
            const cetZ = meta.transMin[2] + (meta.transMax[2] - meta.transMin[2]) * pb;

            // Decode quaternion: [0,65535] → [-1,1], remap CET Z-up → Three.js Y-up
            const qr = pixels[ri+0]/65535*2-1, qg = pixels[ri+1]/65535*2-1;
            const qb = pixels[ri+2]/65535*2-1, qa = pixels[ri+3]/65535*2-1;
            const ql = Math.hypot(qr, qg, qb, qa) || 1;
            // CET (qx,qy,qz,qw) → Three.js (qx, qz, -qy, qw)
            dummy.quaternion.set(qr/ql, qb/ql, -qg/ql, qa/ql);

            // Decode scale → CET half-extents → Three.js full extents (CET X→X, Z→Y, Y→Z)
            const hx = pixels[si+0]/65535.0 * meta.cubeSize;
            const hy = pixels[si+1]/65535.0 * meta.cubeSize;
            const hz = pixels[si+2]/65535.0 * meta.cubeSize;

            dummy.position.set(cetX, cetZ, -cetY);       // CET → Three.js
            dummy.scale.set(hx * 2, hz * 2, hy * 2);    // CET X→X, Z→Y, Y→Z
            dummy.updateMatrix();
            mesh.setMatrixAt(validCount++, dummy.matrix);
          }
        }

        mesh.count = validCount;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow    = true;
        mesh.receiveShadow = true;

        group.add(mesh);
        buildingMeshes.push(mesh);
        buildingMaterials.push(mat);
        console.log(`[NCZ] Buildings [${meta.name}]: ${validCount.toLocaleString()} instances`);
      }

      layers.buildings = group;
      scene.add(group);
      console.log(`[NCZ] Buildings: ${DISTRICT_META.length} districts loaded`);
    } catch (err) {
      console.error('[NCZ] Buildings load failed:', err);
    }
  }

  // Build the MeshLambertMaterial for one district.
  // onBeforeCompile patches the standard Lambert shader to add:
  //   - world-space planar UV sampling of the _m.dds surface texture
  //   - edge highlight matching 3d_map_cubes.mt EdgeColor/Thickness/Sharpness
  function buildBuildingMaterial(meta, mTex) {
    const mat = new THREE.MeshLambertMaterial({
      color: readThemeColor('--scene-terrain', '#566c88'),
    });
    mat.defines = { USE_UV: '' };  // ensure 'uv' attribute is declared in shader

    mat.onBeforeCompile = (shader) => {
      mat.userData.shader = shader;  // save for later uniform updates

      shader.uniforms.uTransMin      = { value: new THREE.Vector2(meta.transMin[0], meta.transMin[1]) };
      shader.uniforms.uTransMax      = { value: new THREE.Vector2(meta.transMax[0], meta.transMax[1]) };
      shader.uniforms.uOffset        = { value: new THREE.Vector2(...meta.offset) };
      shader.uniforms.uMTex          = { value: mTex };
      shader.uniforms.uEdgeColor     = { value: readThemeColor('--primary', '#00f0ff') };
      shader.uniforms.uEdgeThickness = { value: 0.0001 };
      shader.uniforms.uEdgeSharpness = { value: 30.0 };

      // ── Vertex shader — inject varyings + world-space UV ──────────────
      shader.vertexShader = `
        uniform vec2 uTransMin;
        uniform vec2 uTransMax;
        uniform vec2 uOffset;
        varying vec2 vMUv;
        varying vec2 vLocalUv;
      ` + shader.vertexShader;

      // Replace project_vertex to also capture world position for planar UV.
      // instanceMatrix * transformed gives world pos (model matrix is identity).
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vMUv = vec2(
          ( mvPosition.x - uOffset.x - uTransMin.x ) / ( uTransMax.x - uTransMin.x ),
          ( -mvPosition.z - uOffset.y - uTransMin.y ) / ( uTransMax.y - uTransMin.y )
        );
        vLocalUv = uv;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`
      );

      // ── Fragment shader — _m texture modulation + edge highlight ───────
      shader.fragmentShader = `
        uniform sampler2D uMTex;
        uniform vec3  uEdgeColor;
        uniform float uEdgeThickness;
        uniform float uEdgeSharpness;
        varying vec2 vMUv;
        varying vec2 vLocalUv;
      ` + shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float mVal = texture( uMTex, clamp( vMUv, 0.0, 1.0 ) ).r;
          diffuseColor.rgb *= 0.3 + mVal * 0.7;`
        )
        .replace(
          '#include <output_fragment>',
          `#include <output_fragment>
          float _ed = min( min( vLocalUv.x, 1.0 - vLocalUv.x ), min( vLocalUv.y, 1.0 - vLocalUv.y ) );
          float _ef = 1.0 - pow( clamp( _ed / uEdgeThickness, 0.0, 1.0 ), uEdgeSharpness );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, uEdgeColor, _ef );`
        );
    };

    return mat;
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

  // ── Flyover API ────────────────────────────────────────────────────────
  // Called by flyover.js — kept minimal to avoid exposing internals.

  function renderFrame(cam) {
    if (renderer && scene) renderer.render(scene, cam);
  }

  function setControlsEnabled(enabled) {
    if (controls) controls.enabled = enabled;
  }

  function getCanvasElement() {
    return renderer ? renderer.domElement : null;
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

    if (terrainMat) terrainMat.color.copy(readThemeColor('--scene-terrain',      '#566c88'));
    if (waterMat)   waterMat.color.copy(readThemeColor('--scene-water',           '#2a3f57'));
    if (cliffsMat)  cliffsMat.color.copy(readThemeColor('--scene-cliffs',         '#566c88'));
    if (roadsMat)   roadsMat.color.copy(readThemeColor('--overlay-road-color',    '#504b41'));
    if (metroMat)   metroMat.color.copy(readThemeColor('--overlay-metro-color',   '#dcaa28'));

    // Update building materials — MeshLambertMaterial.color + onBeforeCompile edge uniform
    if (buildingMaterials.length) {
      const base = readThemeColor('--scene-terrain', '#566c88');
      const edge = readThemeColor('--primary', '#00f0ff');
      for (const mat of buildingMaterials) {
        mat.color.copy(base);
        const sh = mat.userData.shader;
        if (sh) sh.uniforms.uEdgeColor.value.copy(edge);
      }
    }
  }

  // Snapshot current material colors — call before applyTheme so the old
  // values are captured for use as the "from" end of a transition lerp.
  function captureColors() {
    return {
      bg:      scene?.background?.clone() ?? null,
      terrain: terrainMat?.color.clone()  ?? null,
      water:   waterMat?.color.clone()    ?? null,
      cliffs:  cliffsMat?.color.clone()   ?? null,
      roads:   roadsMat?.color.clone()    ?? null,
      metro:   metroMat?.color.clone()    ?? null,
    };
  }

  // Lerp scene/material colors from a snapshot to explicit THREE.Color targets.
  // Used by the flyover beat cycle — no CSS read, no building update, no overhead.
  function transitionToColors(from, to, durationMs = 800) {
    if (!scene) return;
    if (from.bg && scene.background) scene.background.copy(from.bg);
    if (from.terrain && terrainMat)   terrainMat.color.copy(from.terrain);
    if (from.water   && waterMat)     waterMat.color.copy(from.water);
    if (from.cliffs  && cliffsMat)    cliffsMat.color.copy(from.cliffs);
    if (from.roads   && roadsMat)     roadsMat.color.copy(from.roads);
    if (from.metro   && metroMat)     metroMat.color.copy(from.metro);

    const start = performance.now();
    function step() {
      const rawT = Math.min((performance.now() - start) / durationMs, 1);
      const t    = rawT * rawT * (3 - 2 * rawT);
      if (scene.background && from.bg && to.bg) scene.background.lerpColors(from.bg, to.bg, t);
      if (terrainMat && from.terrain && to.terrain) terrainMat.color.lerpColors(from.terrain, to.terrain, t);
      if (waterMat   && from.water   && to.water)   waterMat.color.lerpColors(from.water,   to.water,   t);
      if (cliffsMat  && from.cliffs  && to.cliffs)  cliffsMat.color.lerpColors(from.cliffs, to.cliffs,  t);
      if (roadsMat   && from.roads   && to.roads)   roadsMat.color.lerpColors(from.roads,   to.roads,   t);
      if (metroMat   && from.metro   && to.metro)   metroMat.color.lerpColors(from.metro,   to.metro,   t);
      if (rawT < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Smoothly lerp scene/material colors from a captured snapshot to the
  // current CSS custom property values (new theme already applied).
  // Buildings snap immediately via updateMaterials(); only the main scene
  // colors are lerped to keep the per-frame cost low.
  function transitionMaterials(from, durationMs = 1000) {
    if (!scene) return;

    // Restore materials to their pre-theme-change state
    if (from.bg && scene.background) scene.background.copy(from.bg);
    if (from.terrain && terrainMat)   terrainMat.color.copy(from.terrain);
    if (from.water   && waterMat)     waterMat.color.copy(from.water);
    if (from.cliffs  && cliffsMat)    cliffsMat.color.copy(from.cliffs);
    if (from.roads   && roadsMat)     roadsMat.color.copy(from.roads);
    if (from.metro   && metroMat)     metroMat.color.copy(from.metro);

    // Read target values from CSS (new theme class already on <html>)
    const to = {
      bg:      readThemeColor('--primary',             '#0a192f'),
      terrain: readThemeColor('--scene-terrain',       '#566c88'),
      water:   readThemeColor('--scene-water',         '#2a3f57'),
      cliffs:  readThemeColor('--scene-cliffs',        '#566c88'),
      roads:   readThemeColor('--overlay-road-color',  '#504b41'),
      metro:   readThemeColor('--overlay-metro-color', '#dcaa28'),
    };

    const start = performance.now();
    function step() {
      const rawT = Math.min((performance.now() - start) / durationMs, 1);
      const t    = rawT * rawT * (3 - 2 * rawT); // smoothstep

      if (scene.background && from.bg) scene.background.lerpColors(from.bg, to.bg, t);
      if (terrainMat && from.terrain)  terrainMat.color.lerpColors(from.terrain, to.terrain, t);
      if (waterMat   && from.water)    waterMat.color.lerpColors(from.water,   to.water,   t);
      if (cliffsMat  && from.cliffs)   cliffsMat.color.lerpColors(from.cliffs, to.cliffs,  t);
      if (roadsMat   && from.roads)    roadsMat.color.lerpColors(from.roads,   to.roads,   t);
      if (metroMat   && from.metro)    metroMat.color.lerpColors(from.metro,   to.metro,   t);

      if (rawT < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Sun / hillshade control ────────────────────────────────────────────────
  // azimuthRad: from south, positive westward (SunCalc convention)
  // altitudeRad: elevation above horizon (0 = horizon, π/2 = zenith)
  //
  // GLB space axes: East = +X, South = +Z, West = -X, North = -Z, Up = +Y
  // So az=0 (south) → Z+; az=π/2 (west) → X-; az=-π/2 (east) → X+
  function setSunPosition(azimuthRad, altitudeRad) {
    if (!_dirLight || !_ambLight) return;
    _sunAz = azimuthRad;
    _sunEl = altitudeRad;
    const el = altitudeRad;
    const az = azimuthRad;

    // Scale position so the shadow camera sits well above the scene.
    // At sunrise/sunset el is small — we floor the Y component so the
    // shadow camera never dips below the terrain.
    const SHADOW_DIST = 8000;
    _dirLight.position.set(
      -Math.cos(el) * Math.sin(az)  * SHADOW_DIST,
       Math.max(0.1, Math.sin(el))  * SHADOW_DIST,
       Math.cos(el) * Math.cos(az)  * SHADOW_DIST,
    );

    // Disable shadow casting when the sun is below ~5° — avoids infinitely long
    // degenerate shadow projections at the very start/end of the flyover.
    // Only cast shadows if the user has enabled them AND the sun is above 5°
    _dirLight.castShadow = _shadowsOn && (el * 180 / Math.PI) > 5;

    // Colour: warm orange at horizon → neutral white above ~20°
    const elevDeg = el * 180 / Math.PI;
    const t = Math.min(1, Math.max(0, elevDeg / 20));
    _dirLight.color.setRGB(1, 0.45 + t * 0.55, 0.1 + t * 0.9);

    // Intensity: dims near the horizon, full above ~30°
    const intensity = 0.2 + 0.8 * Math.min(1, Math.max(0, elevDeg / 30));
    _dirLight.intensity = (1 - AMBIENT_INTENSITY) * intensity;
    _ambLight.intensity =      AMBIENT_INTENSITY  * Math.max(0.4, intensity);

    // Building materials use MeshLambertMaterial — scene lights update automatically.

    // Move and recolour the visible sun sphere.
    // Centred on Night City (WORLD_CX, 0, -WORLD_CY) so it hangs over the map.
    if (_sunSphere) {
      const SUN_SPHERE_DIST = 20000;
      const nx = -Math.cos(el) * Math.sin(az);
      const ny =  Math.sin(el); // unclamped — terrain naturally occludes it at sunrise/sunset
      const nz =  Math.cos(el) * Math.cos(az);
      _sunSphere.position.set(
        WORLD_CX + nx * SUN_SPHERE_DIST,
        ny * SUN_SPHERE_DIST,
        -WORLD_CY + nz * SUN_SPHERE_DIST,
      );
      // Warm orange at horizon → bright yellow at noon, slightly more saturated than the light
      _sunSphere.material.color.setRGB(
        Math.min(1, _dirLight.color.r * 1.3),
        Math.min(1, _dirLight.color.g * 1.15),
        Math.min(1, _dirLight.color.b * 0.8),
      );
    }
  }

  function setSunSphereVisible(visible) {
    if (_sunSphere) _sunSphere.visible = visible;
  }

  function setShadowsEnabled(enabled) {
    _shadowsOn = enabled;
    // Re-evaluate castShadow: respect both the user toggle and the elevation floor
    if (_dirLight) {
      const elevDeg = Math.asin(Math.min(1, _dirLight.position.y / 8000)) * 180 / Math.PI;
      _dirLight.castShadow = _shadowsOn && elevDeg > 5;
    }
  }

  function getCameraState() {
    if (!controls || !camera) return null;
    return {
      target:   controls.target.toArray(),
      position: camera.position.toArray(),
      zoom:     camera.zoom,
      polar:    controls.getPolarAngle(),
      azimuth:  controls.getAzimuthalAngle(),
      sunAz:    _sunAz,
      sunEl:    _sunEl,
    };
  }

  function setCameraState(s) {
    if (!controls || !camera) return;
    controls.target.fromArray(s.target);
    camera.position.fromArray(s.position);
    camera.zoom = s.zoom;
    controls.update();
    camera.updateProjectionMatrix();
    if (s.sunAz !== undefined) setSunPosition(s.sunAz, s.sunEl);
  }

  return { init, startRenderLoop, stopRenderLoop, resetCamera, setLayerVisibility, updateMaterials, renderFrame, setControlsEnabled, getCanvasElement, captureColors, transitionMaterials, transitionToColors, setSunPosition, setShadowsEnabled, setSunSphereVisible, getCameraState, setCameraState };
})();

window.NCZ.ThreeScene = ThreeScene;
