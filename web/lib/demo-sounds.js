// 内置的示例声音。没有真实录音时用它们试三种造型。
// 纯函数，浏览器和 Node 都能跑。

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pinkNoiseGen(seed) {
  const r = rng(seed);
  const b = [0, 0, 0, 0, 0, 0, 0];
  let idx = 0;
  return () => {
    idx = (idx + 1) & 6;
    if (idx === 0) {
      b[0] = r() * 2 - 1;
      b[1] = r() * 2 - 1;
    }
    return (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6]) / 3.5;
  };
}

// 共振峰合成的类人声，有音节的起伏
export function makeVoice(seconds, sampleRate, seed = 1234) {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  const r = rng(seed);
  const sylLen = 0.28;
  let phase = 0;
  const formants = [
    [520, 0.9],
    [1180, 0.55],
    [2600, 0.28],
  ];
  const states = formants.map(() => ({ a: 0, b: 0 }));
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const syl = (t % sylLen) / sylLen;
    const sylEnv = Math.max(0, Math.sin(Math.PI * syl) ** 1.6);
    const phrase = 0.55 + 0.45 * Math.sin(2 * Math.PI * t * 0.17 + 1.1);
    const f0 = 118 + 26 * Math.sin(2 * Math.PI * t * 0.31);
    phase += (2 * Math.PI * f0) / sampleRate;
    let glottal = 0;
    for (let k = 1; k <= 6; k++) glottal += Math.sin(k * phase) / k;
    glottal /= 2.2;
    let s = 0;
    for (let fi = 0; fi < formants.length; fi++) {
      const [f, amp] = formants[fi];
      const ff = f * (0.94 + 0.12 * Math.sin(2 * Math.PI * t * 0.23 + fi));
      const w = (2 * Math.PI * ff) / sampleRate;
      const st = states[fi];
      const y = glottal + 2 * 0.995 * Math.cos(w) * st.a - 0.995 * 0.995 * st.b;
      st.b = st.a;
      st.a = y;
      s += y * amp;
    }
    out[i] = s * 0.32 * sylEnv * phrase + (r() * 2 - 1) * 0.004;
  }
  return out;
}

// 环境声：缓慢起伏的风声底噪，偶尔一声鸟鸣
export function makeAmbient(seconds, sampleRate, seed = 1238) {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  const pink = pinkNoiseGen(seed);
  const r = rng(seed + 7);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const wind =
      0.35 + 0.3 * Math.sin(2 * Math.PI * t * 0.07) + 0.2 * Math.sin(2 * Math.PI * t * 0.023 + 2);
    out[i] = pink() * Math.max(0.05, wind) * 0.6;
    if (r() < 0.00004) {
      const len = Math.floor(0.09 * sampleRate);
      const base = 2200 + r() * 2600;
      for (let k = 0; k < len && i + k < n; k++) {
        const e = Math.sin((Math.PI * k) / len) ** 2;
        const f = base * (1 + 0.25 * Math.sin(2 * Math.PI * k * 45));
        out[i + k] += Math.sin((2 * Math.PI * f * k) / sampleRate) * e * 0.13;
      }
    }
  }
  return out;
}

// 打击乐：四四拍的鼓与镲
export function makePercussion(seconds, sampleRate, seed = 1241) {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  const r = rng(seed);
  const beat = 0.5;
  const beats = Math.floor(seconds / beat);
  for (let b = 0; b < beats; b++) {
    const t0 = Math.floor(b * beat * sampleRate);
    if (b % 4 === 0 || b % 4 === 2) {
      const len = Math.floor(0.28 * sampleRate);
      for (let k = 0; k < len && t0 + k < n; k++) {
        const tt = k / sampleRate;
        const f = 58 * Math.exp(-tt * 14) + 42;
        out[t0 + k] += Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 7) * 0.85;
      }
    } else {
      const len = Math.floor(0.16 * sampleRate);
      for (let k = 0; k < len && t0 + k < n; k++) {
        out[t0 + k] += (r() * 2 - 1) * Math.exp((-k / sampleRate) * 26) * 0.4;
      }
    }
    if (b % 8 === 6) {
      const len = Math.floor(0.34 * sampleRate);
      for (let k = 0; k < len && t0 + k < n; k++) {
        out[t0 + k] += (r() * 2 - 1) * Math.exp((-k / sampleRate) * 9) * 0.3;
      }
    }
  }
  return out;
}

// 扫频：频谱上是一条漂亮的斜线，专门用来检验切片造型
export function makeSweep(seconds, sampleRate, seed = 1237) {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = 80 * Math.pow(12000 / 80, t);
    const e = 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.4;
    out[i] =
      Math.sin((2 * Math.PI * f * i) / sampleRate + 0.7 * Math.sin(2 * Math.PI * t * 3)) * 0.5 * e;
    out[i] += (r() * 2 - 1) * 0.01;
  }
  return out;
}

export const DEMO_SOUNDS = [
  { id: 'voice', name: '人声', hint: '共振峰合成，有音节起伏', fn: makeVoice },
  { id: 'ambient', name: '环境声', hint: '风声底噪与偶发鸟鸣', fn: makeAmbient },
  { id: 'percussion', name: '打击乐', hint: '四四拍，瞬时冲击多', fn: makePercussion },
  { id: 'sweep', name: '扫频', hint: '频谱是一条斜线，最考验切片造型', fn: makeSweep },
];

export function renderDemoSound(id, seconds, sampleRate) {
  const item = DEMO_SOUNDS.find((d) => d.id === id) || DEMO_SOUNDS[0];
  return { mono: item.fn(seconds, sampleRate), name: item.name };
}
