import { analyze, sampleField } from '../lib/features.js';
import { fingerprint, resampleSequence } from '../lib/dsp.js';
import { buildShape, SHAPES, DEFAULTS } from '../lib/shapes.js';
import { buildGeometry, estimatePrint } from '../lib/mesh.js';
import { stlBinary, objText, svgForShape } from '../lib/writers.js';
import { glbBinary } from '../lib/glb.js';
import { createPreview } from './preview.js';
import { cardSvg, sheetSvg, CARD } from '../lib/card-svg.js';
import { buildFossilPage } from '../lib/publish.js';
import { decodeFile, startRecording, monoToWav, playRange, toDataUrl } from './audio-io.js';
import { renderDemoSound, DEMO_SOUNDS } from '../lib/demo-sounds.js';
import * as shelf from './shelf.js';
import {
  downloadBytes,
  downloadText,
  downloadBlobUrl,
  svgToPngBlob,
  uid,
  stampId,
  fmtDuration,
} from './util.js';

const $ = (id) => document.getElementById(id);

const state = {
  mono: null,
  sampleRate: 0,
  features: null,
  shapeId: 'slice',
  params: { ...DEFAULTS },
  win: { start: 0, seconds: 20 },
  title: '',
  place: '',
  geometry: null,
  spec: null,
  number: 'SF-00000000-0000',
  playing: null,
  rec: null,
  colorHeight: false,
};

let preview = null;
let pendingAnalysis = false;
let timer = 0;

function schedule(delay, reanalyze) {
  if (reanalyze) pendingAnalysis = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const a = pendingAnalysis;
    pendingAnalysis = false;
    rebuild(a);
  }, delay);
}

function shapeNameOf(id) {
  const s = SHAPES.find((x) => x.id === id);
  return s ? s.name : id;
}

// ---- 取声 ---------------------------------------------------------------

function setSource(mono, sampleRate, name) {
  if (mono.length < sampleRate * 0.3) {
    alert(`这段声音只有 ${(mono.length / sampleRate).toFixed(2)} 秒，太短了，做不出化石。`);
    return false;
  }
  state.mono = mono;
  state.sampleRate = sampleRate;
  state.win = { start: 0, seconds: Math.min(20, mono.length / sampleRate) };
  state.number = `SF-${stampId()}-${fingerprint(mono).slice(0, 4)}`;

  const dur = mono.length / sampleRate;
  $('rStart').max = Math.max(0, dur - state.win.seconds).toFixed(1);
  $('rStart').value = 0;
  $('rStart').disabled = dur <= state.win.seconds;
  $('rLen').max = Math.max(5, dur).toFixed(0);
  $('rLen').value = state.win.seconds.toFixed(0);
  $('outStart').value = '0.0s';
  $('outLen').value = `${Math.round(state.win.seconds)}s`;
  $('srcName').textContent = name;

  pendingAnalysis = true;
  rebuild(true);
  return true;
}

function loadDemo(id) {
  const { mono, name } = renderDemoSound(id, 20, 32000);
  setSource(mono, 32000, `示例 · ${name}`);
}

async function onFile(file) {
  if (!file) return;
  try {
    const { mono, sampleRate } = await decodeFile(file);
    setSource(mono, sampleRate, file.name);
  } catch (e) {
    alert(`这个文件解不开：${e.message}\n\n浏览器原生解码支持 wav / mp3 / flac / ogg / m4a。`);
  }
}

async function onRecord() {
  $('btnRecord').hidden = true;
  $('btnStop').hidden = false;
  $('recTime').hidden = false;
  $('recTime').textContent = '正在请求麦克风…';
  let handle = null;
  try {
    handle = await startRecording(60, (t) => {
      $('recTime').textContent = `录音中 ${t.toFixed(1)}s（点「完成」提前结束）`;
    });
    state.rec = handle;
    const { mono, sampleRate } = await handle.promise;
    setSource(mono, sampleRate, '现场录音');
  } catch (e) {
    alert(`录音失败：${e.message}`);
  }
  state.rec = null;
  $('btnRecord').hidden = false;
  $('btnStop').hidden = true;
  $('recTime').hidden = true;
}

function onStopRecord() {
  if (state.rec) state.rec.stop();
}

