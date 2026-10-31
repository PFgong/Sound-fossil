# 声音化石 · 命令行

```bash
node fossil.js info   <input.wav>
node fossil.js make   <input.wav> [--shape slice|ring|column] [--format stl|obj|glb|svg|png|all]
                      [--out 输出名] [--size 80] [--height 8] [--base 2.5] [--grid 200]
                      [--gain 1] [--invert] [--no-rim] [--no-strata]
                      [--seconds 20] [--start 0]
                      [--ring-step 1.2] [--col-h 45] [--col-r 10] [--col-a 5]
node fossil.js card   <input.wav> [--title "标题"] [--place "地点"] [--qr "内容"] [--sheet] [--out card.svg]
node fossil.js page   <input.wav> [--title "标题"] [--out page.html]
```

## 只支持 WAV

浏览器端的制作台能解 wav / mp3 / flac / ogg / m4a（用 Web Audio 原生解码），
但 Node 没有 `decodeAudioData`。其他格式先转：

```bash
ffmpeg -i in.mp3 -ac 1 -ar 32000 out.wav
```

## 依赖

除 Node 标准库外不需要装任何东西。内部共享的模块在 `../web/lib/` 下，
与浏览器端是同一份代码，改一处两边都变。

## 输出

| 格式 | 用途 |
|---|---|
| `.stl` | 送给切片软件。二进制，单位毫米，底面在 z=0 |
| `.obj` | 通用交换格式 |
| `.glb` | 网页里看、发给别人看 |
| `-layers.svg` | 切片浮雕专用：沿频率轴切 8 层，可激光切割或纸层叠 |
| `-profile.svg` | 年轮与地层柱：单张可立起来的剖面轮廓 |
| `-heightmap.png` | 512×512 灰度高度图，给 CNC |
| `-card.svg` | 标本卡，85×54mm，可直接打印 |

## 造测试音频

```bash
node tools/make-wav.js    # 在 tools/testdata/ 下生成四段 20 秒 wav
node tools/smoke.js       # 跑全部 4 段 × 3 种造型并校验输出
node tools/gallery.js     # 把产出拼成一张预览图集
```
