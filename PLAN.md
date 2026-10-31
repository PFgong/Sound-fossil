# 声音化石 · Sound Fossil

> 把一段声音变成一块能拿在手上的东西。

录音 → 声纹浮雕 → STL → 3D 打印 → 一张带 QR 的标本卡 → 扫码听到原声。

---

## 一、一句话定义

**声音的实体化工具。** 输入任意一段音频，输出可以直接送进切片软件的 3D 模型文件，以及一张自然博物馆风格的标本卡。卡上的二维码扫开是一个能播放原声的网页。

网上搜不到成品工具：现有的"音频转 3D"只有零星教程贴和几个收费的 Etsy 定制服务，没有完整的一体化工具，更没有人做"标本卡 + 扫码回听"这个闭环。

---

## 二、三种造型

三者共用一个几何管线，区别只在"声音 → 高度"的映射函数。

### 1. 切片浮雕 Slice（主推）

横轴时间，纵轴 mel 频率，高度是能量。整块板子看起来像一块被切开的岩石，声音在里面留下层理。

- 网格 X×Y，X = 时间帧，Y = mel 频带
- 高度 `h(x,y) = norm(melEnergy[frame(x)][band(y)])`
- 频率轴翻转：低频在下、高频在上
- 加 4mm 实心底板 + 可选边框墙（默认关）

### 2. 环形年轮 Ring

同心环浮雕。半径代表时间从内到外推进，环脊高度代表该时刻的音量。内圈是开头，外缘是结尾——像树的年轮，也像黑胶。

- 高度 `h(x,y) = envelope(quantize(dist(x,y)))`，`dist` 归一化到 `[0,1]` 后量化成 N 个环
- 量化步长默认 1.5mm，产生清晰的环脊
- 叠加 ±3% 的角度抖动，避免完美旋转对称，让它像天然长出来的
- 中心挖一个小凹坑作为"起点标记"

### 3. 地层柱 Column

旋转体。高度轴是时间，半径是音量，外形像一根石笋/钟乳石。竖着打印，切口自带层理。

- 轮廓线 `r(z) = R0 + A · envelope(t(z))`
- 用 lathe 方式生成，段数 = 时间帧数（默认 200），环向 96 段
- 顶部收口、底部加 3mm 底盘

---

## 三、技术选型

**无构建、无后端、全部在浏览器里跑。** 文件不离开本机，除非用户主动点"发布"。

| 环节      | 方案                                                                 |
| ------- | ------------------------------------------------------------------ |
| 音频解码    | 浏览器原生 `AudioContext.decodeAudioData`（wav / mp3 / flac / ogg / m4a） |
| 波形包络    | 分帧 RMS + peak，帧数 = 网格 X 分辨率                                        |
| mel 频谱  | 自写 radix-2 FFT（1024 点、Hann 窗、hop 512）+ 48 段 mel 滤波器组，20Hz–16kHz    |
| 网格生成    | 顶面高度场三角化 + 侧壁环 + 底面，自写                                             |
| STL 导出  | 自写二进制 STL writer                                                   |
| OBJ 导出  | 自写                                                                 |
| GLB 导出  | **自写最小写入器**                                                         |
| PNG 高度图 | 浏览器用 Canvas；CLI 用自写的灰度编码器（只依赖 node:zlib）                            |
| SVG 层切  | 沿频率轴切 8 层，供激光切割 / 纸层叠                                               |
| 标本卡    | **SVG**（浏览器与 CLI 共用一套布局）                                            |
| 3D 预览   | three.js（OrbitControls + 标准材质）                                        |
| QR      | vendor 化的 `qrcode-generator`（MIT）                                   |

**依赖只有两个**：three.js 和 qrcode-generator，都 vendor 到 `assets/vendor/`，保证断网可用。

> 实现时把 GLB 从 `GLTFExporter` 换成了自写。它内部依赖 `../utils/TextureUtils.js`，
> 是一个 78KB 的依赖链，而我们只有一个静态网格、没有贴图与动画 —— 手写 GLB 只要 80 行，
> 还能让 CLI 也具备导出能力。

---

---

## 四、目录结构

整个目录本身就是一个可安装的 Skill 包（`python install-skill.py`）。

