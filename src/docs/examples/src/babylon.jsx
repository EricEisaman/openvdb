import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, Color4, Color3, MeshBuilder, ShaderMaterial, Effect, StandardMaterial, Texture, GPUParticleSystem, MeshParticleEmitter, VertexData, FxaaPostProcess } from '@babylonjs/core';
import { WVDBReader } from '../../../three-openvdb/wvdb/WVDBReader.js';

const canvas = document.getElementById('renderCanvas');
const statusEl = document.getElementById('status');
const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

const displaySize = 100.0;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

const sunDirection = new Vector3(0.6, 0.45, -0.8).normalize();
Effect.ShadersStore['skyVertexShader'] = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vWorldPos;
void main() { vec4 wp = world * vec4(position, 1.0); vWorldPos = wp.xyz; gl_Position = worldViewProjection * vec4(position, 1.0); }
`;
Effect.ShadersStore['skyFragmentShader'] = `
precision highp float;
varying vec3 vWorldPos;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
void main() {
  vec3 dir = normalize(vWorldPos - cameraPosition);
  float h = clamp(dir.y, -0.1, 1.0);
  vec3 zenith = vec3(0.32, 0.62, 0.94);
  vec3 horizon = vec3(0.98, 0.86, 0.68);
  vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.6));
  float sunAmt = max(dot(dir, sunDirection), 0.0);
  col += vec3(1.0, 0.9, 0.7) * pow(sunAmt, 350.0) * 1.2;
  col += vec3(1.0, 0.85, 0.6) * pow(sunAmt, 8.0) * 0.18;
  col = mix(col, horizon, smoothstep(0.12, -0.05, dir.y) * 0.6);
  gl_FragColor = vec4(col, 1.0);
}
`;
const skyboxMaterial = new ShaderMaterial('skyMaterial', scene, { vertex: 'sky', fragment: 'sky' }, { attributes: ['position'], uniforms: ['world', 'worldViewProjection', 'cameraPosition', 'sunDirection'] });
skyboxMaterial.setVector3('sunDirection', sunDirection);
skyboxMaterial.backFaceCulling = false;
skyboxMaterial.disableDepthWrite = true;
const skybox = MeshBuilder.CreateBox('skyBox', { size: 1000 }, scene);
skybox.material = skyboxMaterial;
skybox.infiniteDistance = true;

const camera = new ArcRotateCamera('camera', -Math.PI / 2.0, Math.PI / 2.25, 210, new Vector3(0, 0, 0), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 20;
camera.lowerRadiusLimit = 60;
camera.upperRadiusLimit = 400;

new HemisphericLight('light', new Vector3(0, 1, 0), scene);

const ground = MeshBuilder.CreateGround('ground', { width: 2000, height: 2000 }, scene);
ground.position.y = -50;
const groundMat = new StandardMaterial('groundMat', scene);
const groundTexture = new Texture('https://playground.babylonjs.com/textures/ground.jpg', scene);
groundTexture.uScale = 6;
groundTexture.vScale = 6;
groundMat.diffuseTexture = groundTexture;
groundMat.specularColor = new Color3(0, 0, 0);
ground.material = groundMat;

new FxaaPostProcess('fxaa', 1.0, camera);

let currentPS = null;
let currentEmitMesh = null;
const fountain = MeshBuilder.CreateBox('fountain', { size: 0.01 }, scene);
fountain.visibility = 0;
const fogTexture = new Texture('https://raw.githubusercontent.com/aWeirdo/Babylon.js/master/smoke_15.png', scene);

// NOTE Helper: VDB -> emission positions, in an inline worker, density-weighted, index-to-world transform
const generateEmissionPositions = (gridData, dims, gridSize, count) => {
  return new Promise((resolve, reject) => {
    const workerCode = `
      self.onmessage = (e) => {
        const { data, dims, gridSize, count } = e.data;
        const dx = dims[0], dy = dims[1], dz = dims[2];
        const sx = gridSize[0], sy = gridSize[1], sz = gridSize[2];
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          let found = false;
          for (let tries = 0; tries < 24; tries++) {
            const x = Math.floor(Math.random() * dx);
            const y = Math.floor(Math.random() * dy);
            const z = Math.floor(Math.random() * dz);
            const idx = x + y * dx + z * dx * dy;
            const d = data[idx] / 255.0;
            if (d < 0.04) continue;
            if (Math.random() > Math.pow(d, 0.7)) continue;
            positions[i*3] = ((x + Math.random()) / dx - 0.5) * sx;
            positions[i*3+1] = ((y + Math.random()) / dy - 0.5) * sy;
            positions[i*3+2] = ((z + Math.random()) / dz - 0.5) * sz;
            found = true;
            break;
          }
          if (!found) {
            positions[i*3] = (Math.random() - 0.5) * sx * 0.5;
            positions[i*3+1] = (Math.random() - 0.5) * sy * 0.5;
            positions[i*3+2] = (Math.random() - 0.5) * sz * 0.5;
          }
        }
        self.postMessage({ positions }, [positions.buffer]);
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = (e) => { resolve(e.data.positions); worker.terminate(); };
    worker.onerror = (e) => { reject(e); worker.terminate(); };
    worker.postMessage({ data: gridData, dims, gridSize, count });
  });
};

