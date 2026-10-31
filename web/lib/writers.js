// 网格 → 文件。二进制 STL、OBJ。纯计算，两端共用。

export function computeNormal(positions, ia, ib, ic, out) {
  const ax = positions[ia];
  const ay = positions[ia + 1];
  const az = positions[ia + 2];
  const bx = positions[ib];
  const by = positions[ib + 1];
  const bz = positions[ib + 2];
  const cx = positions[ic];
  const cy = positions[ic + 1];
  const cz = positions[ic + 2];
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len > 1e-12) {
    nx /= len;
    ny /= len;
    nz /= len;
  } else {
    nx = 0;
    ny = 0;
    nz = 1;
  }
  out[0] = nx;
  out[1] = ny;
  out[2] = nz;
}

export function stlBinary(positions, indices, triCount, header = 'SoundFossil') {
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  const hdr = new Uint8Array(buffer, 0, 80);
  for (let i = 0; i < 80; i++) hdr[i] = 32;
  for (let i = 0; i < header.length && i < 80; i++) hdr[i] = header.charCodeAt(i);

  view.setUint32(80, triCount, true);

  const nrm = new Float32Array(3);
  let off = 84;
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3] * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;
    computeNormal(positions, ia, ib, ic, nrm);

    view.setFloat32(off, nrm[0], true);
    view.setFloat32(off + 4, nrm[1], true);
    view.setFloat32(off + 8, nrm[2], true);

    view.setFloat32(off + 12, positions[ia], true);
    view.setFloat32(off + 16, positions[ia + 1], true);
    view.setFloat32(off + 20, positions[ia + 2], true);
    view.setFloat32(off + 24, positions[ib], true);
    view.setFloat32(off + 28, positions[ib + 1], true);
    view.setFloat32(off + 32, positions[ib + 2], true);
    view.setFloat32(off + 36, positions[ic], true);
    view.setFloat32(off + 40, positions[ic + 1], true);
    view.setFloat32(off + 44, positions[ic + 2], true);
    view.setUint16(off + 48, 0, true);

    off += 50;
  }
  return new Uint8Array(buffer);
}

export function objText(positions, indices, triCount, name = 'soundfossil') {
  const vCount = positions.length / 3;
  const parts = [];
  const line = [];
  parts.push('# Sound Fossil — 声音化石');
  parts.push(`o ${name}`);
  for (let i = 0; i < vCount; i++) {
    line.length = 0;
    line.push('v');
    line.push(positions[i * 3].toFixed(4));
    line.push(positions[i * 3 + 1].toFixed(4));
    line.push(positions[i * 3 + 2].toFixed(4));
    parts.push(line.join(' '));
  }
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3] + 1;
    const b = indices[t * 3 + 1] + 1;
    const c = indices[t * 3 + 2] + 1;
    parts.push(`f ${a} ${b} ${c}`);
  }
  return parts.join('\n') + '\n';
}

export function bounds(positions) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

const SVG_OPEN =
  '<g fill="none" stroke="#111111" stroke-width="0.5" stroke-linejoin="round">';

// 切片浮雕专用：沿频率轴把高度场切成 K 条剖面，叠起来就是那块浮雕。
// 切出来可以直接激光切割，也可以打印在卡纸上叠成纸雕。
export function svgLayers(spec, opts = {}) {
  if (!spec.sample) throw new Error('层切只支持切片浮雕造型');
  const layers = opts.layers ?? 8;
  const width = opts.width ?? 240;
  const depth = opts.depth ?? 60;
  const samples = opts.samples ?? 180;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${depth * layers}" viewBox="0 0 ${width} ${depth * layers}">`
  );
  parts.push(SVG_OPEN);

  for (let L = 0; L < layers; L++) {
    const v = (L + 0.5) / layers;
    const pts = [`M 0 ${depth}`];
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const h = spec.sample(u, v);
      pts.push(`L ${(u * width).toFixed(2)} ${(depth - h * depth * 0.92).toFixed(2)}`);
    }
    pts.push(`L ${width} ${depth}`);
    pts.push('Z');
    parts.push(`<path d="${pts.join(' ')}" transform="translate(0 ${L * depth})"/>`);
  }

  parts.push('</g>');
  parts.push('</svg>');
  return parts.join('\n');
}

// 年轮与地层柱：输出可以立起来的剖面轮廓，激光切割后当模板或立牌。
export function svgProfile(spec, opts = {}) {
  const width = opts.width ?? 240;
  const height = opts.height ?? 240;
  const samples = opts.samples ?? 240;
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(SVG_OPEN);

  if (spec.kind === 'disc') {
    // 横轴是半径，左右两端是盘缘，中点是盘心
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const s = i / samples;
      const r = Math.abs(s * 2 - 1);
      const h = spec.samplePolar(r, 0);
      const x = s * width;
      const y = height - h * height * 0.92;
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    parts.push(`<path d="${pts.join(' ')}"/>`);
    parts.push(
      `<path d="M 0 ${height} L ${width} ${height}" stroke-dasharray="2 2" stroke-width="0.3"/>`
    );
  } else {
    // 竖轴是高度，横轴是半径，左右镜像成一根柱子
    const right = [];
    const left = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const r = spec.radiusAt(t) / spec.plateRadius;
      const x = width / 2 + (r * width) / 2;
      const y = height - t * height;
      right.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
      left.push(`L ${(width - x).toFixed(2)} ${y.toFixed(2)}`);
    }
    right[0] = `M ${right[0].slice(2)}`;
    parts.push(`<path d="${right.concat(left.reverse()).join(' ')} Z"/>`);
  }

  parts.push('</g>');
  parts.push('</svg>');
  return parts.join('\n');
}

export function svgForShape(spec, opts = {}) {
  return spec.kind === 'grid' ? svgLayers(spec, opts) : svgProfile(spec, opts);
}
