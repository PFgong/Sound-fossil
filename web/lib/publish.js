// 生成可以单独打开的单文件标本页。音频与卡片图片全部内嵌 base64，
// 发布到任何静态托管后就是一个不需要后端、不需要外部资源的页面。

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

const PAGE_CSS = `
:root{--paper:#F5F1E8;--ink:#1F2328;--muted:#5F5E5A;--rule:#D3D1C7}
*{box-sizing:border-box}
svg.card{width:100%;height:auto;display:block}
body{margin:0;background:#EFECE4;color:var(--ink);
font:15px/1.7 system-ui,'PingFang SC','Microsoft YaHei',sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px 16px}
.wrap{max-width:560px;width:100%;background:var(--paper);border:1px solid var(--rule);
padding:28px 26px 24px}
.num{font:12px/1 'SFMono-Regular',Consolas,monospace;letter-spacing:.18em;color:var(--muted);
border:1px solid var(--rule);display:inline-block;padding:6px 10px}
h1{font:500 30px/1.4 'Songti SC','Source Han Serif SC',Georgia,serif;margin:18px 0 14px}
hr{border:0;border-top:1px solid var(--rule);margin:16px 0}
img.card{width:100%;height:auto;display:block;border:1px solid var(--rule)}
.meta{font-size:13px;color:var(--muted);display:grid;grid-template-columns:auto 1fr;gap:4px 16px}
.meta b{font-weight:400;color:var(--ink)}
.player{margin-top:18px;display:flex;align-items:center;gap:14px}
button.play{width:56px;height:56px;border-radius:50%;border:1px solid var(--ink);
background:transparent;cursor:pointer;display:grid;place-items:center;padding:0;flex:none}
button.play svg{width:20px;height:20px;fill:none;stroke:var(--ink);stroke-width:1.4}
.bar{flex:1;height:36px;display:block;width:100%}
.time{font:12px/1 monospace;color:var(--muted);margin-top:8px}
.foot{margin-top:20px;display:flex;justify-content:space-between;font-size:11px;
color:var(--muted);letter-spacing:.12em}
`;

