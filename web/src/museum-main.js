import { analyze } from '../lib/features.js';
import { bufferToMono } from './audio-io.js';
import { buildShape, SHAPES } from '../lib/shapes.js';
import { buildGeometry, estimatePrint } from '../lib/mesh.js';
import { createPreview } from './preview.js';
import { cardSvg } from '../lib/card-svg.js';
import { buildAlbumPage } from '../lib/publish.js';
import * as shelf from './shelf.js';
import { downloadText } from './util.js';

const $ = (id) => document.getElementById(id);
const ctx = new (window.AudioContext || window.webkitAudioContext)();

let preview = null;
let active = null;

function shapeName(id) {
  const s = SHAPES.find((x) => x.id === id);
  return s ? s.name : id;
}

function stamp(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function render() {
  const items = shelf.list();
  const host = $('shelf');
  host.innerHTML = '';
  $('empty').hidden = items.length > 0;

  for (const it of items) {
    const card = document.createElement('div');
    card.className = 'specimen';

    const box = document.createElement('div');
    box.className = 'card-box';
    box.innerHTML = it.cardMarkup || '';
    card.appendChild(box);

    const bar = document.createElement('div');
    bar.className = 'bar';
    const bOpen = document.createElement('button');
    bOpen.textContent = '查看';
    bOpen.addEventListener('click', () => openItem(it));
    const bDel = document.createElement('button');
    bDel.textContent = '删除';
    bDel.addEventListener('click', () => {
      shelf.remove(it.id);
      render();
    });
    bar.appendChild(bOpen);
    bar.appendChild(bDel);
    card.appendChild(bar);

    host.appendChild(card);
  }
}

async function openItem(it) {
  active = it;
  $('modal').hidden = false;
  $('mNum').textContent = it.number;
  $('mTitle').textContent = it.title;
  $('mMeta').innerHTML =
    `<dt>采集</dt><dd>${stamp(it.createdAt)}</dd>` +
    `<dt>时长</dt><dd>${it.stats.duration.toFixed(1)}s</dd>` +
    `<dt>主频</dt><dd>${Math.round(it.stats.dominantHz)} Hz</dd>` +
    `<dt>造型</dt><dd>${shapeName(it.shapeId)}</dd>` +
    `<dt>地点</dt><dd>${it.place || '—'}</dd>`;

  if (it.audioUrl) {
    $('mAudio').src = it.audioUrl;
    $('mNote').textContent = '音频存在本机，8kHz 单声道。';
  } else {
    $('mAudio').removeAttribute('src');
    $('mNote').textContent = '为了腾空间，这枚的音频已被清理，卡片与模型参数还在。';
  }

  if (!preview) preview = createPreview($('view'));

  if (it.audioUrl) {
    try {
      const res = await fetch(it.audioUrl);
      const ab = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      const feats = analyze(bufferToMono(buf), buf.sampleRate, { seconds: 20 });
      const geo = buildGeometry(buildShape(it.shapeId, feats, it.params || {}));
      preview.setGeometry(geo);
      const est = estimatePrint(geo.volume);
      $('mMeta').innerHTML += `<dt>估算</dt><dd>${est.grams.toFixed(0)} g / ${est.hours.toFixed(1)} h</dd>`;
      $('mNote').textContent = '按保存的参数重算，音频为 8kHz 单声道。';
    } catch (e) {
      $('mNote').textContent = '模型重算失败：' + e.message;
    }
  }
}

function closeModal() {
  $('modal').hidden = true;
  $('mAudio').removeAttribute('src');
  active = null;
}

$('mClose').addEventListener('click', closeModal);
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

$('mDelete').addEventListener('click', () => {
  if (!active) return;
  shelf.remove(active.id);
  closeModal();
  render();
});

$('btnAlbum').addEventListener('click', () => {
  const items = shelf.list();
  if (items.length === 0) {
    alert('标本册是空的。');
    return;
  }
  const html = buildAlbumPage(
    items.map((it) => ({
      number: it.number,
      title: it.title,
      date: stamp(it.createdAt),
      shapeName: shapeName(it.shapeId),
      cardMarkup: it.cardMarkup,
    }))
  );
  downloadText(html, '声音化石-标本册.html', 'text/html;charset=utf-8');
});

render();
