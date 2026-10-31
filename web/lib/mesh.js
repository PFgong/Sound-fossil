// 几何构建：高度场 / 圆盘 / 旋转体 → 顶点与索引。
// 所有模型的底面落在 z = 0，单位为毫米，三角形绕序统一朝外。

function pushTri(idx, n, a, b, c) {
  idx[n] = a;
  idx[n + 1] = b;
  idx[n + 2] = c;
  return n + 3;
}

// ---- 方形平板 ----------------------------------------------------------

export function buildGridGeometry(spec) {
  const { nx, ny, sizeX, sizeY, height, base, sample } = spec;
  const vx = nx + 1;
  const vy = ny + 1;
  const topCount = vx * vy;

  // 沿外沿逆时针（从上往下看）走一圈，用于生成侧壁。
  const perim = new Int32Array(2 * (nx + ny));
  let np = 0;
  for (let i = 0; i < nx; i++) perim[np++] = i * vy + 0;
  for (let j = 0; j < ny; j++) perim[np++] = nx * vy + j;
  for (let i = nx; i > 0; i--) perim[np++] = i * vy + ny;
  for (let j = ny; j > 0; j--) perim[np++] = 0 * vy + j;
  const P = np;

  const total = topCount + P + 4;
  const positions = new Float32Array(total * 3);
  let pi = 0;
  let hSum = 0;

  for (let i = 0; i < vx; i++) {
    const x = -sizeX / 2 + (i * sizeX) / nx;
    for (let j = 0; j < vy; j++) {
      const y = -sizeY / 2 + (j * sizeY) / ny;
      const h = sample(i / nx, j / ny);
      hSum += h;
      positions[pi++] = x;
      positions[pi++] = y;
      positions[pi++] = base + h * height;
    }
  }

  for (let k = 0; k < P; k++) {
    const src = perim[k] * 3;
    positions[pi++] = positions[src];
    positions[pi++] = positions[src + 1];
    positions[pi++] = 0;
  }

  const hx = sizeX / 2;
  const hy = sizeY / 2;
  const corners = [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ];
  for (let c = 0; c < 4; c++) {
    positions[pi++] = corners[c][0];
    positions[pi++] = corners[c][1];
    positions[pi++] = 0;
  }

  const triCount = 2 * nx * ny + 2 * P + 2;
  const indices = new Uint32Array(triCount * 3);
  let n = 0;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const a = i * vy + j;
      const b = a + vy;
      const c = b + 1;
      const d = a + 1;
      n = pushTri(indices, n, a, b, c);
      n = pushTri(indices, n, a, c, d);
    }
  }

  const skirtBase = topCount;
  const bottomBase = topCount + P;
  for (let k = 0; k < P; k++) {
    const k2 = (k + 1) % P;
    const t0 = perim[k];
    const t1 = perim[k2];
    const b0 = skirtBase + k;
    const b1 = skirtBase + k2;
    n = pushTri(indices, n, t0, b0, b1);
    n = pushTri(indices, n, t0, b1, t1);
  }

  n = pushTri(indices, n, bottomBase, bottomBase + 2, bottomBase + 1);
  n = pushTri(indices, n, bottomBase, bottomBase + 3, bottomBase + 2);

  const meanH = hSum / topCount;
  const volume = sizeX * sizeY * base + meanH * height * sizeX * sizeY;

  return { positions, indices, triCount, volume };
}

// ---- 圆盘 --------------------------------------------------------------

