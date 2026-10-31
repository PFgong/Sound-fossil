// 标本卡渲染成 SVG。矢量、可打印、两条通道共用：
// 浏览器直接内联显示，Node CLI 直接写文件，发布页直接内嵌。
// 坐标单位是 0.1mm，卡片 850 × 540 = 85 × 54 mm。

export const CARD = { w: 850, h: 540 };

const INK = '#1F2328';
const MUTED = '#5F5E5A';
const RULE = '#D3D1C7';
const PAPER = '#F5F1E8';

const SERIF = "'Songti SC','Source Han Serif SC','Noto Serif SC',Georgia,serif";
const SANS = "system-ui,'PingFang SC','Microsoft YaHei',sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Roboto Mono',monospace";

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isWide(ch) {
  const c = ch.codePointAt(0);
  return c >= 0x1100 && c <= 0x9fff;
}

// SVG 里量不出文字宽度，按全角 1em、半角 0.5em 估算就够了。
function textWidth(str, fs) {
  let w = 0;
  for (const ch of str) w += isWide(ch) ? fs : fs * 0.5;
  return w;
}

function fitText(str, maxWidth, fs) {
  if (textWidth(str, fs) <= maxWidth) return str;
  let t = str;
  while (t.length > 1 && textWidth(t + '…', fs) > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const r = (s - m * 60).toFixed(1);
  return `${String(m).padStart(2, '0')}:${r.padStart(4, '0')}`;
}

function fmtStamp(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 二维码：按行合并连续黑块，用一根有粗度的横线画出来，比逐个方块省很多。
function qrPaths(text, size) {
  const maker = typeof qrcode === 'function' ? qrcode : null;
  let q;
  if (maker && text) {
    try {
      q = maker(0, 'M');
      q.addData(text);
      q.make();
    } catch (e) {
      void e;
      q = null;
    }
  }
  if (!q) return null;
  const n = q.getModuleCount();
  const m = size / (n + 8);
  const segs = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (q.isDark(r, c)) {
        let e = c;
        while (e + 1 < n && q.isDark(r, e + 1)) e++;
        const x1 = (c + 4) * m;
        const x2 = (e + 5) * m;
        const y = (r + 4.5) * m;
        segs.push(`M${x1.toFixed(2)} ${y.toFixed(2)}H${x2.toFixed(2)}`);
        c = e + 1;
      } else {
        c++;
      }
    }
  }
  return { d: segs.join(''), sw: m.toFixed(3) };
}