const loadVolume = async () => {
  try {
    const reader = new WVDBReader({ maxLod: 1 });
    await reader.load('./assets/bunny_cloud.wvdb', {
      onUpdate: async ({ grid, lodComplete }) => {
        if (grid && lodComplete) {
          const gridDims = [...grid.dimensions];
          const [dx, dy, dz] = gridDims;
          const maxDim = Math.max(dx, dy, dz);
          const gridSize = [(displaySize * dx) / maxDim, (displaySize * dy) / maxDim, (displaySize * dz) / maxDim];
          const COUNT = 50000;
          setStatus(`Sampling VDB in worker — ${COUNT} positions...`);
          const positions = await generateEmissionPositions(grid.data, gridDims, gridSize, COUNT);
          // NOTE GPU is go-to: GPUParticleSystem + CustomParticleEmitter, positions by particle index
          const ps = new GPUParticleSystem('particles', { capacity: COUNT }, scene);
          ps.activeParticleCount = COUNT;
          ps.manualEmitCount = ps.activeParticleCount;
          ps.particleTexture = fogTexture.clone();
          ps.emitter = new Vector3(0, 0, 0);
          // NOTE Await is already done above - positions is fully back here, verify before creating GPU system
          if (!positions || positions.length < COUNT * 3) { console.error('Worker positions not ready', positions?.length); return; }
          if (currentPS) { currentPS.dispose(); currentPS = null; }
          if (currentEmitMesh) { currentEmitMesh.dispose(); currentEmitMesh = null; }
          // NOTE Mesh emitter: VDB positions become mesh vertices, GPU emits from vertices - no null generator
          const emitMesh = new (await import('@babylonjs/core')).Mesh('vdbEmitMesh', scene);
          currentEmitMesh = emitMesh;
          const vd = new VertexData();
          vd.positions = Array.from(positions);
          vd.indices = Array.from({ length: COUNT }, (_, i) => i);
          vd.normals = new Array(COUNT * 3).fill(0);
          vd.applyToMesh(emitMesh, false);
          emitMesh.isVisible = false;
          // NOTE Degenerate triangles - sample exact VDB points, don't fill between them
          emitMesh.setIndices(Array.from({ length: COUNT * 3 }, (_, i) => Math.floor(i / 3)));
          const meshEmitter = new MeshParticleEmitter(emitMesh);
          meshEmitter.useMeshNormalsForDirection = false;
          ps.particleEmitterType = meshEmitter;
          ps.color1 = new Color4(0.92, 0.92, 0.92, 0.08);
          ps.color2 = new Color4(1.0, 1.0, 1.0, 0.12);
          ps.colorDead = new Color4(0.92, 0.92, 0.92, 0.08);
          ps.minSize = 3.4;
          ps.maxSize = 6.0;
          ps.minLifeTime = 1000;
          ps.maxLifeTime = 1000;
          ps.emitRate = 50000;
          ps.blendMode = GPUParticleSystem.BLENDMODE_STANDARD;
          ps.gravity = new Vector3(0, 0, 0);
          ps.direction1 = new Vector3(0, 0, 0);
          ps.direction2 = new Vector3(0, 0, 0);
          ps.minAngularSpeed = -2;
          ps.maxAngularSpeed = 2;
          ps.minEmitPower = 0.5;
          ps.maxEmitPower = 1;
          ps.updateSpeed = 0.005;
          currentPS = ps;
          ps.start();
          setStatus(`bunny_cloud.wvdb — LOD 1 — ${dx}×${dy}×${dz} — ${COUNT} GPU particles (MeshEmitter)`);
        }
      },
    });
  } catch (error) {
    console.error('Babylon WVDB load failed', error);
    setStatus('Could not load bunny_cloud.wvdb. See console for details.');
  }
};
loadVolume();
scene.registerBeforeRender(() => {
  skyboxMaterial.setVector3('cameraPosition', camera.position);
});
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
