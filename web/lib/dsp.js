// 纯计算：FFT、mel 频谱、波形包络、重采样。
// 不依赖任何浏览器或 Node API，两端共用。

export function hann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

export function makeTwiddles(n) {
  const half = n >> 1;
  const cos = new Float32Array(half);
  const sin = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const a = (-2 * Math.PI * i) / n;
    cos[i] = Math.cos(a);
    sin[i] = Math.sin(a);
  }
  return { cos, sin };
}

export function fftInPlace(re, im, tw) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const ti = k * step;
        const wr = tw.cos[ti];
        const wi = tw.sin[ti];
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + half];
        const bi = im[i + k + half];
        const vr = br * wr - bi * wi;
        const vi = br * wi + bi * wr;
        re[i + k] = ar + vr;
        im[i + k] = ai + vi;
        re[i + k + half] = ar - vr;
        im[i + k + half] = ai - vi;
      }
    }
  }
}

export function melScale(f) {
  return 2595 * Math.log10(1 + f / 700);
}

export function melInverse(m) {
  return 700 * (Math.pow(10, m / 2595) - 1);
}

// 三角滤波器组。返回每个频段的 {start, weights}，weights 已钳到非负。
export function melFilterbank(nBands, fftSize, sampleRate, fMin, fMax) {
  const nMels = nBands + 2;
  const mMin = melScale(fMin);
  const mMax = melScale(fMax);
  const pts = new Float32Array(nMels);
  for (let i = 0; i < nMels; i++) {
    pts[i] = melInverse(mMin + ((mMax - mMin) * i) / (nMels - 1));
  }
  const binHz = sampleRate / fftSize;
  const maxBin = fftSize >> 1;
  const filters = [];
  for (let m = 1; m <= nBands; m++) {
    const l = pts[m - 1] / binHz;
    const c = pts[m] / binHz;
    const r = pts[m + 1] / binHz;
    const lb = Math.max(0, Math.floor(l));
    const rb = Math.min(maxBin, Math.ceil(r));
    const w = new Float32Array(rb - lb + 1);
    for (let b = lb; b <= rb; b++) {
      let v;
      if (b <= c) v = c > l ? (b - l) / (c - l) : 0;
      else v = r > c ? (r - b) / (r - c) : 0;
      w[b - lb] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    filters.push({ start: lb, weights: w });
  }
  return filters;
}

// 线性重采样到新长度。
export function resampleSequence(src, n) {
  const out = new Float32Array(n);
  if (src.length === 0) return out;
  if (src.length === 1) {
    out.fill(src[0]);
    return out;
  }
  const scale = (src.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) {
    const p = i * scale;
    const i0 = Math.floor(p);
    const i1 = Math.min(src.length - 1, i0 + 1);
    const f = p - i0;
    out[i] = src[i0] * (1 - f) + src[i1] * f;
  }
  return out;
}

// 简单线性重采样音频本身，用于把高采样率降到够用的水平。
export function resampleAudio(data, srcRate, dstRate) {
  if (srcRate === dstRate) return data;
  const ratio = dstRate / srcRate;
  const outLen = Math.max(1, Math.floor(data.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const p = i / ratio;
    const i0 = Math.floor(p);
    const i1 = Math.min(data.length - 1, i0 + 1);
    const f = p - i0;
    out[i] = data[i0] * (1 - f) + data[i1] * f;
  }
  return out;
}

export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c];
    for (let i = 0; i < n; i++) out[i] += ch[i];
  }
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  return out;
}

// 波形包络：分帧 RMS，转成 dB 后按动态范围归一化到 0-1。
export function computeEnvelope(data, sampleRate, opts = {}) {
  const targetFrames = opts.frames ?? 1000;
  const dynamicRange = opts.dynamicRange ?? 50;
  const hop = Math.max(1, Math.floor(data.length / targetFrames));
  const frameCount = Math.max(1, Math.min(targetFrames, Math.floor(data.length / hop)));
  const dbs = new Float32Array(frameCount);
  let peak = 0;
  for (let f = 0; f < frameCount; f++) {
    const off = f * hop;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < hop && off + i < data.length; i++) {
      const x = data[off + i];
      const m = x < 0 ? -x : 0;
      sum += x * x;
      if (m > peak) peak = m;
      n++;
    }
    const rms = n > 0 ? Math.sqrt(sum / n) : 0;
    dbs[f] = 20 * Math.log10(rms + 1e-12);
  }
  let max = -Infinity;
  for (let i = 0; i < frameCount; i++) if (dbs[i] > max) max = dbs[i];
  const floor = max - dynamicRange;
  const out = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let v = (dbs[i] - floor) / dynamicRange;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return { values: out, peak, peakDb: 20 * Math.log10(peak + 1e-12) };
}

