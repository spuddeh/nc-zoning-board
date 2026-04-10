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
    camera.up.set(0, 0, -1);  // north faces up on screen
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
  }

  // ── GLB loading (tiered) ───────────────────────────────────────────────

  async function loadTerrain() {
    setLoadingText('Loading terrain...');
    try {
      const [terrainScene, waterScene, cliffsScene] = await Promise.all([
        loadGLB('assets/glb/3dmap_terrain.glb'),
        loadGLB('assets/glb/3dmap_water.glb'),
        loadGLB('assets/glb/3dmap_cliffs.glb'),
      ]);

      applyMaterial(terrainScene, makeHillshadeMaterial('--scene-terrain', '#1a3322'));
      applyMaterial(waterScene,   makeFlatMaterial('--scene-water',         '#071420'));
      applyMaterial(cliffsScene,  makeHillshadeMaterial('--scene-cliffs',   '#152a1c'));

      // Cliffs GLB entity localTransform offset (resolved from WolvenKit export):
      // CET pos (-2255, -3050) → GLB offset X=-2255, Z=+3050
      cliffsScene.position.set(-2255, 0, 3050);

      scene.add(terrainScene, waterScene, cliffsScene);

      // Fit camera frustum to the terrain bounding box
      const box = new THREE.Box3().setFromObject(terrainScene);
      fitCameraToBox(box);

      hideLoading();
    } catch (err) {
      console.error('[NCZ] Terrain GLB load failed:', err);
      setLoadingText('Failed to load terrain. Check console for details.');
    }
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

  function renderLoop() {
    animationId = requestAnimationFrame(renderLoop);
    controls.update(); // required for damping
    renderer.render(scene, camera);
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
    controls.target.set(WORLD_CX, 0, -WORLD_CY);
    camera.position.set(WORLD_CX, 10000, -WORLD_CY);
    camera.lookAt(WORLD_CX, 0, -WORLD_CY);
    controls.reset();
  }

  function updateMaterials() {
    if (!scene) return;
    scene.background = readThemeColor('--primary', '#0a192f');
    // Material updates for individual meshes come in Phase 6
    // (requires storing material refs — deferred to keep Phase 1 focused)
  }

  return { init, startRenderLoop, stopRenderLoop, resetCamera, updateMaterials };
})();

window.NCZ.ThreeScene = ThreeScene;
