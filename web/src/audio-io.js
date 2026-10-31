// 浏览器端的音频输入输出：文件解码、麦克风录音、播放。
// 依赖 Web Audio，只在浏览器里用。

import { toMono, resampleAudio, sliceSeconds } from '../lib/dsp.js';
import { encodeWav } from '../lib/wav.js';

let sharedCtx = null;

export function audioContext() {
  if (!sharedCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

export async function decodeFile(file) {
  const ab = await file.arrayBuffer();
  const ctx = audioContext();
  const buf = await ctx.decodeAudioData(ab);
  return { buffer: buf, mono: bufferToMono(buf), sampleRate: buf.sampleRate };
}

export function bufferToMono(buffer) {
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  return toMono(chans);
}

// 返回句柄而不是裸 Promise，这样外面的「完成」按钮能提前掐断录音。
export async function startRecording(seconds, onTick) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const ctx = audioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);

  let finish = () => {};

  const promise = new Promise((resolve, reject) => {
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const chunks = [];
    let total = 0;
    let done = false;

    finish = () => {
      if (done) return;
      done = true;
      try {
        src.disconnect();
        proc.disconnect();
        mute.disconnect();
      } catch (e) {
        void e;
      }
      stream.getTracks().forEach((t) => t.stop());
      const out = new Float32Array(total);
      let p = 0;
      for (const c of chunks) {
        out.set(c, p);
        p += c.length;
      }
      resolve({ mono: out, sampleRate: ctx.sampleRate });
    };

    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(d);
      chunks.push(copy);
      total += copy.length;
      if (onTick) onTick(total / ctx.sampleRate);
      if (total / ctx.sampleRate >= seconds) finish();
    };

    try {
      src.connect(proc);
      proc.connect(mute);
      mute.connect(ctx.destination);
    } catch (e) {
      reject(e);
    }
  });

  return { promise, stop: () => finish() };
}

// 把待导出的那一段转成 WAV 字节，供发布页与标本册内嵌。
export function monoToWav(mono, sampleRate, opts = {}) {
  const targetRate = opts.targetRate ?? 16000;
  const start = opts.start ?? 0;
  const end = opts.end ?? mono.length / sampleRate;
  let seg = sliceSeconds(mono, sampleRate, start, end);
  if (sampleRate !== targetRate) seg = resampleAudio(seg, sampleRate, targetRate);
  return { bytes: encodeWav(seg, targetRate, 16), sampleRate: targetRate };
}

export function playRange(mono, sampleRate, start, end) {
  const ctx = audioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const seg = sliceSeconds(mono, sampleRate, start, end);
  const buffer = ctx.createBuffer(1, seg.length, sampleRate);
  buffer.getChannelData(0).set(seg);
  const node = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 1;
  node.buffer = buffer;
  node.connect(gain);
  gain.connect(ctx.destination);
  node.start();
  return {
    stop() {
      try {
        node.stop();
      } catch (e) {
        void e;
      }
    },
  };
}

export function toDataUrl(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return 'data:audio/wav;base64,' + btoa(bin);
}