// mel 频谱图。data 是单声道 Float32。
export function computeSpectrogram(data, sampleRate, opts = {}) {
  const fftSize = opts.fftSize ?? 1024;
  const hop = opts.hop ?? fftSize >> 1;
  const nBands = opts.bands ?? 48;
  const fMax = Math.min(opts.fMax ?? 16000, sampleRate / 2);
  const fMin = opts.fMin ?? 20;
  const dynamicRange = opts.dynamicRange ?? 55;

  const padded = new Float32Array(data.length + fftSize);
  padded.set(data, 0);

  const tw = makeTwiddles(fftSize);
  const win = hann(fftSize);
  const filters = melFilterbank(nBands, fftSize, sampleRate, fMin, fMax);
  const maxBin = fftSize >> 1;
  const frameCount = Math.max(1, Math.floor((padded.length - fftSize) / hop) + 1);

  const dbs = new Float32Array(frameCount * nBands);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let f = 0; f < frameCount; f++) {
    const off = f * hop;
    for (let i = 0; i < fftSize; i++) {
      re[i] = padded[off + i] * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im, tw);
    for (let b = 0; b < nBands; b++) {
      const flt = filters[b];
      let sum = 0;
      for (let k = 0; k < flt.weights.length; k++) {
        const bi = flt.start + k;
        if (bi > maxBin) break;
        const p = re[bi] * re[bi] + im[bi] * im[bi];
        sum += p * flt.weights[k];
      }
      dbs[f * nBands + b] = 10 * Math.log10(sum + 1e-12);
    }
  }

  let max = -Infinity;
  for (let i = 0; i < dbs.length; i++) if (dbs[i] > max) max = dbs[i];
  const floor = max - dynamicRange;
  const out = new Float32Array(dbs.length);
  for (let i = 0; i < dbs.length; i++) {
    let v = (dbs[i] - floor) / dynamicRange;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return {
    frames: frameCount,
    bands: nBands,
    data: out,
    sampleRate,
    fMin,
    fMax,
    hop,
    fftSize,
  };
}

// 主频：平均频谱上的峰值频率。
export function dominantFrequency(data, sampleRate, opts = {}) {
  const fftSize = opts.fftSize ?? 2048;
  const tw = makeTwiddles(fftSize);
  const win = hann(fftSize);
  const half = fftSize >> 1;
  const accum = new Float32Array(half);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const step = fftSize;
  const frames = Math.max(1, Math.floor(data.length / step));
  for (let f = 0; f < frames; f++) {
    const off = f * step;
    for (let i = 0; i < fftSize; i++) {
      const v = off + i < data.length ? data[off + i] : 0;
      re[i] = v * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im, tw);
    for (let i = 0; i < half; i++) accum[i] += re[i] * re[i] + im[i] * im[i];
  }
  let best = 0;
  let bestIdx = 1;
  for (let i = 1; i < half; i++) {
    if (accum[i] > best) {
      best = accum[i];
      bestIdx = i;
    }
  }
  return (bestIdx * sampleRate) / fftSize;
}

export function rmsDb(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  const rms = data.length ? Math.sqrt(sum / data.length) : 0;
  return 20 * Math.log10(rms + 1e-12);
}

// 把一段音频切成 [start, end) 秒的窗口。
export function sliceSeconds(data, sampleRate, start, end) {
  const a = Math.max(0, Math.floor(start * sampleRate));
  const b = Math.min(data.length, Math.floor(end * sampleRate));
  return data.subarray(a, b);
}

// FNV-1a 指纹。用它给标本编号，同一段音频永远得到同一个编号。
export function fingerprint(data) {
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(data.length / 4096));
  for (let i = 0; i < data.length; i += step) {
    let v = Math.round(data[i] * 32767);
    v = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
}
