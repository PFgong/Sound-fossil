---
name: sound-fossil
description: 把一段声音变成可以 3D 打印的实体。输入音频，输出 STL/OBJ/GLB 模型、可打印的标本卡与能扫码听声的网页。用于把录音、环境声、语音片段做成实物纪念品，或为装置/展品制作声纹浮雕。
---

# 声音化石 · Sound Fossil

把声音实体化的工具链。核心只有一件事：把音频特征映射成高度场，再挤出成可打印的网格。

## 什么时候用

用户说这些话时用这个：

- "把这段录音做成能打印的东西"
- "做个声音的浮雕 / 声纹模型 / 声音纪念品"
- "把这段话刻下来"
- "给这个声音做张卡片，扫码能听"

## 先确认的两件事

1. **有没有音频**。没有就用内置的示例声音（见下），别让用户干等。
2. **造型**。三种，让用户选或按声音性质代选：

| 造型 | 映射方式 | 最适合 |
|---|---|---|
| `slice` 切片浮雕 | 横轴时间 × 纵轴频率，高度是能量 | 人声、音乐——频谱上有结构的声音。默认选它 |
| `ring` 环形年轮 | 半径是时间由内到外，环脊高度是音量 | 环境声、长录音——情绪起伏比频谱结构更重要时 |
| `column` 地层柱 | 旋转体，高度轴是时间，半径是音量 | 想竖着摆放、想省耗材时。它最轻，18g 左右 |

## 命令

```bash
cd scripts

# 看看这段音频里有什么
node fossil.js info input.wav

# 造模型（默认切片浮雕，输出 STL）
node fossil.js make input.wav --shape slice --out 外婆的话.stl

# 一次出齐所有格式
node fossil.js make input.wav --format all --out 外婆的话

# 造标本卡（A4 上排四张用 --sheet）
node fossil.js card input.wav --title "外婆说的那句话" --place "北京 海淀" --out card.svg
node fossil.js card input.wav --title "外婆说的那句话" --sheet --out sheet.svg

# 造可以发布的标本页
node fossil.js page input.wav --title "窗外的风" --out page.html
```

## 硬限制：只吃 WAV

浏览器里有 `decodeAudioData` 什么格式都能解，**Node 命令行不行**。所以 CLI 只直接支持
WAV（8/16/24/32-bit PCM 与 32-bit float）。

用户给的是 mp3 / m4a / flac / ogg 时，先转：

```bash
ffmpeg -i in.mp3 -ac 1 -ar 32000 out.wav
```

`-ac 1` 单声道不是必须的（内部会混单），但能让文件小一半。

**不要假装支持 mp3。** 用户传 mp3 进来时直说限制并给出上面这行命令，比运行时炸掉强。

## 常用参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--shape` | slice | slice / ring / column |
| `--size` | 80 | 平板直径或圆盘直径，毫米 |
| `--height` | 8 | 浮雕高度，毫米 |
| `--base` | 2.5 | 底板厚度，毫米 |
| `--grid` | 200 | 网格分辨率。160 省一半体积，280 最细 |
| `--gain` | 1.0 | 起伏增益。声音平淡时用 1.5，爆音时 0.6 |
| `--seconds` | 20 | 分析多长。超过 20 秒的音频可以拖动窗口 |
| `--start` | 0 | 从第几秒开始分析 |
| `--invert` | — | 反相，把浮雕变成凹刻 |
| `--no-rim` | — | 关掉边缘羽化 |
| `--ring-step` | 1.2 | 年轮的环间距，毫米。越小环越密 |
| `--col-h` / `--col-r` / `--col-a` | 45 / 10 / 5 | 地层柱的柱高、最大半径、起伏 |

`--out` 给不给扩展名都行——`make` 补 `.stl`，`card` 补 `.svg`，`page` 补 `.html`。

## 发布成能扫码听声的页面

1. `node fossil.js page input.wav --title "标题" --out page.html`
2. 把 page.html 作为静态站点部署（EdgeOne Pages / GitHub Pages / 对象存储都行），拿到 URL
3. 用拿到的 URL 重新生成卡片：`node fossil.js card input.wav --title "标题" --qr "https://那个地址" --out card.svg`
4. 打印卡片、打印模型，实体卡片扫码就能听到原声

**顺序不能反**——二维码内容必须先有 URL 才能生成。这是鸡生蛋问题，靠两遍命令解决。

不给 `--qr` 时卡片上**不印二维码**，只留一个虚线空位写着"尚未填入标本页地址"。
别拿编号去充数：扫出来一串 `SF:2026-…#D63B` 对谁都没用。

标本页本身永远不带二维码 —— 人已经在页面上了，再扫一次没意义。

页面里的音频会压到 16kHz 单声道（超过 40 秒压到 11kHz），20 秒约 0.4 MB。

## 用户想看模型时

命令行生成的 `.stl` / `.obj` / `.glb` 可以用 `web/viewer.html` 看：
拖进去就行，会显示三角数、尺寸、体积和实心估算。

```
python serve.py 8080   →   http://127.0.0.1:8080/viewer.html
viewer.html?f=某个.glb  # 也可以直接链到已部署的模型
```

要打印就把 `.stl` 给切片软件（Bambu Studio / OrcaSlicer / PrusaSlicer / Cura）。
要改形状用 Blender，三种都开得了。

## 打印前要提醒用户的事

- 模型单位是毫米，底面在 z=0，切片软件打开就能直接用
- 三种造型都是无悬垂设计，不需要支撑
- 界面/输出里的克数是**按 100% 实心**估的，切片时开 15% 填充会明显更省
- 默认尺寸下：切片约 48g、年轮约 61g、地层柱约 18g

## 没有音频时

内置四段可直接生成的示例声音，浏览器端通过 `demo-sounds.js` 合成，不需要文件：

| id | 内容 | 特点 |
|---|---|---|
| `voice` | 共振峰合成的类人声 | 有音节起伏，最适合切片造型 |
| `ambient` | 风声底噪 + 偶发鸟鸣 | 适合年轮 |
| `percussion` | 四四拍鼓点 | 瞬时冲击多 |
| `sweep` | 80Hz→12kHz 对数扫频 | 频谱是一条斜线，专用于验证切片造型是否正常工作 |

扫频声是**调试工具**：切片造型出问题时用它，斜线有没有出来一眼就能看出来。

## Web 应用

如果用户想用界面操作（录音、调参、看 3D 预览），启动制作台：

```bash
cd <本 Skill 目录>
python serve.py 8080
# 打开 http://127.0.0.1:8080/
```

**必须走 http，不能让用户双击 `web/index.html`。** `file://` 下 ES 模块被 CORS 拦掉，
页面看着正常、按钮全是死的 —— 用户会以为坏了。真这么打开了，页面会自己弹提示说明要起服务。

录音也要在 http 下才能拿到麦克风权限；`file://` 下浏览器直接不给。

## 目录

```
SKILL.md
scripts/fossil.js     命令行入口
scripts/png.js        极简灰度 PNG（只用 node:zlib）
web/                  制作台 + 标本册，整目录可直接部署到静态托管
  lib/                共享内核，命令行与浏览器 import 的是同一份
  src/                浏览器专属模块
  vendor/             three.js、OrbitControls、qrcode
serve.py
```

改 `web/lib/` 下的东西时两边同时生效 —— 命令行和网页用的是同一份计算代码，
不要为了命令行单独复制一份。