export function cardSvg(data, opts = {}) {
  const number = data.number || 'SF-00000000-0000';
  const title = fitText(data.title || '无题', 730, 58);
  const shapeName = data.shapeName || '切片浮雕';
  const when = fmtStamp(data.when || Date.now());
  const place = data.place ? `　${esc(data.place)}` : '';

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.w}" height="${CARD.h}" viewBox="0 0 ${CARD.w} ${CARD.h}">`
  );
  parts.push(`<rect width="${CARD.w}" height="${CARD.h}" fill="${PAPER}"/>`);
  parts.push(
    `<rect x="30" y="30" width="${CARD.w - 60}" height="${CARD.h - 60}" fill="none" stroke="${RULE}" stroke-width="2"/>`
  );

  const rule = (y) =>
    `<line x1="60" y1="${y}" x2="790" y2="${y}" stroke="${RULE}" stroke-width="2"/>`;

  parts.push(rule(60));

  // 编号
  parts.push(
    `<rect x="60" y="80" width="340" height="44" fill="none" stroke="${RULE}" stroke-width="1.5"/>`
  );
  parts.push(
    `<text x="80" y="114" font-family="${MONO}" font-size="24" letter-spacing="5" fill="${MUTED}">${esc(number)}</text>`
  );

  // 标题
  parts.push(
    `<text x="60" y="196" font-family="${SERIF}" font-size="58" fill="${INK}">${esc(title)}</text>`
  );

  parts.push(rule(230));

  // 参数
  const line1 = `时长 ${fmtDuration(data.duration || 0)}　主频 ${Math.round(data.dominantHz || 0)} Hz`;
  const line2 = `峰值 ${(data.peakDb || 0).toFixed(1)} dB　${shapeName}`;
  const line3 = `${when}${place}`;
  parts.push(
    `<text x="60" y="279" font-family="${SANS}" font-size="25" fill="${INK}">${esc(line1)}</text>`
  );
  parts.push(
    `<text x="60" y="317" font-family="${SANS}" font-size="25" fill="${INK}">${esc(line2)}</text>`
  );
  parts.push(
    `<text x="60" y="355" font-family="${SANS}" font-size="25" fill="${MUTED}">${esc(line3)}</text>`
  );

  // 声纹线描：上下镜像后闭合成一条实心剪影
  const env = data.envelope;
  if (env && env.length > 1) {
    const x0 = 60;
    const w = 510;
    const cy = 420;
    const half = 35;
    const seg = [];
    for (let i = 0; i < env.length; i++) {
      const u = i / (env.length - 1);
      const v = Math.max(0, Math.min(1, env[i]));
      seg.push(`${(x0 + u * w).toFixed(1)} ${(cy - v * half).toFixed(1)}`);
    }
    for (let i = env.length - 1; i >= 0; i--) {
      const u = i / (env.length - 1);
      const v = Math.max(0, Math.min(1, env[i]));
      seg.push(`${(x0 + u * w).toFixed(1)} ${(cy + v * half).toFixed(1)}`);
    }
    parts.push(
      `<polygon points="${seg.join(' ')}" fill="${INK}" fill-opacity="0.82"/>`
    );
    parts.push(
      `<line x1="${x0}" y1="${cy}" x2="${x0 + w}" y2="${cy}" stroke="${RULE}" stroke-width="1.2"/>`
    );
  }

  // 二维码。没有内容时留一个虚线空位，而不是拿编号去充数 ——
  // 扫出来一串 SF:2026-…#D63B 对谁都没用，还不如明说这块还空着。
  if (opts.qr !== false) {
    const qr = data.qrText ? qrPaths(data.qrText, 180) : null;
    if (qr) {
      parts.push(
        `<g transform="translate(620 250)"><path d="${qr.d}" stroke="${INK}" stroke-width="${qr.sw}" fill="none"/></g>`
      );
      parts.push(
        `<text x="620" y="454" font-family="${SANS}" font-size="18" fill="${MUTED}">扫码听声</text>`
      );
    } else {
      parts.push(
        `<rect x="620" y="250" width="180" height="180" fill="none" stroke="${RULE}" stroke-width="1" stroke-dasharray="5 5"/>`
      );
      parts.push(
        `<text x="710" y="340" text-anchor="middle" font-family="${SANS}" font-size="14" fill="${MUTED}">尚未填入</text>`
      );
      parts.push(
        `<text x="710" y="362" text-anchor="middle" font-family="${SANS}" font-size="14" fill="${MUTED}">标本页地址</text>`
      );
      parts.push(
        `<text x="620" y="454" font-family="${SANS}" font-size="18" fill="${MUTED}">扫码听声</text>`
      );
    }
  }

  parts.push(rule(476));

  parts.push(
    `<text x="60" y="512" font-family="${SANS}" font-size="22" fill="${MUTED}">声音化石</text>`
  );
  parts.push(
    `<text x="790" y="512" text-anchor="end" font-family="${MONO}" font-size="20" letter-spacing="4" fill="${MUTED}">SOUND FOSSIL</text>`
  );

  parts.push('</svg>');
  return parts.join('');
}

// A4 上排四张，带裁切角线。单位同样是 0.1mm → 2100 × 2970。
export function sheetSvg(data, opts = {}) {
  const gap = 60;
  const totalW = CARD.w * 2 + gap;
  const totalH = CARD.h * 2 + gap;
  const ox = (2100 - totalW) / 2;
  const oy = (2970 - totalH) / 2;

  const inner = cardSvg(data, opts);
  const body = inner.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

  const parts = [];
  parts.push(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2100" height="2970" viewBox="0 0 2100 2970">'
  );
  parts.push('<rect width="2100" height="2970" fill="#FFFFFF"/>');

  const marks = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const x = ox + c * (CARD.w + gap);
      const y = oy + r * (CARD.h + gap);
      parts.push(
        `<g transform="translate(${x} ${y})"><rect x="0" y="0" width="${CARD.w}" height="${CARD.h}" fill="${PAPER}"/>${body}</g>`
      );
      const t = 30;
      for (const [mx, my, sx, sy] of [
        [x, y, 1, 1],
        [x + CARD.w, y, -1, 1],
        [x, y + CARD.h, 1, -1],
        [x + CARD.w, y + CARD.h, -1, -1],
      ]) {
        marks.push(`M${mx} ${my + sy * t}V${my}H${mx + sx * t}`);
      }
    }
  }
  parts.push(
    `<path d="${marks.join('')}" fill="none" stroke="#BBBBBB" stroke-width="2"/>`
  );
  parts.push('</svg>');
  return parts.join('');
}
