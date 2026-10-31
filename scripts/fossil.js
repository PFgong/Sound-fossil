#!/usr/bin/env node
// 声音化石 · 命令行通道
//
//   node fossil.js info   input.wav
//   node fossil.js make   input.wav --shape slice --out out.stl
//   node fossil.js card   input.wav --title "外婆说的那句话" --out card.svg
//   node fossil.js page   input.wav --title "..." --out page.html
//
// 只直接支持 WAV（8/16/24/32-bit PCM 与 32-bit float）。
// 其他格式请先转：ffmpeg -i in.mp3 -ac 1 -ar 32000 out.wav

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { basename, dirname } from 'node:path';

import { parseWav, encodeWav } from '../web/lib/wav.js';
import { analyze, sampleField } from '../web/lib/features.js';
import { toMono, resampleAudio, sliceSeconds, fingerprint, resampleSequence } from '../web/lib/dsp.js';
import { buildShape, SHAPES, DEFAULTS } from '../web/lib/shapes.js';
import { buildGeometry, estimatePrint } from '../web/lib/mesh.js';
import { stlBinary, objText, svgForShape } from '../web/lib/writers.js';
import { glbBinary } from '../web/lib/glb.js';
import { cardSvg, sheetSvg } from '../web/lib/card-svg.js';
import { buildFossilPage } from '../web/lib/publish.js';
import { encodeGrayPNG } from './png.js';

const require = createRequire(import.meta.url);
void require;

// 二维码库是 UMD，在 ESM 里没有导出，用 vm 把它捞出来。
function loadQrcode() {
  const src = readFileSync(new URL('../web/vendor/qrcode.js', import.meta.url), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.qrcode;
}

function parseArgs(argv) {
  const out = { cmd: argv[0], input: null, flags: {} };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else if (!out.input) {
      out.input = a;
    }
  }
  return out;
}

function num(v, d) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

function readWav(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const wav = parseWav(ab);
  return { mono: toMono(wav.channels), sampleRate: wav.sampleRate };
}

// 输出目录可能不存在，直接写会崩。
function save(path, data) {
  const dir = dirname(path);
  if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
  writeFileSync(path, data);
}

// 用户给 --out 时常常不带扩展名，make 会自己补，card / page 也得一样。
function withExt(path, ext) {
  return new RegExp(`\\${ext}$`, 'i').test(path) ? path : path + ext;
}

