// 生成 WAV 测试文件，供 Node CLI 与冒烟测试使用。
// 用法：node tools/make-wav.js

import { writeFileSync, mkdirSync } from 'node:fs';
import { encodeWav } from '../web/lib/wav.js';
import { DEMO_SOUNDS } from '../web/lib/demo-sounds.js';

const SR = 32000;
const SECONDS = 20;

const outDir = new URL('./testdata/', import.meta.url);
mkdirSync(outDir, { recursive: true });

for (const d of DEMO_SOUNDS) {
  const data = d.fn(SECONDS, SR);
  const wav = encodeWav(data, SR, 16);
  writeFileSync(new URL(`${d.id}.wav`, outDir), wav);
  console.log(`${d.id}.wav  ${SECONDS}s  ${(wav.length / 1024 / 1024).toFixed(2)} MB`);
}
