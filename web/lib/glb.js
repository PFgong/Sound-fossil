// 最小 GLB 写入器。只有一个静态网格、没有贴图与动画，
// 为它引入 GLTFExporter 要多背 78KB 依赖链，不值得。
// 布局：12 字节头 + JSON 块 + 二进制块。

const enc = new TextEncoder();

function pad4(n) {
  return (4 - (n % 4)) % 4;
}

export function glbBinary(positions, indices, triCount) {
  const vCount = positions.length / 3;
  const iCount = triCount * 3;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }

  const posBytes = vCount * 12;
  const idxBytes = iCount * 4;

  const json = {
    asset: { version: '2.0', generator: 'Sound Fossil' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.91, 0.89, 0.84, 1],
          metallicFactor: 0,
          roughnessFactor: 0.86,
        },
      },
    ],
    buffers: [{ byteLength: posBytes + idxBytes }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: idxBytes, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vCount,
        type: 'VEC3',
        min,
        max,
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: iCount,
        type: 'SCALAR',
      },
    ],
  };

  let jsonBuf = enc.encode(JSON.stringify(json));
  const jsonPad = pad4(jsonBuf.length);
  const binPad = pad4(posBytes + idxBytes);
  const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + posBytes + idxBytes + binPad;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);

  let off = 12;
  view.setUint32(off, jsonBuf.length + jsonPad, true);
  view.setUint32(off + 4, 0x4e4f534a, true);
  off += 8;
  out.set(jsonBuf, off);
  for (let i = 0; i < jsonPad; i++) out[off + jsonBuf.length + i] = 0x20;
  off += jsonBuf.length + jsonPad;

  view.setUint32(off, posBytes + idxBytes + binPad, true);
  view.setUint32(off + 4, 0x004e4942, true);
  off += 8;

  const bin = new Uint8Array(out.buffer, off, posBytes + idxBytes);
  bin.set(new Uint8Array(positions.buffer, positions.byteOffset, posBytes), 0);
  bin.set(new Uint8Array(indices.buffer, indices.byteOffset, idxBytes), posBytes);

  return out;
}