function stampId(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function buildAll(path, flags) {
  const { mono, sampleRate } = readWav(path);
  const params = { ...DEFAULTS };
  if (flags.size) params.size = num(flags.size, params.size);
  if (flags.height) params.height = num(flags.height, params.height);
  if (flags.base) params.base = num(flags.base, params.base);
  if (flags.grid) params.grid = Math.round(num(flags.grid, params.grid));
  if (flags.gain) params.gain = num(flags.gain, params.gain);
  if (flags['ring-step']) params.ringStep = num(flags['ring-step'], params.ringStep);
  if (flags['col-h']) params.columnHeight = num(flags['col-h'], params.columnHeight);
  if (flags['col-r']) params.columnRadius = num(flags['col-r'], params.columnRadius);
  if (flags['col-a']) params.columnAmp = num(flags['col-a'], params.columnAmp);
  if (flags.invert) params.invert = true;
  if (flags['no-rim']) params.rim = false;
  if (flags['no-strata']) params.strata = false;

  const shapeId = flags.shape || 'slice';
  if (!SHAPES.some((s) => s.id === shapeId)) {
    throw new Error(`没有这个造型：${shapeId}（可选 ${SHAPES.map((s) => s.id).join(' / ')}）`);
  }

  const feats = analyze(mono, sampleRate, {
    seconds: num(flags.seconds, 20),
    start: num(flags.start, 0),
  });
  const spec = buildShape(shapeId, feats, params);
  const geo = buildGeometry(spec);
  const est = estimatePrint(geo.volume);
  const number = `SF-${stampId(new Date())}-${fingerprint(mono).slice(0, 4)}`;
  return { mono, sampleRate, feats, spec, geo, est, shapeId, params, number };
}

function cardDataFrom(ctx, flags) {
  const shape = SHAPES.find((s) => s.id === ctx.shapeId);
  return {
    number: ctx.number,
    title: flags.title || '无题',
    duration: ctx.feats.stats.duration,
    dominantHz: ctx.feats.stats.dominantHz,
    peakDb: ctx.feats.stats.peakDb,
    shapeName: shape ? shape.name : ctx.shapeId,
    when: Date.now(),
    place: flags.place || '',
    envelope: resampleSequence(ctx.feats.envelope, 180),
    // 没给 --qr 就留空。以前默认塞一串 SF:2026-…#编号，扫出来是没人认得的字符。
    qrText: typeof flags.qr === 'string' ? flags.qr : '',
  };
}

function cmdInfo(path, flags) {
  const { mono, sampleRate } = readWav(path);
  const feats = analyze(mono, sampleRate, { seconds: num(flags.seconds, 20) });
  const s = feats.stats;
  console.log(`文件    ${basename(path)}`);
  console.log(`采样率  ${sampleRate} Hz`);
  console.log(`总时长  ${s.totalDuration.toFixed(2)} s`);
  console.log(`分析段  ${s.duration.toFixed(2)} s`);
  console.log(`主频    ${Math.round(s.dominantHz)} Hz`);
  console.log(`峰值    ${s.peakDb.toFixed(1)} dB`);
  console.log(`RMS     ${s.rmsDb.toFixed(1)} dB`);
  console.log(`指纹    ${fingerprint(mono)}`);
}

function cmdMake(path, flags) {
  const ctx = buildAll(path, flags);
  const base = flags.out ? flags.out.replace(/\.(stl|obj|png|svg)$/i, '') : `${ctx.number}-${ctx.shapeId}`;
  const fmt = flags.format || 'stl';
  const written = [];

  if (fmt === 'stl' || fmt === 'all') {
    const bytes = stlBinary(ctx.geo.positions, ctx.geo.indices, ctx.geo.triCount);
    save(`${base}.stl`, bytes);
    written.push(`${base}.stl (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
  }
  if (fmt === 'glb' || fmt === 'all') {
    const bytes = glbBinary(ctx.geo.positions, ctx.geo.indices, ctx.geo.triCount);
    save(`${base}.glb`, bytes);
    written.push(`${base}.glb (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);
  }
  if (fmt === 'obj' || fmt === 'all') {
    const text = objText(ctx.geo.positions, ctx.geo.indices, ctx.geo.triCount);
    save(`${base}.obj`, text);
    written.push(`${base}.obj`);
  }
  if (fmt === 'svg' || fmt === 'all') {
    const kind = ctx.spec.kind === 'grid' ? 'layers' : 'profile';
    save(`${base}-${kind}.svg`, svgForShape(ctx.spec, { layers: 8 }));
    written.push(`${base}-${kind}.svg`);
  }
  if (fmt === 'png' || fmt === 'all') {
    const size = 512;
    const field = sampleField(ctx.spec, size, size);
    const gray = new Uint8Array(size * size);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = Math.round(Math.max(0, Math.min(1, field[i])) * 255);
    }
    save(`${base}-heightmap.png`, encodeGrayPNG(gray, size, size));
    written.push(`${base}-heightmap.png`);
  }

  console.log(`造型    ${ctx.shapeId}（${SHAPES.find((s) => s.id === ctx.shapeId).name}）`);
  console.log(`三角    ${ctx.geo.triCount.toLocaleString()}`);
  console.log(`估算    ${ctx.est.grams.toFixed(0)} g / ${ctx.est.hours.toFixed(1)} h（实心）`);
  console.log(`编号    ${ctx.number}`);
  for (const w of written) console.log(`写出    ${w}`);
}

function cmdCard(path, flags) {
  globalThis.qrcode = loadQrcode();
  const ctx = buildAll(path, flags);
  const data = cardDataFrom(ctx, flags);
  const sheet = flags.sheet === true || flags.sheet === 'true';
  const markup = sheet ? sheetSvg(data) : cardSvg(data);
  const out = withExt(flags.out || `${ctx.number}-card`, '.svg');
  save(out, markup);
  console.log(`卡片    ${out}（${sheet ? 'A4 四张' : '单张 85×54mm'}）`);
  console.log(`编号    ${ctx.number}`);
}

function cmdPage(path, flags) {
  globalThis.qrcode = loadQrcode();
  const ctx = buildAll(path, flags);
  const cardData = cardDataFrom(ctx, flags);
  const seconds = num(flags.seconds, 20);
  const targetRate = seconds > 40 ? 11025 : 16000;
  const seg = sliceSeconds(ctx.mono, ctx.sampleRate, num(flags.start, 0), num(flags.start, 0) + seconds);
  const resampled = resampleAudio(seg, ctx.sampleRate, targetRate);
  const wavBytes = encodeWav(resampled, targetRate, 16);
  let bin = '';
  for (let i = 0; i < wavBytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, wavBytes.subarray(i, i + 0x8000));
  }
  const audioDataUrl = `data:audio/wav;base64,${Buffer.from(bin, 'latin1').toString('base64')}`;

  const html = buildFossilPage({
    ...cardData,
    // qr 是 cardSvg 的第二个参数（opts），放进 data 里不起作用，页面照样会长出二维码
    cardSvgMarkup: cardSvg(cardData, { qr: false }),
    audioDataUrl,
  });
  const out = withExt(flags.out || `${ctx.number}`, '.html');
  save(out, html);
  console.log(`标本页  ${out}（${(html.length / 1024 / 1024).toFixed(2)} MB，音频 ${targetRate} Hz）`);
  console.log(`编号    ${ctx.number}`);
  console.log('上传到任意静态托管后，把地址填进卡片的 --qr 就能扫码听声。');
}

const USAGE = `声音化石 · 命令行

  node fossil.js info   <input.wav>
  node fossil.js make   <input.wav> [--shape slice|ring|column] [--format stl|obj|glb|svg|png|all]
                        [--out 输出名] [--size 80] [--height 8] [--base 2.5] [--grid 200]
                        [--gain 1] [--invert] [--no-rim] [--no-strata]
                        [--seconds 20] [--start 0]
                        [--ring-step 1.2] [--col-h 45] [--col-r 10] [--col-a 5]
  node fossil.js card   <input.wav> [--title "标题"] [--place "地点"] [--qr "内容"] [--sheet] [--out card.svg]
  node fossil.js page   <input.wav> [--title "标题"] [--out page.html]

只直接支持 WAV。其他格式先转：ffmpeg -i in.mp3 -ac 1 -ar 32000 out.wav
`;

function main() {
  const { cmd, input, flags } = parseArgs(process.argv.slice(2));
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(USAGE);
    return;
  }
  if (!input) {
    console.error('缺少输入文件。');
    process.stdout.write(USAGE);
    process.exitCode = 1;
    return;
  }
  if (cmd === 'info') cmdInfo(input, flags);
  else if (cmd === 'make') cmdMake(input, flags);
  else if (cmd === 'card') cmdCard(input, flags);
  else if (cmd === 'page') cmdPage(input, flags);
  else {
    console.error(`没有这个命令：${cmd}`);
    process.stdout.write(USAGE);
    process.exitCode = 1;
  }
}

main();
