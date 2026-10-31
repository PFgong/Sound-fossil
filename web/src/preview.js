// three.js 预览。模型是 Z 向上的，与 STL 一致，打印时不需要再翻转。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const COLD = new THREE.Color(0x8a8578);
const WARM = new THREE.Color(0xf0e7d2);

export function createPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(canvas.clientWidth || 600, canvas.clientHeight || 400, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f1ea);

  const camera = new THREE.PerspectiveCamera(32, 1.5, 0.5, 4000);
  camera.position.set(120, -120, 130);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 6);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8b7e, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(90, -70, 130);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8d2c4, 0.55);
  fill.position.set(-100, 80, 60);
  scene.add(fill);

  const material = new THREE.MeshStandardMaterial({
    color: 0xe9e3d6,
    roughness: 0.86,
    metalness: 0.0,
    vertexColors: false,
  });

  let mesh = null;
  let current = null;

  function clear() {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh = null;
    }
  }

  function setGeometry(geo) {
    clear();
    current = geo;
    const g = new THREE.BufferGeometry();
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 2; i < geo.positions.length; i += 3) {
      if (geo.positions[i] < minZ) minZ = geo.positions[i];
      if (geo.positions[i] > maxZ) maxZ = geo.positions[i];
    }
    g.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
    g.setIndex(new THREE.BufferAttribute(geo.indices, 1));
    g.computeVertexNormals();

    const colors = new Float32Array(geo.positions.length);
    const span = Math.max(0.001, maxZ - minZ);
    const tmp = new THREE.Color();
    for (let i = 0; i < geo.positions.length; i += 3) {
      const t = (geo.positions[i + 2] - minZ) / span;
      tmp.copy(COLD).lerp(WARM, t);
      colors[i] = tmp.r;
      colors[i + 1] = tmp.g;
      colors[i + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    mesh = new THREE.Mesh(g, material);
    scene.add(mesh);
    fit();
  }

  function fit() {
    if (!mesh) return;
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    const size = new THREE.Vector3();
    b.getSize(size);
    const center = new THREE.Vector3();
    b.getCenter(center);
    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    const dist = radius / Math.tan((camera.fov * Math.PI) / 360) * 1.55;
    controls.target.copy(center);
    camera.position.set(center.x + dist * 0.7, center.y - dist * 0.72, center.z + dist * 0.62);
    camera.near = Math.max(0.1, dist * 0.01);
    camera.far = dist * 12;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function setColorMode(mode) {
    material.vertexColors = mode === 'height';
    material.needsUpdate = true;
  }

  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  loop();

  return {
    setGeometry,
    setColorMode,
    fit,
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      clear();
      controls.dispose();
      renderer.dispose();
    },
    get triangleCount() {
      return current ? current.triCount : 0;
    },
  };
}
