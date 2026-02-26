import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const STORAGE_KEY = 'diffengine3_identity_v1';

function $(id){ return document.getElementById(id); }

function readIdentity(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}
function writeIdentity(identity){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

function makeLabelSprite(text){
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 128;

  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0,0,canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(187,170,144,0.85)';
  ctx.lineWidth = 4;
  ctx.strokeRect(6,6,canvas.width-12, canvas.height-12);

  ctx.fillStyle = 'rgba(187,170,144,0.95)';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width/2, canvas.height/2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

async function getWebcamTexture(){
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.playsInline = true;
  await video.play();

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  return { texture, stop: () => stream.getTracks().forEach(t => t.stop()) };
}

function addFallbackRoom(scene){
  const room = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.95, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI/2;
  room.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 1.0, metalness: 0.0 });
  const wallGeo = new THREE.BoxGeometry(14, 6, 0.25);
  const backWall = new THREE.Mesh(wallGeo, wallMat);
  backWall.position.set(0, 3, -7);
  room.add(backWall);

  const leftWall = new THREE.Mesh(wallGeo, wallMat);
  leftWall.rotation.y = Math.PI/2;
  leftWall.position.set(-7, 3, 0);
  room.add(leftWall);

  const rightWall = new THREE.Mesh(wallGeo, wallMat);
  rightWall.rotation.y = Math.PI/2;
  rightWall.position.set(7, 3, 0);
  room.add(rightWall);

  scene.add(room);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.85, 1.1, 24),
    new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.7, metalness: 0.2 })
  );
  pedestal.position.set(0, 0.55, 0);
  scene.add(pedestal);
}

async function loadFirstWorkingGLB(loader, urls){
  for (const url of urls) {
    try {
      const gltf = await loader.loadAsync(url);
      return { gltf, url };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load', url, e);
    }
  }
  return null;
}

function fitCameraToObject({ camera, controls, object, fitOffset = 1.35 }){
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let dist = maxDim / (2 * Math.tan(fov / 2));
  dist *= fitOffset;

  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.35, center.z + dist * 0.85);
  controls.target.copy(center);
  controls.update();
}

function start(identity){
  const container = $('museum_canvas_container');
  const spinner = $('museum_spinner');
  const message = $('museum_message');

  if (location.protocol === 'file:') {
    message.textContent = 'This page must be served over http(s) (not opened as a file) for Three.js modules + glTF to load. Run: python3 -m http.server';
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 3, 18);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(4.2, 2.6, 6.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.4, 0);
  controls.update();

  let initialCamPos = camera.position.clone();
  let initialTarget = controls.target.clone();

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(4, 7, 2);
  scene.add(key);
  const fill = new THREE.PointLight(0xffffff, 0.5, 20);
  fill.position.set(-4, 1.8, -3);
  scene.add(fill);

  // Load museum environment
  const gltfLoader = new GLTFLoader();
  let mixer = null;
  const museumCandidates = [
    'assets/gltf/museum_production_15.2.glb',
    'assets/gltf/museum_shrinked_10000_08.12.16.37.glb'
  ];

  (async () => {
    const result = await loadFirstWorkingGLB(gltfLoader, museumCandidates);
    if (!result) {
      addFallbackRoom(scene);
      spinner.style.display = 'none';
      return;
    }

    const world = result.gltf.scene;
    scene.add(world);

    // If your conversion needs an axis fix, uncomment one of these:
    // world.rotation.x = -Math.PI / 2;
    // world.rotation.y = Math.PI;

    fitCameraToObject({ camera, controls, object: world, fitOffset: 1.35 });
    initialCamPos = camera.position.clone();
    initialTarget = controls.target.clone();

    if (result.gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(world);
      result.gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }

    spinner.style.display = 'none';
  })();

  // Avatar plane
  const avatarGroup = new THREE.Group();
  avatarGroup.position.set(0, 1.7, 0);
  scene.add(avatarGroup);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.8, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.5, metalness: 0.6 })
  );
  frame.position.set(0, 0.05, 0);
  avatarGroup.add(frame);

  const avatarMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.65),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  avatarMesh.position.set(0, 0.05, 0.05);
  avatarGroup.add(avatarMesh);

  const label = makeLabelSprite(identity.loginName.toUpperCase());
  label.position.set(0, -1.15, 0);
  avatarGroup.add(label);

  const texLoader = new THREE.TextureLoader();
  texLoader.load(identity.avatarUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    avatarMesh.material.map = tex;
    avatarMesh.material.needsUpdate = true;
  });

  // Eye image (hovering sign)
  texLoader.load('assets/img/b4w_purgatory_eye.jpg', (eyeTex) => {
    eyeTex.colorSpace = THREE.SRGBColorSpace;
    const eye = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.6),
      new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true, opacity: 0.75 })
    );
    eye.position.set(0, 2.8, -6.88);
    scene.add(eye);
  });

  // Resize
  function resize(){
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // UI
  let labelsVisible = true;
  $('btn_toggle_labels')?.addEventListener('click', () => {
    labelsVisible = !labelsVisible;
    label.visible = labelsVisible;
  });

  $('btn_reset')?.addEventListener('click', () => {
    camera.position.copy(initialCamPos);
    controls.target.copy(initialTarget);
    controls.update();
  });

  let webcamSession = null;
  $('btn_webcam')?.addEventListener('click', async () => {
    try {
      if (webcamSession) {
        webcamSession.stop();
        webcamSession = null;
        message.textContent = 'Webcam stopped.';
        return;
      }
      const session = await getWebcamTexture();
      webcamSession = session;
      avatarMesh.material.map = session.texture;
      avatarMesh.material.needsUpdate = true;
      message.textContent = 'Webcam is live. Click “Use webcam…” again to stop.';
    } catch (e) {
      message.textContent = 'Could not access webcam (permission denied or unavailable).';
      // eslint-disable-next-line no-console
      console.warn(e);
    }
  });

  // Animate
  const clock = new THREE.Clock();
  function tick(){
    const delta = clock.getDelta();
    const t = clock.elapsedTime;
    avatarGroup.rotation.y = Math.sin(t * 0.25) * 0.25;
    if (mixer) mixer.update(delta);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

function boot(){
  const form = $('avatar-input-form');
  const stage = $('museum_stage');
  const message = $('museum_message');

  const saved = readIdentity();
  if (saved?.loginName && saved?.avatarUrl) {
    form.hidden = true;
    stage.hidden = false;
    $('museum_identity').textContent = `Logged in as ${saved.loginName} · ${saved.avatarKey}`;
    start(saved);
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();

    const loginName = $('museum-avatar-login-name').value.trim();
    const avatarKey = (new FormData(form)).get('avatarImage');

    if (!loginName) {
      message.textContent = 'Please enter a login name.';
      return;
    }
    if (!avatarKey) {
      message.textContent = 'Please select an avatar.';
      return;
    }

    const avatarUrl = `assets/img/${avatarKey}.jpg`;
    const identity = { loginName, avatarKey, avatarUrl };
    writeIdentity(identity);

    form.hidden = true;
    stage.hidden = false;
    $('museum_identity').textContent = `Logged in as ${identity.loginName} · ${identity.avatarKey}`;
    start(identity);
  });
}

boot();