```
sound-fossil/
  SKILL.md                Agent 入口
  package.json            声明 ESM，装包时必须一起带走
  serve.py                静态服务，文档根是 web/
  install-skill.py        装到 ~/.workbuddy/skills/sound-fossil/

  web/                    制作台 + 标本册，自包含，整目录可直接部署到静态托管
    index.html
    museum.html
    style.css             标本签视觉规范
    museum.css
    vendor/               three.module.js、OrbitControls.js、qrcode.js
    lib/                  共享内核 —— 浏览器与 Node import 的是同一份
      dsp.js              FFT / mel 频谱 / 包络 / 指纹
      features.js         音频 → 造型所需的全部特征
      shapes.js           三种造型的高度函数
      mesh.js             高度场 / 圆盘 / 旋转体 → 顶点与索引
      writers.js          STL / OBJ / SVG 输出
      glb.js              最小 GLB 写入器
      wav.js              WAV 读写
      card-svg.js         标本卡 SVG（两条通道共用）
      publish.js          单文件标本页 / 整册页
      demo-sounds.js      内置示例声音
    src/                  浏览器专属
      preview.js          three.js 场景
      audio-io.js         解码 / 录音 / 播放
      shelf.js            localStorage 标本册
      util.js             下载 / 格式化 / SVG 转 PNG
      main.js             制作台装配
      museum-main.js      标本册装配

  scripts/                Node 通道
    fossil.js             Node CLI
    png.js                极简灰度 PNG（只用 node:zlib）
    README.md

  tools/                  开发用，不进 Skill 包
    make-wav.js           造测试音频
    smoke.js              4 段声音 × 3 种造型的全量校验
    gallery.js            产出拼成预览图集
    testdata/

  README.md
  PLAN.md
```

**为什么 lib 放在 web 里面**：命令行 import `../web/lib/*`，浏览器 import `../lib/*`。
反过来把 lib 提到根目录，静态服务以 web/ 为文档根时就取不到它。
放在 web/ 里，web/ 既是能单独部署的单元，又能被命令行引用，两头都不折。

**关键结构决定**：`web/lib/` 下的纯计算模块没有浏览器 API 依赖，被 Web 和 CLI
同时 import，所以 DSP 逻辑只有一份。卡片渲染成 SVG 而不是 canvas，就是因为 Node 端
没有 canvas —— 改成矢量后 CLI 才能出卡片，发布页也从 1MB 缩到几十 KB。

---

## 五、标定参数

| 项      | 默认值          | 可调范围                  |
| ------ | ------------ | --------------------- |
| 平板尺寸   | 80 × 80 mm  | 50–160 mm             |
| 浮雕高度   | 8 mm        | 3–20 mm               |
| 底板厚度   | 2.5 mm      | 1.5–10 mm             |
| 网格分辨率  | 200 × 200   | 120 / 160 / 200 / 280 |
| 音频分析长度 | 20 秒        | 5–120 秒（超出部分可拖动窗口）  |
| 增益     | 1.0         | 0.4–2.5               |
| 边缘羽化   | 开           | 开 / 关                 |

> 初版定的 100×100mm 实心打出来是 105 克 / 6.5 小时，实测后改成 80×80mm。

**体积与可打印性**：

- 切片 81,602 三角（3.9 MB）／年轮 32,544 三角（1.6 MB）／地层柱 31,296 三角（1.5 MB）
- 耗材估算用高度场积分：`V = 面积 × 底板厚 + Σh · cellArea`，`PLA 密度 1.24 g/cm³`
- 打印时间按 `体积 / (0.4mm 线宽 × 0.2mm 层高 × 45mm/s)` 粗估
- **估算是按 100% 实心算的**，实际切片开填充后会明显更省，界面上必须写明
- 实测默认参数：切片 48g / 3.0h，年轮 61g / 3.8h，地层柱 18g / 1.1h

三者都是无悬垂设计，不需要支撑。

**SVG 输出分两种**，不是所有造型都切层：

- 切片浮雕 → 「层切」：沿频率轴切 8 层，叠起来就是那块浮雕，可激光切割或纸层叠
- 年轮 / 地层柱 → 「剖面轮廓」：单张可立起来的轮廓图，激光切割后当模板或立牌

---

## 六、标本卡

### 卡面内容

