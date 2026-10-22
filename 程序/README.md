# 3D 外观预览器源码

日常使用请双击上级目录的启动入口。运行时需要 `runtime/node`、`server.mjs`、`catalog-store.mjs`、`dist/` 和同级 `../模型/`、`../数据/`，不依赖原工程或 node_modules。

开发：Node.js 22，`npm ci` 后运行 `npm test` / `npm run build`。`npm start` 启动已构建版本；`npm stop` 停止服务。先启动本地服务，再 `npm run dev`；Vite 将 `/api`、`/models` 转发到启动时的本地服务。

当前唯一目录来源是 `../数据/模型目录.json`。`src/spus.json` 仅用于首次启动迁移已有三台模型；目录文件存在时不再读取种子，也不会在删空后重新填充。后续手工更新已有模型时，应同步模型目录中的 bytes、sha256 和 url 版本参数；目录数据不需要重建前端。

`catalog-store.mjs` 验证 GLB、原子保存目录与文件，保留上次目录备份。删除先复制模型到回收站，提交目录后再移除活动模型文件。目录带 revision，拒绝其他窗口基于旧目录的修改。服务仅监听 127.0.0.1；写入接口校验来源与每次启动的随机令牌，不接收 SKU 图片。当前模型和品类在浏览器里通过 `src/model-library.js` 管理。

默认完整保留 GLB 自带贴图；图片上传与恢复沿用原模型 UV。MacBook 八组材质按 TEX01–TEX08 匹配，开合动画保持原有逻辑。

许可证：`THREE-LICENSE.txt`、`runtime/NODE-LICENSE.txt`、`public/draco/`。