// ---- 分析与构建 ---------------------------------------------------------

function ensureFeatures() {
  if (!state.mono) return false;
  state.features = analyze(state.mono, state.sampleRate, {
    seconds: state.win.seconds,
    start: state.win.start,
  });
  return true;
}

function rebuild(reanalyze) {
  if (!state.mono) return;
  if (reanalyze || !state.features) ensureFeatures();

  const t0 = performance.now();
  state.spec = buildShape(state.shapeId, state.features, state.params);
  state.geometry = buildGeometry(state.spec);
  const ms = Math.round(performance.now() - t0);

  preview.setGeometry(state.geometry);

  const est = estimatePrint(state.geometry.volume);
  $('estimate').innerHTML =
    `${state.geometry.triCount.toLocaleString()} 三角　约 ${est.grams.toFixed(0)} g　约 ${est.hours.toFixed(1)} 小时` +
    `<br><span class="muted">实心估算，开填充后会更省　几何 ${ms}ms</span>`;
  $('triInfo').textContent = `${state.geometry.triCount.toLocaleString()} 三角`;

  const info = state.features.stats;
  $('audioInfo').hidden = false;
  $('audioInfo').innerHTML =
    `<dt>时长</dt><dd>${fmtDuration(info.totalDuration)}</dd>` +
    `<dt>主频</dt><dd>${Math.round(info.dominantHz)} Hz</dd>` +
    `<dt>峰值</dt><dd>${info.peakDb.toFixed(1)} dB</dd>` +
    `<dt>取样</dt><dd>${info.sampleRate} Hz</dd>`;

  renderCardBox();
}

function cardDataFor(opts = {}) {
  return {
    number: state.number,
    title: state.title || '无题',
    duration: state.features.stats.duration,
    dominantHz: state.features.stats.dominantHz,
    peakDb: state.features.stats.peakDb,
    shapeName: shapeNameOf(state.shapeId),
    when: Date.now(),
    place: state.place,
    envelope: resampleSequence(state.features.envelope, 180),
    // 留空就是不留码。带个说明比扫出一串编号强。
    qrText: $('tQr').value.trim(),
    ...opts,
  };
}

function renderCardBox() {
  if (!state.features) return;
  $('cardBox').innerHTML = cardSvg(cardDataFor());
}

// ---- 导出 ---------------------------------------------------------------

function baseName() {
  return `${state.number}-${state.shapeId}`;
}

function exportStl() {
  const g = state.geometry;
  downloadBytes(stlBinary(g.positions, g.indices, g.triCount), `${baseName()}.stl`, 'model/stl');
}

function exportObj() {
  const g = state.geometry;
  downloadText(objText(g.positions, g.indices, g.triCount), `${baseName()}.obj`);
}

function exportGlb() {
  const g = state.geometry;
  downloadBytes(glbBinary(g.positions, g.indices, g.triCount), `${baseName()}.glb`, 'model/gltf-binary');
}

