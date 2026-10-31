// 冒烟测试：读 WAV → 分析 → 生成三种造型 → 写 STL/OBJ，并校验输出。
// 用法：node tools/smoke.js

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseWav } from '../web/lib/wav.js';
import { analyze } from '../web/lib/features.js';
import { toMono } from '../web/lib/dsp.js';
import { buildShape, SHAPES } from '../web/lib/shapes.js';
import { buildGeometry, estimatePrint } from '../web/lib/mesh.js';
import { stlBinary, objText, bounds, svgForShape } from '../web/lib/writers.js';
import { glbBinary } from '../web/lib/glb.js';

const OUT = new URL('./testdata/out/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// 有向体积：全部三角形绕序朝外时应得到正数，且逼近解析体积。
function signedVolume(positions, indices, triCount) {
  let v = 0;
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3] * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];
    v +=
      (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

function checkGeometry(geo, shape) {
  let minZ = Infinity;
  let maxZ = -Infinity;
  let bad = 0;
  let nan = 0;
  for (let i = 0; i < geo.positions.length; i += 3) {
    const z = geo.positions[i + 2];
    if (!Number.isFinite(z)) nan++;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  for (let i = 0; i < geo.indices.length; i++) {
    if (geo.indices[i] >= geo.positions.length / 3) bad++;
  }
  const sv = signedVolume(geo.positions, geo.indices, geo.triCount);
  const b = bounds(geo.positions);
  const est = estimatePrint(geo.volume);
  console.log(
    `   三角 ${geo.triCount}  顶点 ${geo.positions.length / 3}  ` +
      `Z ${minZ.toFixed(2)}~${maxZ.toFixed(2)}  ` +
      `X ${(b.maxX - b.minX).toFixed(1)}mm Y ${(b.maxY - b.minY).toFixed(1)}mm H ${(b.maxZ - b.minZ).toFixed(1)}mm`
  );
  console.log(
    `   有向体积 ${(sv / 1000).toFixed(2)} cm³  解析体积 ${(geo.volume / 1000).toFixed(2)} cm³  ` +
      `偏差 ${(((sv - geo.volume) / geo.volume) * 100).toFixed(1)}%  ` +
      `约 ${est.grams.toFixed(0)} g / ${est.hours.toFixed(1)} h`
  );
  if (nan > 0) throw new Error(`${shape}: 存在 NaN 坐标`);
  if (bad > 0) throw new Error(`${shape}: 存在越界索引 ${bad}`);
  if (minZ < -1e-6) throw new Error(`${shape}: 模型穿到 z<0（minZ=${minZ}）`);
  if (sv <= 0) throw new Error(`${shape}: 有向体积为负，三角形绕序反了`);
  const relErr = Math.abs(sv - geo.volume) / geo.volume;
  if (relErr > 0.12) throw new Error(`${shape}: 有向体积与解析体积偏差过大 ${relErr}`);
  return sv;
}

// GLB 结构校验：魔数、版本、总长、JSON 可解析、块长度对得上。
function checkGlb(bytes, name, geo) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error(`${name}: GLB 魔数不对`);
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new Error(`${name}: GLB 版本不是 2.0`);
  const total = dv.getUint32(8, true);
  if (total !== bytes.length) throw new Error(`${name}: GLB 声明长度 ${total} 与实际 ${bytes.length} 不符`);

  const jsonLen = dv.getUint32(12, true);
  const jsonType = dv.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) throw new Error(`${name}: GLB 第一块不是 JSON`);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  if (json.asset.version !== '2.0') throw new Error(`${name}: glTF 版本缺失`);

  const binOff = 20 + jsonLen;
  const binLen = dv.getUint32(binOff, true);
  const binType = dv.getUint32(binOff + 4, true);
  if (binType !== 0x004e4942) throw new Error(`${name}: GLB 第二块不是 BIN`);

  const expected = geo.positions.length * 4 + geo.triCount * 12;
  if (binLen < expected) {
    throw new Error(`${name}: BIN 块 ${binLen} 小于顶点+索引所需 ${expected}`);
  }
  if ((binOff + 8 + binLen) % 4 !== 0) throw new Error(`${name}: BIN 块未四字节对齐`);
  if (json.accessors[0].count !== geo.positions.length / 3) {
    throw new Error(`${name}: accessor 顶点数不符`);
  }
  if (json.accessors[1].count !== geo.triCount * 3) {
    throw new Error(`${name}: accessor 索引数不符`);
  }
}

const DATA = new URL('./testdata/', import.meta.url);

const files = process.argv[2]
  ? [process.argv[2]]
  : ['voice.wav', 'ambient.wav', 'percussion.wav', 'sweep.wav'];

let totalTris = 0;
let totalMs = 0;

for (const name of files) {
  const buf = readFileSync(new URL(name, DATA));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const wav = parseWav(ab);
  const mono = toMono(wav.channels);

  const t0 = Date.now();
  const feats = analyze(mono, wav.sampleRate, { seconds: 20 });
  const analyzeMs = Date.now() - t0;
  console.log(
    `\n===== ${name}　${feats.stats.duration.toFixed(1)}s　主频 ${feats.stats.dominantHz.toFixed(0)}Hz　` +
      `峰值 ${feats.stats.peakDb.toFixed(1)}dB　分析 ${analyzeMs}ms`
  );

  for (const shape of SHAPES) {
    const spec = buildShape(shape.id, feats, {});
    const t2 = Date.now();
    const geo = buildGeometry(spec);
    const geoMs = Date.now() - t2;
    checkGeometry(geo, shape.id);

    const stl = stlBinary(geo.positions, geo.indices, geo.triCount);
    if (stl.length !== 84 + geo.triCount * 50) {
      throw new Error(`${shape.id}: STL 字节数不符 ${stl.length}`);
    }
    const glb = glbBinary(geo.positions, geo.indices, geo.triCount);
    checkGlb(glb, shape.id, geo);
    const svg = svgForShape(spec, { layers: 8 });
    if (!svg.startsWith('<svg')) throw new Error(`${shape.id}: SVG 输出异常`);

    if (name === files[0]) {
      writeFileSync(new URL(`${shape.id}.stl`, OUT), stl);
      writeFileSync(new URL(`${shape.id}.obj`, OUT), objText(geo.positions, geo.indices, geo.triCount));
      writeFileSync(new URL(`${shape.id}.glb`, OUT), glb);
      writeFileSync(new URL(`${shape.id}.svg`, OUT), svg);
    }

    totalTris += geo.triCount;
    totalMs += geoMs;
    console.log(
      `  ${shape.name}　STL ${(stl.length / 1024 / 1024).toFixed(2)} MB　` +
        `GLB ${(glb.length / 1024 / 1024).toFixed(2)} MB　几何 ${geoMs}ms`
    );
  }
}

console.log(`\n共 ${files.length * SHAPES.length} 个模型，${totalTris.toLocaleString()} 三角，几何共 ${totalMs}ms`);
console.log('全部通过。');