export function buildFossilPage(data) {
  const {
    number,
    title,
    when,
    place,
    duration,
    dominantHz,
    peakDb,
    shapeName,
    cardSvgMarkup,
    audioDataUrl,
  } = data;

  const stamp = new Date(when || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  const stampText = `${stamp.getFullYear()}-${p(stamp.getMonth() + 1)}-${p(stamp.getDate())} ${p(stamp.getHours())}:${p(stamp.getMinutes())}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title || '无题')} · 声音化石</title>
<meta name="description" content="一枚声音化石：${esc(title || '无题')}">
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
  <span class="num">${esc(number)}</span>
  <h1>${esc(title || '无题')}</h1>
  <hr>
  ${cardSvgMarkup ? cardSvgMarkup.replace('<svg ', '<svg class="card" ') : ''}
  <hr>
  <div class="meta">
    <b>采集</b><span>${esc(stampText)}${place ? '　' + esc(place) : ''}</span>
    <b>时长</b><span>${esc(fmtDuration(duration || 0))}</span>
    <b>主频</b><span>${Math.round(dominantHz || 0)} Hz</span>
    <b>峰值</b><span>${(peakDb || 0).toFixed(1)} dB</span>
    <b>造型</b><span>${esc(shapeName || '切片浮雕')}</span>
  </div>
  <div class="player">
    <button class="play" id="btn" aria-label="播放">
      <svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" stroke-linejoin="round"/></svg>
    </button>
    <div style="flex:1">
      <canvas class="bar" id="bar" height="36"></canvas>
      <div class="time" id="time">00:00 / ${esc(fmtDuration(duration || 0))}</div>
    </div>
  </div>
  <div class="foot"><span>声音化石</span><span>SOUND FOSSIL</span></div>
</div>
<audio id="au" preload="auto" src="${audioDataUrl || ''}"></audio>
<script>
(function(){
  var au=document.getElementById('au'),btn=document.getElementById('btn'),
      bar=document.getElementById('bar'),time=document.getElementById('time');
  function fmt(s){s=s||0;var m=Math.floor(s/60),r=s-m*60;
    return (m<10?'0':'')+m+':'+(r<10?'0':'')+r.toFixed(1);}
  function draw(peaks){
    if(!peaks)return;
    var w=bar.width=bar.clientWidth*2,h=72,c=bar.getContext('2d');
    c.clearRect(0,0,w,h);
    c.fillStyle='#1F2328';
    for(var i=0;i<w;i++){
      var v=peaks[Math.floor(i/w*peaks.length)]||0;
      var hh=Math.max(1,v*(h-8));
      c.fillRect(i,(h-hh)/2,1,hh);
    }
  }
  try{draw(JSON.parse(document.body.dataset.peaks||'[]'));}catch(e){}
  btn.addEventListener('click',function(){
    if(au.paused){au.play();btn.innerHTML='<svg viewBox="0 0 24 24"><rect x="7" y="5" width="3.5" height="14"/><rect x="13.5" y="5" width="3.5" height="14"/></svg>';}
    else{au.pause();btn.innerHTML='<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" stroke-linejoin="round"/></svg>';}
  });
  au.addEventListener('timeupdate',function(){
    time.textContent=fmt(au.currentTime)+' / '+fmt(au.duration);
  });
  au.addEventListener('ended',function(){
    btn.innerHTML='<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" stroke-linejoin="round"/></svg>';
  });
})();
</script>
</body>
</html>`;
}

// 把整本标本册导成一张可以打印、也可以发布的页面。
export function buildAlbumPage(items) {
  const cards = items
    .map(
      (it) => `  <figure>
    ${it.cardMarkup ? it.cardMarkup.replace('<svg ', '<svg class="card" ') : ''}
    <figcaption><span>${esc(it.number)}</span>${esc(it.title)}<br>
      <small>${esc(it.date)}　${esc(it.shapeName || '')}</small></figcaption>
  </figure>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>声音化石 · 标本册</title>
<style>
body{margin:0;background:#EFECE4;color:#1F2328;font:14px/1.7 system-ui,'PingFang SC',sans-serif;padding:40px 16px}
.wrap{max-width:1000px;margin:0 auto}
h1{font:500 26px/1.4 'Songti SC',Georgia,serif;margin:0 0 4px}
p.sub{color:#5F5E5A;font-size:13px;margin:0 0 30px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}
figure{margin:0;background:#F5F1E8;border:1px solid #D3D1C7;padding:12px}
img{width:100%;display:block;border:1px solid #D3D1C7}
figcaption{margin-top:10px;font:500 15px/1.5 'Songti SC',Georgia,serif}
figcaption span{display:block;font:11px/1.6 monospace;letter-spacing:.14em;color:#5F5E5A;margin-bottom:4px}
figcaption small{font:11px/1.6 monospace;color:#5F5E5A;font-weight:400}
</style>
</head>
<body>
<div class="wrap">
<h1>声音化石</h1>
<p class="sub">共 ${items.length} 枚</p>
<div class="grid">
${cards}
</div>
</div>
</body>
</html>`;
}

export function buildIndexPage(items) {
  const rows = items
    .map(
      (it) =>
        `<li><a href="${esc(it.url)}">${esc(it.number)}　${esc(it.title)}</a><span>${esc(it.date)}</span></li>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>声音化石 · 标本册</title>
<style>
body{margin:0;background:#EFECE4;color:#1F2328;font:15px/1.7 system-ui,'PingFang SC',sans-serif;padding:48px 16px}
.wrap{max-width:640px;margin:0 auto}
h1{font:500 26px/1.4 'Songti SC',Georgia,serif;margin:0 0 6px}
p.sub{color:#5F5E5A;font-size:13px;margin:0 0 28px}
hr{border:0;border-top:1px solid #D3D1C7}
ul{list-style:none;padding:0;margin:0}
li{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #D3D1C7}
a{color:#1F2328;text-decoration:none}
a:hover{text-decoration:underline}
span{color:#5F5E5A;font:12px/1.8 monospace}
</style>
</head>
<body>
<div class="wrap">
<h1>声音化石</h1>
<p class="sub">每一块化石都能扫开听到原声。</p>
<hr>
<ul>
${rows}
</ul>
</div>
</body>
</html>`;
}
