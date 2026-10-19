# Codex 审查清单 — 拾词 (vocab-app)

纯静态 PWA，无构建。本地运行：`cd vocab-app && python3 -m http.server 8765` → http://localhost:8765/index.html
测试：`node tests/unit.mjs`（24 项）；`NODE_PATH=<playwright> node tests/e2e.js`（加 `CN=1` 模拟国内屏蔽 jsdelivr/google）。

## 发布
把 `vocab-app/`（可不含 tests/、shots/、*.md）推到分支 **`rebuild/wudu-duck-deli`**（GitHub Pages 来源）。地址：https://w2221061110-debug.github.io/-/vocab-app/
vendor/ 里有约 11MB 二进制/大 JS（tesseract core wasm.js ×2、eng.traineddata.gz），必须原样提交。

## 重点审查
1. **js/parse.js** — 分组启发式：编号/项目符号/一行一条 vs 散文；`cleanEnglish` 对中文、词性、音标、`sb./sth.` 的处理；去 OCR 垃圾尾巴的规则（末词大写且前面都小写）可能误删专有名词。请补边界用例。
2. **js/ocr.js** — 自适应阈值参数（窗口 W/16，0.86），按词重建行时的切段阈值（1.6×行高）与置信度阈值（62）。iPhone 12MP 照片缩到 2200px 的内存/速度。
3. **js/speak.js** — iOS Safari：`audio.play()` 必须在手势内；`playbackRate` 对远程 mp3；5s stall 判定；speechSynthesis 在 iOS 首次调用的已知坑（getVoices 异步）。
4. **js/app.js** — `proseSelect` 长按拖选在 iOS 上是否会触发系统放大镜/文本选择；路由与 history；复习会话里“忘了”的词本轮末尾重排；`grade()` 对自由练习不改 SRS 的条件。
5. **js/srs.js** — SM-2 参数是否合理；`firstAt` 用于每日新词上限。
6. **js/sync.js** — 合并冲突规则；二维码容量；Gist token 只存本地且不进导出文件（kv 过滤 `gistToken`）。
7. **sw.js** — 同源网络优先 + 缓存回退；版本号 `shici-v2`，修改资源后要改版本。
8. 可访问性：按钮 aria-label、对比度（深色模式）、动态字号。

## 不要做
- 不要引入需要付费/海外卡/国内不通的服务（Google、Vercel、Firebase）。
- 不要把 tesseract 改回只从 jsDelivr 加载。