function exportHeightPng() {
  const size = 512;
  const field = sampleField(state.spec, size, size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(Math.max(0, Math.min(1, field[i])) * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  canvas.toBlob((blob) => {
    if (blob) downloadBlobUrl(blob, `${baseName()}-heightmap.png`);
  }, 'image/png');
}

function exportSvg() {
  const kind = state.spec.kind === 'grid' ? 'layers' : 'profile';
  downloadText(svgForShape(state.spec, { layers: 8 }), `${baseName()}-${kind}.svg`, 'image/svg+xml;charset=utf-8');
}

async function exportCardPng() {
  const svg = cardSvg(cardDataFor());
  try {
    const blob = await svgToPngBlob(svg, CARD.w, CARD.h, 1.5);
    downloadBlobUrl(blob, `${baseName()}-card.png`);
  } catch (e) {
    alert(e.message);
  }
}

function doPrint() {
  $('printArea').innerHTML = sheetSvg(cardDataFor());
  document.body.classList.add('printing');
  setTimeout(() => {
    window.print();
    document.body.classList.remove('printing');
  }, 150);
}

function exportPage() {
  const data = cardDataFor();
  const wav = monoToWav(state.mono, state.sampleRate, {
    targetRate: data.duration > 40 ? 11025 : 16000,
    start: state.win.start,
    end: state.win.start + state.win.seconds,
  });
  const audioDataUrl = toDataUrl(wav.bytes);
  // 页面自己就是那枚标本，卡上不再需要二维码
  const html = buildFossilPage({
    ...data,
    cardSvgMarkup: cardSvg({ ...data, qr: false }),
    audioDataUrl,
  });
  downloadText(html, `${state.number}.html`, 'text/html;charset=utf-8');
  $('pubInfo').textContent =
    `标本页 ${(html.length / 1024 / 1024).toFixed(2)} MB（音频压到 ${wav.sampleRate} Hz）。` +
    `上传后把地址粘回「二维码指向」。`;
}

function saveToShelf() {
  if (!state.features) return;
  const data = cardDataFor();
  const wav = monoToWav(state.mono, state.sampleRate, {
    targetRate: 8000,
    start: state.win.start,
    end: state.win.start + state.win.seconds,
  });
  const ok = shelf.add({
    id: uid(),
    number: state.number,
    title: state.title || '无题',
    createdAt: Date.now(),
    place: state.place,
    shapeId: state.shapeId,
    params: { ...state.params },
    stats: {
      duration: state.features.stats.duration,
      dominantHz: state.features.stats.dominantHz,
      peakDb: state.features.stats.peakDb,
    },
    envelope: Array.from(resampleSequence(state.features.envelope, 90)),
    cardMarkup: cardSvg(data),
    audioUrl: toDataUrl(wav.bytes),
    publishedUrl: $('tQr').value.trim() || null,
  });
  $('pubInfo').textContent = ok ? '已存入标本册。' : '存进去了，但空间不足，较早的音频已被清理。';
}

// ---- 装配 ---------------------------------------------------------------

function syncShapeUi() {
  const kind = state.shapeId === 'column' ? 'lathe' : state.shapeId === 'ring' ? 'disc' : 'grid';
  $('fSize').hidden = kind === 'lathe';
  $('fHeight').hidden = kind === 'lathe';
  $('fBase').hidden = kind === 'lathe';
  $('fColH').hidden = kind !== 'lathe';
  $('fColR').hidden = kind !== 'lathe';
  $('fColA').hidden = kind !== 'lathe';
  $('lStrata').hidden = kind !== 'lathe';
  $('btnPng').disabled = kind === 'lathe';
  for (const btn of document.querySelectorAll('#shapes button')) {
    btn.classList.toggle('on', btn.dataset.shape === state.shapeId);
  }
  $('btnSvg').textContent = kind === 'grid' ? 'SVG 层切' : 'SVG 轮廓';
}

function buildShapeButtons() {
  const host = $('shapes');
  host.innerHTML = '';
  for (const s of SHAPES) {
    const b = document.createElement('button');
    b.textContent = s.name;
    b.dataset.shape = s.id;
    b.addEventListener('click', () => {
      state.shapeId = s.id;
      syncShapeUi();
      rebuild(false);
    });
    host.appendChild(b);
  }
}

function bind() {
  $('btnUpload').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', (e) => onFile(e.target.files[0]));

  const sel = $('demo');
  for (const d of DEMO_SOUNDS) {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = `${d.name} — ${d.hint}`;
    sel.appendChild(o);
  }
  $('btnDemo').addEventListener('click', () => loadDemo(sel.value));
  $('btnRecord').addEventListener('click', onRecord);
  $('btnStop').addEventListener('click', () => {
    if (state.rec) state.rec.stop();
  });

  $('btnPlay').addEventListener('click', () => {
    if (!state.mono) return;
    if (state.playing) {
      state.playing.stop();
      state.playing = null;
      $('btnPlay').textContent = '试听';
      return;
    }
    state.playing = playRange(
      state.mono,
      state.sampleRate,
      state.win.start,
      state.win.start + state.win.seconds
    );
    $('btnPlay').textContent = '停止';
    setTimeout(() => {
      state.playing = null;
      $('btnPlay').textContent = '试听';
    }, state.win.seconds * 1000);
  });

  $('rStart').addEventListener('input', (e) => {
    state.win.start = parseFloat(e.target.value);
    $('outStart').value = `${state.win.start.toFixed(1)}s`;
    schedule(220, true);
  });
  $('rLen').addEventListener('input', (e) => {
    state.win.seconds = parseFloat(e.target.value);
    $('outLen').value = `${Math.round(state.win.seconds)}s`;
    const dur = state.mono ? state.mono.length / state.sampleRate : 0;
    $('rStart').max = Math.max(0, dur - state.win.seconds).toFixed(1);
    $('rStart').disabled = dur <= state.win.seconds;
    schedule(260, true);
  });

  const bindRange = (id, out, key, fmt) => {
    $(id).addEventListener('input', (e) => {
      state.params[key] = parseFloat(e.target.value);
      $(out).value = fmt(state.params[key]);
      schedule(90, false);
    });
  };
  bindRange('rSize', 'outSize', 'size', (v) => `${v} mm`);
  bindRange('rHeight', 'outHeight', 'height', (v) => `${v} mm`);
  bindRange('rBase', 'outBase', 'base', (v) => `${v.toFixed(1)} mm`);
  bindRange('rColH', 'outColH', 'columnHeight', (v) => `${v} mm`);
  bindRange('rColR', 'outColR', 'columnRadius', (v) => `${v} mm`);
  bindRange('rColA', 'outColA', 'columnAmp', (v) => `${v} mm`);
  bindRange('rGrid', 'outGrid', 'grid', (v) => `${v}`);
  bindRange('rGain', 'outGain', 'gain', (v) => v.toFixed(1));

  $('cRim').addEventListener('change', (e) => {
    state.params.rim = e.target.checked;
    schedule(60, false);
  });
  $('cInvert').addEventListener('change', (e) => {
    state.params.invert = e.target.checked;
    schedule(60, false);
  });
  $('cStrata').addEventListener('change', (e) => {
    state.params.strata = e.target.checked;
    schedule(60, false);
  });

  $('tTitle').addEventListener('input', (e) => {
    state.title = e.target.value;
    renderCardBox();
  });
  $('tPlace').addEventListener('input', (e) => {
    state.place = e.target.value;
    renderCardBox();
  });
  $('tQr').addEventListener('input', renderCardBox);

  $('btnGeo').addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('这个浏览器不给定位。直接在地点框里手写就行。');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        state.place = `${p.coords.latitude.toFixed(2)}, ${p.coords.longitude.toFixed(2)}`;
        $('tPlace').value = state.place;
        renderCardBox();
      },
      () => alert('定位被拒或不可用。直接在地点框里手写就行。'),
      { timeout: 6000 }
    );
  });

  $('btnStl').addEventListener('click', exportStl);
  $('btnObj').addEventListener('click', exportObj);
  $('btnGlb').addEventListener('click', exportGlb);
  $('btnPng').addEventListener('click', exportHeightPng);
  $('btnSvg').addEventListener('click', exportSvg);
  $('btnCardPng').addEventListener('click', exportCardPng);
  $('btnPrint').addEventListener('click', doPrint);
  $('btnPage').addEventListener('click', exportPage);
  $('btnSave').addEventListener('click', saveToShelf);

  $('btnColor').addEventListener('click', () => {
    state.colorHeight = !state.colorHeight;
    preview.setColorMode(state.colorHeight ? 'height' : 'solid');
    $('btnColor').textContent = state.colorHeight ? '单色' : '高度着色';
  });
  $('btnFit').addEventListener('click', () => preview.fit());
}

// WebGL 可能被禁用或不支持，预览降级后其余功能照常。
function nullPreview() {
  return {
    setGeometry() {},
    setColorMode() {},
    fit() {},
  };
}

function init() {
  try {
    preview = createPreview($('view'));
  } catch (e) {
    preview = nullPreview();
    $('view').hidden = true;
    const tip = document.createElement('p');
    tip.className = 'muted small';
    tip.style.padding = '16px';
    tip.textContent = `这台机器的 WebGL 不可用（${e.message}），3D 预览已关闭，其余功能照常。`;
    $('view').parentNode.insertBefore(tip, $('view'));
  }
  buildShapeButtons();
  syncShapeUi();
  bind();
  loadDemo('voice');
}

init();
