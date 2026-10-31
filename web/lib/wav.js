// WAV 读写。不依赖平台 API，两端共用。
// 支持 8/16/24/32-bit PCM 与 32-bit float。

function readTag(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

export function parseWav(buffer) {
  const view = new DataView(buffer);
  if (readTag(view, 0) !== 'RIFF' || readTag(view, 8) !== 'WAVE') {
    throw new Error('不是有效的 WAV 文件');
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= view.byteLength) {
    const id = readTag(view, pos);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === 'fmt ') {
      const format = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const sampleRate = view.getUint32(body + 4, true);
      const bits = view.getUint16(body + 14, true);
      fmt = { format, channels, sampleRate, bits };
    } else if (id === 'data') {
      data = { offset: body, length: size };
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV 缺少 fmt 或 data 块');

  const isFloat = fmt.format === 3;
  const bytesPerSample = fmt.bits / 8;
  const frameCount = Math.floor(data.length / (bytesPerSample * fmt.channels));
  const channels = [];
  for (let c = 0; c < fmt.channels; c++) channels.push(new Float32Array(frameCount));

  for (let i = 0; i < frameCount; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const o = data.offset + (i * fmt.channels + c) * bytesPerSample;
      let v;
      if (isFloat && fmt.bits === 32) {
        v = view.getFloat32(o, true);
      } else if (isFloat && fmt.bits === 64) {
        v = view.getFloat64(o, true);
      } else if (fmt.bits === 16) {
        v = view.getInt16(o, true) / 32768;
      } else if (fmt.bits === 8) {
        v = (view.getUint8(o) - 128) / 128;
      } else if (fmt.bits === 24) {
        const b0 = view.getUint8(o);
        const b1 = view.getUint8(o + 1);
        const b2 = view.getUint8(o + 2);
        let s = (b2 << 24) | (b1 << 16) | (b0 << 8);
        v = s / 2147483648;
      } else if (fmt.bits === 32) {
        v = view.getInt32(o, true) / 2147483648;
      } else {
        throw new Error(`不支持的位深：${fmt.bits}`);
      }
      channels[c][i] = v;
    }
  }

  return { channels, sampleRate: fmt.sampleRate, bits: fmt.bits, channelsCount: fmt.channels };
}

export function encodeWav(mono, sampleRate, bitDepth = 16) {
  const bytesPerSample = bitDepth / 8;
  const dataSize = mono.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const tag = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  tag(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  tag(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < mono.length; i++) {
    let v = mono[i];
    v = v > 1 ? 1 : v < -1 ? -1 : v;
    if (bitDepth === 16) {
      view.setInt16(off, Math.round(v * 32767), true);
      off += 2;
    } else if (bitDepth === 24) {
      const s = Math.round(v * 8388607);
      view.setUint8(off, s & 0xff);
      view.setUint8(off + 1, (s >> 8) & 0xff);
      view.setUint8(off + 2, (s >> 16) & 0xff);
      off += 3;
    } else {
      view.setInt16(off, Math.round(v * 32767), true);
      off += 2;
    }
  }
  return new Uint8Array(buffer);
}
