# 拾词 · 拍照背单词 — 架构与说明

纯静态 PWA，无后端、无构建步骤、无付费服务。原生 ES modules，零框架。

## 文件
| 文件 | 作用 |
|---|---|
| index.html / style.css | 外壳 + 全部样式（浅/深色，iPhone 安全区，iPad/桌面双列） |
| js/app.js | 路由、各页面（导入/单页/生词本/复习/设置）、单词详情弹层、长按拖选短语、同步界面 |
| js/parse.js | **分组逻辑**：编号行/项目符号行/一行一条 → 整条单元；散文 → 逐词。去掉中文释义、词性、音标、OCR 垃圾尾巴、编号列表里的标题行 |
| js/ocr.js | 图片 EXIF 方向修正→缩放→灰度→自适应阈值→tesseract.js(PSM 6)；按词重建行，大间隔切段并丢掉低置信度段（英文模型把中文释义认成乱码的部分） |
| js/dict.js | 离线词典（ECDICT 子集 2.9 万词条 + 2.6 万词形还原）→ 缓存 → MyMemory → Google gtx → 逐词拼释义 |
| js/speak.js | 发音：有道 dictvoice（真人/合成，美/英音，国内直连）→ 系统 Web Speech 回退；短语整条一次读完；语速、慢速、系统语音选择 |
| js/srs.js | SM-2 变体：忘了→10 分钟后；记得 1→4→10 天…；以凌晨 4 点为日界 |
| js/store.js | IndexedDB（pages/items/kv），启动全量读入内存，`storage.persist()` |
| js/sync.js | 备份快照/合并（按 updated 新者胜）、二维码精简格式（deflate+base64）、GitHub Gist 同步 |
| sw.js / manifest.json / icon.png | PWA：可加到主屏、离线可用 |
| data/dict.txt | 2.3MB（gzip ~0.95MB）离线词典，来源 ECDICT（MIT） |
| vendor/ | 自带 tesseract.js 5.1.1 + core(wasm, simd/非simd) + eng 模型(best_int) + qrcode + jsQR，**不依赖 jsDelivr**；本地失败才回退 jsDelivr |
| tests/unit.mjs | 分组+SRS 单元测试（`node tests/unit.mjs`） |
| tests/e2e.js | Playwright 端到端 + 截图（`CN=1` 时屏蔽 jsdelivr/google/githack 模拟国内） |

## 托管（重要：raw.githack 在国内打不开）
推荐 **GitHub Pages**：该仓库已开启 Pages，来源是分支 `rebuild/wudu-duck-deli` 根目录（https://w2221061110-debug.github.io/-/ 与该分支 index.html 的 md5 一致）。
把 `vocab-app/` 整个文件夹推到这个分支 → **https://w2221061110-debug.github.io/-/vocab-app/**。
- 国内可达性：GreatFire 2026-08 测试 https 版 *.github.io 可访问；itdog 274 节点 2026-08 实测均值 0.89s（移动 0.63/电信 0.92/联通 1.18s，个别节点慢）。
- 已排除：jsDelivr 把 .html 当 `text/plain` + `nosniff`，页面不会渲染（JS/CSS 正常）；statically 301 跳回 jsdelivr；raw.githack 被墙；Vercel/Cloudflare Pages/Netlify 国内不稳或需账号；Gitee Pages 已停。
- 所有 OCR 资源都放在 vendor/，同站点加载，所以只要 github.io 能开，拍照识别就能用。

## 国内可用性（每个外部依赖）
| 依赖 | 用途 | 国内 | 证据 / 回退 |
|---|---|---|---|
| dict.youdao.com/dictvoice | 发音 | ✅ 网易国内服务 | 盒子实测 200 audio/mpeg；`<audio>` 播放不需要 CORS。失败→系统语音（iOS 自带，离线） |
| 离线词典 data/dict.txt | 单词释义 | ✅ 同站点 | 覆盖中高考/四六级/考研/托福/雅思词 + 常用词组 |
| api.mymemory.translated.net | 未收录短语翻译 | ❓ 无 GreatFire 数据（意大利服务） | CORS `*`，实测 200。匿名每天约 5000 字符。失败→Google gtx（国内不通）→逐词释义 |
| dict.youdao.com 翻译接口 | — | 国内通，但 **无 CORS**（带 Origin 返回 403），浏览器端不能用 | 未采用 |
| api.github.com (Gist) | 可选云同步 | 通常可达但可能慢 | 可选；默认用隔空投送文件/二维码 |

## 同步方案取舍
- 无后端、无海外卡 → 不能用 Firebase/Supabase 付费档；免费 JSON 存储（jsonblob 等）实测 403/不稳且国内无保证。
- 采用：① **导出文件 → iOS 分享面板「隔空投送」→ 另一台「导入文件」合并**（最可靠，含照片）；② **二维码**（精简数据，约 700 字符/12 词，上限 ~2900 字符 ≈ 几百词，不含照片）；③ **GitHub Gist**（可选，需要只勾 gist 权限的 token，打开 App 和切回前台时自动拉+推）。
- 合并规则：同一单词以 `updated` 较新的为准。

## 已知限制
- 盒子是无 GPU 的无头 Chromium：TTS 只验证了“调用了有道音频 URL”，没有真机听感；iOS 第一次发音必须由点击触发（代码都在点击回调里调用）。
- Web Speech 在 Chromium 无头环境无英文语音，系统语音选择器只在真机出现。
- OCR 只装了英文模型；照片里的中文会被丢弃（按置信度过滤），偶尔会漏掉或残留一两个字母，提供“修改文字”入口。
- 手写体、强透视、弯曲书页识别率会下降。
- MyMemory 在国内的可达性未经证实；不通时短语显示逐词释义。
- 数据在浏览器本地；iOS 若长期不打开 Safari 网站数据可能被清理 → 建议“添加到主屏幕”（PWA 不受 7 天清理）并定期导出。
- 散文长按拖选在 iPad 上依赖 pointer 事件 + touchmove preventDefault，需真机确认不会触发系统文本选择。
