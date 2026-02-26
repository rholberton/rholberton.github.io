import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { ARCHIVE_IMAGES } from './archive-data.js';

function $(id){ return document.getElementById(id); }

const container = $('purgatory_canvas_container');
const spinner = $('purgatory_spinner');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 2, 28);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(0, 2.8, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.2, 0);
controls.update();

let initialCamPos = camera.position.clone();
let initialTarget = controls.target.clone();

scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const pLight = new THREE.PointLight(0xffffff, 0.9, 40);
pLight.position.set(6, 10, 6);
scene.add(pLight);

const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
let mixer = null;

function fitCameraToObject({ camera, controls, object, fitOffset = 1.4 }){
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let dist = maxDim / (2 * Math.tan(fov / 2));
  dist *= fitOffset;

  camera.position.set(center.x + dist * 0.25, center.y + dist * 0.35, center.z + dist * 0.95);
  controls.target.copy(center);
  controls.update();
}

function addFallbackPurgatory(){
  texLoader.load('assets/img/b4w_purgatory_eye.jpg', (eyeTex) => {
    eyeTex.colorSpace = THREE.SRGBColorSpace;
    eyeTex.wrapS = THREE.RepeatWrapping;
    eyeTex.wrapT = THREE.RepeatWrapping;
    eyeTex.repeat.set(3, 2);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(22, 48, 32),
      new THREE.MeshBasicMaterial({ map: eyeTex, side: THREE.BackSide, transparent: true, opacity: 0.15 })
    );
    dome.position.y = 1.8;
    scene.add(dome);
  });

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 8.5, 96),
    new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 1, metalness: 0 })
  );
  ring.rotation.x = -Math.PI/2;
  ring.position.y = 0;
  scene.add(ring);
}

async function loadPurgatoryGLB(){
  try {
    const gltf = await gltfLoader.loadAsync('assets/gltf/purgatory_small.glb');
    const world = gltf.scene;
    scene.add(world);

    // If your conversion needs an axis fix, uncomment one of these:
    // world.rotation.x = -Math.PI / 2;
    // world.rotation.y = Math.PI;

    fitCameraToObject({ camera, controls, object: world, fitOffset: 1.4 });
    initialCamPos = camera.position.clone();
    initialTarget = controls.target.clone();

    if (gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(world);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }

    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load purgatory glb, using fallback.', e);
    addFallbackPurgatory();
    return false;
  }
}

const avatarsGroup = new THREE.Group();
avatarsGroup.position.y = 1.3;
scene.add(avatarsGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let focused = null;

function pickRandom(list, n){
  const copy = [...list];
  const out = [];
  while (copy.length && out.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function clearAvatars(){
  while (avatarsGroup.children.length) {
    const child = avatarsGroup.children.pop();
    child.geometry?.dispose?.();
    if (child.material?.map) child.material.map.dispose();
    child.material?.dispose?.();
  }
}

function loadAvatars(){
  clearAvatars();
  focused = null;

  const sources = [
    'assets/img/avatar1.jpg','assets/img/avatar2.jpg','assets/img/avatar3.jpg',
    'assets/img/avatar4.jpg','assets/img/avatar5.jpg','assets/img/avatar6.jpg','assets/img/avatar7.jpg',
    ...pickRandom(ARCHIVE_IMAGES, 28).map(f => `assets/uploads/${f}`)
  ];

  const planeGeo = new THREE.PlaneGeometry(1.1, 1.1);

  return new Promise((resolve) => {
    let loaded = 0;
    const done = () => {
      loaded += 1;
      if (loaded >= sources.length) resolve();
    };

    sources.forEach((url) => {
      texLoader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;

        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(planeGeo, mat);

        // Randomized placement on a loose sphere
        const r = 2.5 + Math.random() * 4.5;
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() * 0.85 + 0.1) * Math.PI;

        mesh.position.set(
          Math.cos(theta) * Math.sin(phi) * r,
          (Math.cos(phi) * r) * 0.55,
          Math.sin(theta) * Math.sin(phi) * r
        );

        mesh.userData = {
          url,
          drift: new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.12),
          spin: (Math.random() - 0.5) * 0.5,
          base: mesh.position.clone()
        };

        avatarsGroup.add(mesh);
        done();
      }, undefined, done);
    });
  });
}

function resize(){
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
new ResizeObserver(resize).observe(container);
resize();

function focusObject(obj){
  if (!obj) return;
  focused = obj;
  const p = obj.getWorldPosition(new THREE.Vector3());
  controls.target.copy(p);
}

container.addEventListener('pointermove', (ev) => {
  const rect = container.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
});

container.addEventListener('click', () => {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(avatarsGroup.children, false);
  if (hits.length) focusObject(hits[0].object);
});

$('btn_shuffle')?.addEventListener('click', async () => {
  spinner.style.display = 'block';
  await loadAvatars();
  spinner.style.display = 'none';
});

$('btn_reset')?.addEventListener('click', () => {
  camera.position.copy(initialCamPos);
  controls.target.copy(initialTarget);
  controls.update();
  focused = null;
});

const clock = new THREE.Clock();
function tick(){
  const delta = clock.getDelta();
  const t = clock.elapsedTime;

  avatarsGroup.children.forEach((m) => {
    m.lookAt(camera.position);
    m.rotation.z += m.userData.spin * 0.002;

    const d = m.userData.drift;
    m.position.x = m.userData.base.x + Math.sin(t * 0.6 + m.id) * d.x;
    m.position.y = m.userData.base.y + Math.cos(t * 0.7 + m.id) * d.y;
    m.position.z = m.userData.base.z + Math.sin(t * 0.5 + m.id) * d.z;

    if (m === focused) {
      m.material.opacity = 1.0;
      m.scale.setScalar(1.2);
    } else {
      m.material.opacity = 0.92;
      m.scale.setScalar(1.0);
    }
  });

  controls.update();
  if (mixer) mixer.update(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

async function main(){
  spinner.style.display = 'block';
  if (location.protocol === 'file:') {
    // If opened as a file, glTF fetch will typically fail. Keep the page responsive with fallback.
    console.warn('Opened via file:// — please use a local web server (python3 -m http.server).');
  }
  await loadPurgatoryGLB();
  await loadAvatars();
  spinner.style.display = 'none';
  tick();
}

main();
