# 独立审查与验证

## 修复
- sw.js：缓存版本升级；只清理 shici- 前缀缓存；同源请求限定应用 scope；不缓存错误响应；预缓存完整本地 OCR 引擎与模型。
- js/speak.js：iOS 自动模式优先同步调用系统语音；语音列表延迟加载时重新读取；尊重英美口音；远程音频超时延至 20 秒且停止旧音频；取消旧请求后不再启动后备发音；失败通知用户手动重试。
- js/app.js：复习评级不再等待 IndexedDB 后才渲染/发音；自由练习不改 SRS；导入页面 ID/图片属性转义，CSS 图片仅接受限定的 base64 图片；提示区加入 status；存储/发音失败提示。
- js/app.js、style.css：长按区域禁用系统触摸滚动以保证自定义拖选，捕获主指针、限制跨区域选词，禁止上下文菜单；保留取消清理。区域外仍可滚动。
- js/store.js：初始化和写入失败时降级内存并明确提示导出；处理事务 abort 和 persist promise 拒绝。
- js/parse.js：不再猜测删除末尾大写词；编号长句整条保留。
- js/sync.js：拒绝导入 gistToken；基础记录校验；二维码保留 firstAt/last，避免重置每日新词统计。
- js/dict.js：移除 Google 在线翻译后备，保留离线词典和既有 MyMemory 后备。
- js/ocr.js：绘制后释放 ImageBitmap。

## 验证
- node vocab-app/tests/unit.mjs：26 passed / 0 failed（原 24 项，更新歧义尾词预期并增加 2 项边界用例）。
- node vocab-app/tests/storage-sync.mjs：私密模式模拟、内存写入、Token 导出/导入隔离、二维码 SRS 时间与旧数据合并断言通过。
- 所有自有 JS 通过 node --check。
- Chromium：示例得到 6 条 .unit，无 pageerror；Token 不导出且不能被导入覆盖；service worker 作用域仅应用子目录；其他缓存保留；离线刷新成功。
- 7 个 vendor 文件逐个匹配任务指定 SHA-256；词典输出 28938 25949 2390304 959286，dict.txt SHA-256 ed37461ec58dc68e665f9f834c916ed565a255d08967a37f89825d5d9949ce85。

## 未解决/需真机验证
- 未使用真实 iPhone/iPad Safari。系统语音质量、远程 MP3 playbackRate、相机、12MP OCR 峰值内存及长按操作仍需真机测试。
- iOS 手势限制意味着异步远程音频失败后，系统语音回退不能保证成功。自动模式优先系统语音并提示重试；手动选择有道或连续播放后续条目仍可能被系统阻止。
- 自定义拖选区域禁用触摸滚动，需在区域外滚动长篇正文。
- QR 使用 deflate-raw CompressionStream；较旧 Safari 可能不支持，可使用文件导出/导入。
- GitHub Pages、MyMemory、有道和可选 Gist 的大陆可达性未从大陆网络验证；离线词典/OCR 同站点自带，不依赖 jsDelivr 首次运行。
- 合并采用记录 updated 最新者胜出，不能自动解决跨设备时钟偏差或并发复习冲突；导入前应保留备份。
- 浏览器可能清理本地存储；persist 拒绝不能保证永久保存，请定期导出。