```
┌──────────────────────────────────┐
│  SF-20261028-A7F3                │  ← 等宽、字距拉开、细框
│                                  │
│  外婆说的那句话                    │  ← 衬线标题，用户填写
│                                  │
│  ──────────────────────────────  │  ← 0.5px 细线
│  时长 00:04.2   主频 218 Hz       │
│  峰值 -3.1 dB   采样 48000 Hz     │
│  2026-10-28 21:40  北京·海淀       │
│  ──────────────────────────────  │
│                                  │
│  ▁▂▅█▇▅▃▁▂▄▆█▅▂▁        [QR]     │  ← 声波线描 + 二维码
│                                  │
│  SOUND FOSSIL · 声音化石          │
└──────────────────────────────────┘
```

- 卡片尺寸 85 × 54 mm，A4 上排 4 张，打印留 3mm 出血
- 编号规则 `SF-<YYYYMMDD>-<音频 SHA256 前 4 位大写>`
- 地点来自浏览器定位，用户可拒绝；拒绝时留空
- 单张 PNG 导出 1200 dpi 等效

### 视觉规范（自然博物馆标本签）

| 元素   | 取值                                         |
| ---- | ------------------------------------------ |
| 卡纸底色 | `#F5F1E8`                                  |
| 主文字  | `#1F2328`                                  |
| 次要文字 | `#5F5E5A`                                  |
| 分隔线  | `#D3D1C7` 0.5px                            |
| 标题字体 | 衬线（Songti SC / Source Serif / Georgia）14px |
| 正文字体 | 无衬线 10px，行高 1.6                            |
| 编号字体 | 等宽 8px，字距 0.15em                           |
| 强调   | 不使用彩色。二维码用纯黑白                              |

---

## 七、发布闭环（扫码回听）

1. 生成单文件标本页 `fossil/<id>/index.html`：
   - 内嵌音频（base64，默认压到 32kbps 单声道，60 秒约 240KB）
   - 内嵌声纹图与卡面信息
   - 打开即播放，无需任何外部资源
2. 调用静态部署把整个 `fossil/` 目录发布出去，拿回 URL
3. URL 写进 QR 码，印在卡上
4. 卡片打印、模型打印，扫二维码 → 听见声音

纯本地模式下不触发任何网络请求，QR 默认刻的是档案坐标文本  
（`SF:<ISO时间>@<经纬度>#<指纹>`）。用户也可以手动填任意链接进 QR。

---

## 八、标本册

- 存 localStorage：编号、标题、时间、地点、音频指纹、高度场缩略图（64×64 灰度 dataURL）
- 音频本体默认不存（localStorage 只有 5MB），只存最近 3 条
- 博物馆页：网格排布 + 点开看 3D 预览
- 整册导出为单页 HTML（可再打印成 PDF）

---

## 九、Agent 通道（Skill）

Agent 不能在浏览器里点按钮，所以另给一条 Node CLI 通道：

```bash
node scripts/fossil.js make  input.wav --shape slice --out out.stl
node scripts/fossil.js make  input.wav --shape ring  --grid 200 --gain 1.4
node scripts/fossil.js card  input.wav --title "外婆说的那句话" --out card.html
node scripts/fossil.js info  input.wav
```

**限制（写进 SKILL.md 明说）**：Node 端没有 `decodeAudioData`，所以只直接支持 **WAV（16/24/32-bit PCM）**；其他格式先让用户用 ffmpeg 转一次。浏览器端没有这个限制。

CLI 与 Web 共用同一套高度函数逻辑，代码放在 `web/lib/` 下（不引入浏览器 API）。
CLI 入口在 `scripts/fossil.js`，import `../web/lib/*`，与浏览器是同一份文件。

---

## 十、一期不做

- 多声道 / 空间音频造型
- AI 生成音频
- 手机端适配（先把桌面端做扎实）
- 云端账号与分享社区
- 切片软件直连

---

## 十一、验收清单

- [ ] 上传一个 30 秒 mp3，能在 5 秒内出预览
- [ ] 三种造型都能生成，切换时预览不卡死
- [ ] 导出的 STL 能被 PrusaSlicer / Cura 正常打开，壁厚 > 0.8mm，无破面
- [ ] STL 尺寸单位是毫米，开箱即用
- [ ] 标本卡 A4 打印排版正确，4 张不串行
- [ ] QR 能被微信和原生相机扫开
- [ ] 发布后的标本页在手机上打开能播放
- [ ] 断网状态下整个工具可用（除了发布）
- [ ] Node CLI 能对一个 wav 生成出与浏览器端尺寸一致的 STL

