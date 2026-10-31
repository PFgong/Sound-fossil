// 把生成的卡片与 A4 版式合成一张预览页，方便直接看看成品长什么样。
// 用法：node tools/gallery.js

import { readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('./testdata/out/', import.meta.url);
const read = (n) => readFileSync(new URL(n, OUT), 'utf8');

const card = read('sample-card.svg');
const sheet = read('sample-a4-sheet.svg');

const css = `
body{margin:0;background:#EFECE4;color:#1F2328;
font:15px/1.7 system-ui,'PingFang SC','Microsoft YaHei',sans-serif;padding:36px 20px 60px}
.wrap{max-width:940px;margin:0 auto}
h1{font:500 26px/1.4 'Songti SC',Georgia,serif;margin:0 0 4px}
p.sub{color:#5F5E5A;font-size:13px;margin:0 0 26px}
section{margin-bottom:34px}
h2{font:500 15px/1 'Songti SC',Georgia,serif;margin:0 0 12px;padding-bottom:8px;
border-bottom:1px solid #D3D1C7}
.single{width:100%;max-width:680px}
.single svg{width:100%;height:auto;display:block}
.sheet{width:100%;max-width:620px}
.sheet svg{width:100%;height:auto;display:block;border:1px solid #D3D1C7}
.note{color:#5F5E5A;font-size:12px;margin-top:10px}
a{color:#1F2328}
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>声音化石 · 成品预览</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
<h1>成品预览</h1>
<p class="sub">由命令行直接生成的 SVG，可以打印，也可以再转成 PNG。</p>

<section>
<h2>标本卡 · 单张 85 × 54 mm</h2>
<div class="single">${card}</div>
<p class="note">右下角的二维码默认刻的是档案坐标。拿到托管地址后重新生成卡片，码就会指向那个页面。</p>
</section>

<section>
<h2>标本卡 · A4 四张带裁切线</h2>
<div class="sheet">${sheet}</div>
<p class="note">直接打印，沿角线裁开，就是四张一样的标本卡。</p>
</section>

<section>
<h2>标本页</h2>
<p><a href="sample-page.html">打开 sample-page.html</a>　音频内嵌在里面，是完整可用的单文件页面。</p>
</section>

</div>
</body>
</html>`;

writeFileSync(new URL('gallery.html', OUT), html);
console.log('gallery.html 已生成');