export function buildDiscGeometry(spec) {
  const { rings, sectors, radius, height, base, samplePolar } = spec;
  const S = sectors;
  const R = rings;
  const TAU = Math.PI * 2;

  const TC = 0;
  const ringBase = 1;
  const skirtTopBase = 1 + R * S;
  const skirtBotBase = skirtTopBase + S;
  const BC = skirtBotBase + S;
  const total = BC + 1;

  const positions = new Float32Array(total * 3);
  let pi = 0;
  let hSum = 0;
  let hCount = 0;

  const cosT = new Float32Array(S);
  const sinT = new Float32Array(S);
  for (let j = 0; j < S; j++) {
    cosT[j] = Math.cos((TAU * j) / S);
    sinT[j] = Math.sin((TAU * j) / S);
  }

  const put = (x, y, z) => {
    positions[pi++] = x;
    positions[pi++] = y;
    positions[pi++] = z;
  };

  put(0, 0, base + samplePolar(0, 0) * height);
  hSum += samplePolar(0, 0);
  hCount++;

  for (let i = 1; i <= R; i++) {
    const rn = i / R;
    const rr = rn * radius;
    for (let j = 0; j < S; j++) {
      const th = (TAU * j) / S;
      const h = samplePolar(rn, th);
      hSum += h;
      hCount++;
      put(rr * cosT[j], rr * sinT[j], base + h * height);
    }
  }

  for (let j = 0; j < S; j++) put(radius * cosT[j], radius * sinT[j], base + samplePolar(1, 0) * height);
  for (let j = 0; j < S; j++) put(radius * cosT[j], radius * sinT[j], 0);
  put(0, 0, 0);

  const triCount = S + 2 * (R - 1) * S + 2 * S + S;
  const indices = new Uint32Array(triCount * 3);
  let n = 0;

  for (let j = 0; j < S; j++) {
    const j2 = (j + 1) % S;
    n = pushTri(indices, n, TC, ringBase + (0 * S + j), ringBase + (0 * S + j2));
  }

  for (let i = 1; i < R; i++) {
    const o0 = ringBase + (i - 1) * S;
    const o1 = ringBase + i * S;
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      n = pushTri(indices, n, o0 + j, o1 + j2, o0 + j2);
      n = pushTri(indices, n, o0 + j, o1 + j, o1 + j2);
    }
  }

  for (let j = 0; j < S; j++) {
    const j2 = (j + 1) % S;
    const t0 = skirtTopBase + j;
    const t1 = skirtTopBase + j2;
    const b0 = skirtBotBase + j;
    const b1 = skirtBotBase + j2;
    n = pushTri(indices, n, t0, b0, b1);
    n = pushTri(indices, n, t0, b1, t1);
  }

  for (let j = 0; j < S; j++) {
    const j2 = (j + 1) % S;
    n = pushTri(indices, n, BC, skirtBotBase + j2, skirtBotBase + j);
  }

  const area = Math.PI * radius * radius;
  const meanH = hSum / hCount;
  const volume = area * base + meanH * height * area;

  return { positions, indices, triCount, volume };
}

// ---- 旋转体 ------------------------------------------------------------

export function buildLatheGeometry(spec) {
  const { rings, sectors, height, base, radiusAt, plateRadius } = spec;
  const S = sectors;
  const TAU = Math.PI * 2;

  const profile = [{ z: 0, r: plateRadius }];
  profile.push({ z: base, r: plateRadius });
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    profile.push({ z: base + t * height, r: radiusAt(t) });
  }
  const M = profile.length;

  const cosT = new Float32Array(S);
  const sinT = new Float32Array(S);
  for (let j = 0; j < S; j++) {
    cosT[j] = Math.cos((TAU * j) / S);
    sinT[j] = Math.sin((TAU * j) / S);
  }

  const total = M * S + 2;
  const positions = new Float32Array(total * 3);
  let pi = 0;

  for (let k = 0; k < M; k++) {
    const r = profile[k].r;
    const z = profile[k].z;
    for (let j = 0; j < S; j++) {
      positions[pi++] = r * cosT[j];
      positions[pi++] = r * sinT[j];
      positions[pi++] = z;
    }
  }
  const topCenter = M * S;
  positions[pi++] = 0;
  positions[pi++] = 0;
  positions[pi++] = base + height;
  const botCenter = M * S + 1;
  positions[pi++] = 0;
  positions[pi++] = 0;
  positions[pi++] = 0;

  const triCount = 2 * (M - 1) * S + 2 * S;
  const indices = new Uint32Array(triCount * 3);
  let n = 0;

  for (let k = 0; k < M - 1; k++) {
    const o0 = k * S;
    const o1 = (k + 1) * S;
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      n = pushTri(indices, n, o0 + j, o0 + j2, o1 + j2);
      n = pushTri(indices, n, o0 + j, o1 + j2, o1 + j);
    }
  }

  const last = (M - 1) * S;
  for (let j = 0; j < S; j++) {
    const j2 = (j + 1) % S;
    n = pushTri(indices, n, topCenter, last + j, last + j2);
  }
  for (let j = 0; j < S; j++) {
    const j2 = (j + 1) % S;
    n = pushTri(indices, n, botCenter, j2, j);
  }

  let volume = Math.PI * plateRadius * plateRadius * base;
  const dz = height / rings;
  for (let i = 0; i <= rings; i++) {
    const r = radiusAt(i / rings);
    const w = i === 0 || i === rings ? 0.5 : 1;
    volume += Math.PI * r * r * dz * w;
  }

  return { positions, indices, triCount, volume };
}

export function buildGeometry(shapeSpec) {
  if (shapeSpec.kind === 'disc') return buildDiscGeometry(shapeSpec);
  if (shapeSpec.kind === 'lathe') return buildLatheGeometry(shapeSpec);
  return buildGridGeometry(shapeSpec);
}

export function estimatePrint(volumeMm3) {
  const grams = (volumeMm3 / 1000) * 1.24;
  const seconds = volumeMm3 / 3.6;
  return {
    grams,
    hours: seconds / 3600,
  };
}
