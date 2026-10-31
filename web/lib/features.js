// 从单声道 PCM 提取造型所需的全部特征。纯计算，两端共用。

import {
  computeEnvelope,
  computeSpectrogram,
  dominantFrequency,
  rmsDb,
  sliceSeconds,
} from './dsp.js';

export const ANALYSIS = {
  seconds: 30,
  fftSize: 1024,
  hop: 512,
  bands: 48,
  envelopeFrames: 1000,
  dynamicRange: 55,
  envelopeRange: 50,
};

export function analyze(mono, sampleRate, opts = {}) {
  const seconds = opts.seconds ?? ANALYSIS.seconds;
  const start = opts.start ?? 0;
  const total = mono.length / sampleRate;
  const end = Math.min(total, start + seconds);
  const seg = sliceSeconds(mono, sampleRate, start, end);

  const env = computeEnvelope(seg, sampleRate, {
    frames: ANALYSIS.envelopeFrames,
    dynamicRange: ANALYSIS.envelopeRange,
  });
  const spectro = computeSpectrogram(seg, sampleRate, {
    fftSize: ANALYSIS.fftSize,
    hop: ANALYSIS.hop,
    bands: ANALYSIS.bands,
    dynamicRange: ANALYSIS.dynamicRange,
  });

  return {
    envelope: env.values,
    spectro,
    stats: {
      duration: seg.length / sampleRate,
      totalDuration: total,
      sampleRate,
      peakDb: env.peakDb,
      rmsDb: rmsDb(seg),
      dominantHz: dominantFrequency(seg, sampleRate),
    },
  };
}

// 取造型用的灰度场，供高度图与卡片缩略图使用。
export function sampleField(spec, w, h) {
  if (spec.kind === 'disc') {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const py = ((y + 0.5) / h) * 2 - 1;
      for (let x = 0; x < w; x++) {
        const px = ((x + 0.5) / w) * 2 - 1;
        const r = Math.sqrt(px * px + py * py);
        const v = r >= 1 ? 0 : spec.samplePolar(r, Math.atan2(py, px));
        out[y * w + x] = v;
      }
    }
    return out;
  }
  if (spec.kind === 'lathe') {
    const out = new Float32Array(w * h);
    const rMax = spec.plateRadius;
    for (let y = 0; y < h; y++) {
      const t = 1 - (y + 0.5) / h;
      const r = spec.radiusAt(t) / rMax;
      const half = (r * w) / 2;
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x + 0.5 - w / 2);
        out[y * w + x] = d <= half ? 1 : 0;
      }
    }
    return out;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      out[y * w + x] = spec.sample(u, v);
    }
  }
  return out;
}
