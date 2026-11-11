import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, Color4 } from '@babylonjs/core';
import { PointsCloudSystem } from '@babylonjs/core/Particles/pointsCloudSystem';
import { WVDBReader } from '../../../three-openvdb/wvdb/WVDBReader.js';

const canvas = document.getElementById('renderCanvas');
const statusEl = document.getElementById('status');
const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

// NOTE Longest side of the volume in scene units, same as the three.js demo
const displaySize = 100.0;

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.35, 0.56, 1.0, 1.0);

const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 180, Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 20;

new HemisphericLight('light', new Vector3(0, 1, 0), scene);

let currentPCS = null;

const buildPoints = (grid) => {
  const [dx, dy, dz] = grid.dimensions;
  const data = grid.data;
  if (!data || dx <= 1 || dy <= 1 || dz <= 1) return;

  // NOTE Preserve aspect: longest side is displaySize
  const maxDim = Math.max(dx, dy, dz);
  const sizeX = (displaySize * dx) / maxDim;
  const sizeY = (displaySize * dy) / maxDim;
  const sizeZ = (displaySize * dz) / maxDim;

  // NOTE Adaptive stride: keep the point count renderable on LOD 1+
  const total = dx * dy * dz;
  const step = total > 3000000 ? 3 : total > 400000 ? 2 : 1;

  const positions = [];
  const densities = [];

  // NOTE WVDB texels are x-fastest: index = (z * dy + y) * dx + x
  for (let z = 0; z < dz; z += step) {
    for (let y = 0; y < dy; y += step) {
      for (let x = 0; x < dx; x += step) {
        const density = data[(z * dy + y) * dx + x];
        if (density <= 12) continue;
        positions.push([
          ((x / (dx - 1)) - 0.5) * sizeX,
          ((y / (dy - 1)) - 0.5) * sizeY,
          ((z / (dz - 1)) - 0.5) * sizeZ,
        ]);
        densities.push(density / 255.0);
      }
    }
  }

  if (currentPCS) {
    currentPCS.dispose();
    currentPCS = null;
  }
  if (!positions.length) {
    setStatus('No voxels above density threshold.');
    return;
  }

  const pcs = new PointsCloudSystem('bunny', 2, scene);
  pcs.addPoints(positions.length, (particle, i) => {
    const p = positions[i];
    particle.position = new Vector3(p[0], p[1], p[2]);
    const v = densities[i];
    particle.color = new Color4(0.9, 0.9, 0.95, Math.min(0.25 + v, 1.0));
  });

  pcs.buildMeshAsync().then(() => {
    setStatus(`bunny_cloud.wvdb — LOD ${grid.lod} — ${positions.length.toLocaleString()} points — ${dx}×${dy}×${dz}`);
  });
  currentPCS = pcs;
};

const loadVolume = async () => {
  try {
    // NOTE maxLod 1 keeps v1 fast: LOD 0 then LOD 1, no full-res download
    const reader = new WVDBReader({ maxLod: 1 });
    await reader.load('./assets/bunny_cloud.wvdb', {
      onUpdate: ({ grid, lodComplete }) => {
        if (grid && lodComplete) buildPoints(grid);
      },
    });
  } catch (error) {
    console.error('Babylon WVDB load failed', error);
    setStatus('Could not load bunny_cloud.wvdb. See console for details.');
  }
};

loadVolume();

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
