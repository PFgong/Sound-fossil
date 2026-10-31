// 把写出去的 STL / OBJ / GLB 读回来，纯粹为了在浏览器里看一眼。
//
// 这不是一个通用模型库：只处理我们自己写出来的那几种结构，
// 也不读材质、贴图、法线、UV —— 查看器只需要顶点和索引。

function asciiStl(text) {
  const pos = [];
  const re = /facet\s+normal[\s\S]*?outer\s+loop([\s\S]*?)endloop/g;
  let m;
  while ((m = re.exec(text))) {
    const v = m[1].match(/vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g) || [];
    for (let i = 0; i < 3; i++) {
      const n = v[i] ? v[i].split(/\s+/).slice(1).map(Number) : [0, 0, 0];
      pos.push(n[0], n[1], n[2]);
    }
  }
  return pos;
}

function binaryStl(view) {
  const count = view.getUint32(80, true);
  const pos = new Float32Array(count * 9);
  let p = 84;
  for (let t = 0; t < count; t++) {
    p += 12; // 法线，不读
    for (let k = 0; k < 9; k++) {
      pos[t * 9 + k] = view.getFloat32(p, true);
      p += 4;
    }
    p += 2; // attribute byte count
  }
  return pos;
}

function parseStl(bytes) {
  // 先看长度能不能对上二进制的账，对不上再当文本处理
  const head = new DataView(bytes.buffer, bytes.byteOffset, Math.min(bytes.length, 84));
  if (bytes.length >= 84) {
    const count = head.getUint32(80, true);
    if (count > 0 && bytes.length === 84 + count * 50) return binaryStl(new DataView(bytes.buffer, bytes.byteOffset, bytes.length));
  }
  return asciiStl(new TextDecoder('utf-8').decode(bytes));
}

function parseObj(text) {
  const vs = [];
  const pos = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (s.startsWith('v ')) {
      const a = s.split(/\s+/);
      vs.push(+a[1], +a[2], +a[3]);
    } else if (s.startsWith('f ')) {
      const a = s.split(/\s+/).slice(1).map((x) => parseInt(x.split('/')[0], 10));
      // 多边形拆成扇形三角
      for (let i = 1; i + 1 < a.length; i++) {
        for (const idx of [a[0], a[i], a[i + 1]]) {
          const b = idx > 0 ? (idx - 1) * 3 : vs.length + idx * 3;
          pos.push(vs[b], vs[b + 1], vs[b + 2]);
        }
      }
    }
  }
  return pos;
}

function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('不是 GLB 文件');
  const total = view.getUint32(8, true);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < total) {
    const len = view.getUint32(off, true);
    const type = view.getUint32(off + 4, true);
    const start = off + 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder('utf-8').decode(bytes.subarray(start, start + len)));
    } else if (type === 0x004e4942) {
      bin = start;
    }
    off = start + len;
  }
  if (!json) throw new Error('GLB 里没有 JSON 块');

  const read = (accessorIdx) => {
    const acc = json.accessors[accessorIdx];
    const bv = json.bufferViews[acc.bufferView];
    const base = bin + (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const n = acc.count;
    if (acc.componentType === 5126) {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) out[i] = view.getFloat32(base + i * 4, true);
      return out;
    }
    const u32 = acc.componentType === 5125;
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = u32 ? view.getUint32(base + i * 4, true) : view.getUint16(base + i * 2, true);
    }
    return out;
  };

  const prim = json.meshes[0].primitives[0];
  return { positions: read(prim.attributes.POSITION), indices: read(prim.indices) };
}

function sequential(n) {
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  return idx;
}

/**
 * 读一个模型文件，返回给 createPreview 用的 { positions, indices }。
 * STL 与 OBJ 是无索引的三顶点平铺，顺手编个序号就行。
 */
export function parseModel(bytes, name = '') {
  const lower = name.toLowerCase();
  const head4 = String.fromCharCode(bytes[0] || 0, bytes[1] || 0, bytes[2] || 0, bytes[3] || 0);

  if (head4 === 'glTF' || lower.endsWith('.glb')) {
    const { positions, indices } = parseGlb(bytes);
    return { positions, indices, triCount: indices.length / 3, name };
  }

  const pos = lower.endsWith('.obj') ? parseObj(new TextDecoder('utf-8').decode(bytes)) : parseStl(bytes);

  if (!pos.length) throw new Error('这个文件里没有三角形');
  return {
    positions: pos instanceof Float32Array ? pos : new Float32Array(pos),
    indices: sequential(pos.length / 3),
    triCount: pos.length / 9,
    name,
  };
}

/** 有向体积，用来估克数。符号能顺带验出三角面有没有翻。 */
export function signedVolumeMm3(positions, indices) {
  let v = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(v);
}

export function bounds(positions) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < lo[k]) lo[k] = v;
      if (v > hi[k]) hi[k] = v;
    }
  }
  return { lo, hi };
}
