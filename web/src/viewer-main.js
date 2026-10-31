// 查看模型：把 .stl / .obj / .glb 读回来在浏览器里转一转。
// 命令行那条通道生成完没法预览，这个页面补上那一环。

import { createPreview } from './preview.js';
import { parseModel, signedVolumeMm3, bounds } from '../lib/readers.js';
import { estimatePrint } from '../lib/mesh.js';

const $ = (id) => document.getElementById(id);

const preview = createPreview($('view'));
let colorMode = 'height';

function mm(n) {
  return `${n.toFixed(1)} mm`;
}

function showInfo(model) {
  const b = bounds(model.positions);
  const vol = signedVolumeMm3(model.positions, model.indices);
  const est = estimatePrint(vol);

  const rows = [
    ['文件', model.name],
    ['三角', model.triCount.toLocaleString('en-US')],
    ['尺寸', `${mm(b.hi[0] - b.lo[0])} × ${mm(b.hi[1] - b.lo[1])} × ${mm(b.hi[2] - b.lo[2])}`],
    ['体积', `${(vol / 1000).toFixed(1)} cm³`],
    ['实心估算', `约 ${est.grams.toFixed(0)} g · ${est.hours.toFixed(1)} h`],
  ];

  const dl = $('vInfo');
  dl.hidden = false;
  dl.innerHTML = rows
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('');
}

async function load(file) {
  if (!file) return;
  $('vName').textContent = `读 ${file.name} …`;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const model = parseModel(bytes, file.name);
    preview.setGeometry(model);
    preview.setColorMode(colorMode);
    $('vName').textContent = file.name;
    showInfo(model);
  } catch (e) {
    $('vName').textContent = `读不出来：${e.message}`;
  }
}

function wire() {
  $('btnPick').addEventListener('click', () => $('pick').click());
  $('pick').addEventListener('change', (e) => load(e.target.files[0]));

  const drop = $('drop');
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.style.background = '#f0e9d8';
  });
  drop.addEventListener('dragleave', () => {
    drop.style.background = '';
  });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.style.background = '';
    load(e.dataTransfer.files[0]);
  });

  $('btnFit').addEventListener('click', () => preview.fit());
  $('btnColor').addEventListener('click', () => {
    colorMode = colorMode === 'height' ? 'plain' : 'height';
    preview.setColorMode(colorMode);
  });
}

wire();

// ?f=xxx 时直接去取。用来链到已经部署好的模型：viewer.html?f=标本/0001.glb
// 页面本身没法读本地磁盘上的文件，那种情况只能拖进来或点按钮选。
const q = new URLSearchParams(location.search).get('f');
if (q) {
  fetch(q)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((ab) => {
      const model = parseModel(new Uint8Array(ab), q.split('/').pop());
      preview.setGeometry(model);
      preview.setColorMode(colorMode);
      $('vName').textContent = model.name;
      showInfo(model);
    })
    .catch((e) => {
      $('vName').textContent = `取不到 ${q}：${e.message}。拖进来或点按钮选也一样。`;
    });
}
