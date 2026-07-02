[OPEN] browser-template-iconv-lite

# 症状

- 远程 `ops-browser-template` 在执行 `npm run build` 时退出。
- Prisma generate 成功，随后 Node 在加载 `external-editor` 时抛出：
  `Cannot find module '/app/node_modules/iconv-lite/lib/index.js'`

# 当前约束

- 问题发生在其他服务器，本地环境正常。
- 本轮仅做静态分析，不直接连接远程执行命令。

# 可证伪假设

1. 远程 `browser_template_node_modules` volume 中的 `iconv-lite` 包内容残缺，`package.json` 存在但 `lib/index.js` 缺失。
2. `npm install --legacy-peer-deps --include=dev` 在远程执行过程中部分成功，导致 `external-editor` 已装入、`iconv-lite` 未完整展开。
3. 远程机器复用了旧的 `browser_template_node_modules`，当前依赖树与源码/锁文件不一致。
4. 远程磁盘、inode 或容器写层异常，导致 npm 解包阶段静默损坏部分文件。
5. `npm` 安装链路未严格依赖 lockfile，远程解析出一套边缘依赖组合，但根因仍体现为安装产物损坏。

# 已收集静态证据

- `apps/backend/capabilities/browser-domain/templates/package.json` 中未直接声明 `iconv-lite`。
- `package-lock.json` 明确包含 `external-editor` 与 `iconv-lite`，说明它们应由 dev 依赖链带入。
- compose 中 `browser-template` 使用 bind mount `/app` + named volume `/app/node_modules`，并在启动时执行 npm install，具备 volume 脏污与部分安装的条件。

# 初步结论

- 更接近远程 `node_modules` 损坏或陈旧，而不是源码缺依赖。
- 首选修复动作应是清理 `browser_template_node_modules` 后重建容器。
