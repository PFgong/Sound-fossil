// 三种造型：把声音特征映射成高度/半径。纯函数，两端共用。

import { resampleSequence } from './dsp.js';

export const SHAPES = [
  { id: 'slice', name: '切片浮雕', kind: 'grid' },
  { id: 'ring', name: '环形年轮', kind: 'disc' },
  { id: 'column', name: '地层柱', kind: 'lathe' },
];

export const DEFAULTS = {
  shape: 'slice',
  grid: 200,
  size: 80,
  height: 8,
  base: 2.5,
  gain: 1.0,
  invert: false,
  rim: true,
  ringStep: 1.2,
  jitter: 0.03,
  columnHeight: 45,
  columnRadius: 10,
  columnAmp: 5,
  strata: true,
};

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function shaped(h, p) {
  let v = clamp01(h * p.gain);
  if (p.invert) v = 1 - v;
  return v;
}

// 时间轴上的包络取值器，内部重采样到高分辩率后线性插值。
function makeEnvelopeSampler(envelope) {
  const n = Math.max(2, Math.min(4096, envelope.length * 2));
  const vals = resampleSequence(envelope, n);
  return (t) => {
    const x = clamp01(t) * (n - 1);
    const i0 = Math.floor(x);
    const i1 = Math.min(n - 1, i0 + 1);
    const f = x - i0;
    return vals[i0] * (1 - f) + vals[i1] * f;
  };
}

// 平滑的角度噪声，让年轮不是完美同心圆。
function angleNoise(a) {
  return (
    0.55 * Math.sin(3 * a + 1.7) +
    0.3 * Math.sin(7 * a + 4.2) +
    0.15 * Math.sin(11 * a + 2.4)
  );
}

// ---- 切片浮雕 ----------------------------------------------------------

function buildSlice(features, p) {
  const { spectro } = features;
  const gx = p.grid;
  const gy = p.grid;
  const field = new Float32Array((gx + 1) * (gy + 1));

  for (let ix = 0; ix <= gx; ix++) {
    const fx = (ix / gx) * (spectro.frames - 1);
    const fx0 = Math.floor(fx);
    const fx1 = Math.min(spectro.frames - 1, fx0 + 1);
    const tx = fx - fx0;
    for (let iy = 0; iy <= gy; iy++) {
      const fy = (iy / gy) * (spectro.bands - 1);
      const fy0 = Math.floor(fy);
      const fy1 = Math.min(spectro.bands - 1, fy0 + 1);
      const ty = fy - fy0;
      const a = spectro.data[fx0 * spectro.bands + fy0];
      const b = spectro.data[fx0 * spectro.bands + fy1];
      const c = spectro.data[fx1 * spectro.bands + fy0];
      const d = spectro.data[fx1 * spectro.bands + fy1];
      const top = a * (1 - tx) + c * tx;
      const bot = b * (1 - tx) + d * tx;
      field[ix * (gy + 1) + iy] = top * (1 - ty) + bot * ty;
    }
  }

  const feather = p.rim ? Math.max(2, Math.round(gx * 0.035)) : 0;
  if (feather > 0) {
    for (let ix = 0; ix <= gx; ix++) {
      for (let iy = 0; iy <= gy; iy++) {
        const d = Math.min(ix, gx - ix, iy, gy - iy);
        if (d < feather) {
          field[ix * (gy + 1) + iy] *= smoothstep(0, 1, d / feather);
        }
      }
    }
  }

  const sample = (u, v) => {
    const x = clamp01(u) * gx;
    const y = clamp01(v) * gy;
    const x0 = Math.min(gx - 1, Math.floor(x));
    const y0 = Math.min(gy - 1, Math.floor(y));
    const tx = x - x0;
    const ty = y - y0;
    const a = field[x0 * (gy + 1) + y0];
    const b = field[x0 * (gy + 1) + y0 + 1];
    const c = field[(x0 + 1) * (gy + 1) + y0];
    const d = field[(x0 + 1) * (gy + 1) + y0 + 1];
    const lo = a * (1 - tx) + c * tx;
    const hi = b * (1 - tx) + d * tx;
    return shaped(lo * (1 - ty) + hi * ty, p);
  };

  return {
    kind: 'grid',
    nx: gx,
    ny: gy,
    sizeX: p.size,
    sizeY: p.size,
    height: p.height,
    base: p.base,
    sample,
  };
}

// ---- 环形年轮 ----------------------------------------------------------

function buildRing(features, p) {
  const env = makeEnvelopeSampler(features.envelope);
  const radius = p.size / 2;
  const ringStep = Math.max(0.3, p.ringStep);
  const jitter = p.jitter;
  const outerFade = 0.94;
  const centerPit = 0.05;

  const samplePolar = (rNorm, theta) => {
    if (rNorm >= 0.999) return 0;
    let rr = rNorm * (1 + jitter * angleNoise(theta));
    if (rr < 0) rr = 0;
    const ringIdx = Math.floor((rr * radius) / ringStep);
    const t = Math.min(1, (ringIdx * ringStep) / radius);
    let h = env(t);
    if (rr > outerFade) h *= 1 - (rr - outerFade) / (1 - outerFade);
    if (rr < centerPit) h *= rr / centerPit;
    h *= smoothstep(0, 0.02, rr);
    return shaped(h, p);
  };

  const rings = Math.max(40, Math.round(radius * 2.8));
  const sectors = Math.max(48, Math.round(radius * 3.6));

  return {
    kind: 'disc',
    rings,
    sectors,
    radius,
    height: p.height,
    base: p.base,
    samplePolar,
  };
}

// ---- 地层柱 ------------------------------------------------------------

function buildColumn(features, p) {
  const env = makeEnvelopeSampler(features.envelope);
  const rMin = Math.max(2, p.columnRadius - p.columnAmp);
  const rSpan = Math.max(0.5, p.columnAmp);
  const totalHeight = p.columnHeight;
  const pitch = 2.5;
  const amp = p.strata ? 0.35 : 0;

  const radiusAt = (t) => {
    const z = clamp01(t) * totalHeight;
    let r = rMin + rSpan * env(t);
    if (amp > 0) r += amp * Math.sin((2 * Math.PI * z) / pitch);
    return r;
  };

  const rings = 160;
  const sectors = 96;

  return {
    kind: 'lathe',
    rings,
    sectors,
    height: totalHeight,
    base: p.base,
    radiusAt,
    plateRadius: rMin + rSpan + 2,
  };
}

export function buildShape(shapeId, features, params) {
  const p = { ...DEFAULTS, ...params };
  if (shapeId === 'ring') return buildRing(features, p);
  if (shapeId === 'column') return buildColumn(features, p);
  return buildSlice(features, p);
}

export function shapeKind(shapeId) {
  const s = SHAPES.find((x) => x.id === shapeId);
  return s ? s.kind : 'grid';
}
