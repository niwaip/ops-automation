[OPEN] portal-vite-chunk

# 症状

- 远程服务器上的 `ops-portal` 容器启动后，Vite 在运行时反复报错：
  `Cannot find module '/app/node_modules/vite/dist/node/chunks/dep-D-7KCb9p.js' imported from /app/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js'`
- 错误发生在 `vite` 自身的 `node_modules` 内部 chunk 依赖解析阶段，而不是业务源码导入阶段。

# 当前约束

- 问题发生在其他服务器，当前会话不直接连接远程环境。
- 本次先做静态分析，不修改业务逻辑，不直接执行远程命令。

# 可证伪假设

1. `portal_node_modules` 卷里残留了不完整的 `vite` 安装，导致某个新版本 chunk 文件缺失。
2. 容器内执行 `npm install --legacy-peer-deps` 时发生了部分覆盖，留下了 `dep-BK3b2jBa.js` 指向不存在的旧或新 chunk。
3. 远程服务器复用了旧的 `portal_node_modules` named volume，而代码或锁文件已经切换到另一版 `vite`，产生版本错配。
4. 镜像/容器启动中断或磁盘问题导致 `node_modules/vite/dist/node/chunks/` 未完整写入。
5. `npm` 与当前 `package-lock.json` 的历史状态不一致，安装树解析后得到了一套损坏的 `vite` 包内容。

# 已收集静态证据

- `apps/frontend/portal/package.json` 使用 `vite: ^5.0.8`。
- `apps/frontend/portal/package-lock.json` 为 npm lockfile v3，容器启动命令使用 `npm install --legacy-peer-deps`。
- `docker/compose` 中 `portal` 使用 bind mount `/app` + named volume `/app/node_modules`，具备卷残留与版本错配条件。

# 下一步建议

- 优先验证远程 `portal_node_modules` 卷是否脏污或残缺。
- 如需继续，可在远程执行“删除 portal node_modules 卷并重建 portal 容器”作为第一优先修复动作。
