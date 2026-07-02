# 仓库清理对象清单

本文档用于整理当前仓库中值得清理、归档或进一步确认的文件对象，避免把临时产物、编译结果、历史兼容包和运行时数据长期保留在主仓库中。

结论基于当前 `git ls-files` 快照整理，不代表这些文件已经可以直接删除；其中一部分仅表示“高可疑”，仍需在清理前确认引用关系和发布方式。

## 当前判断

- 当前仓库是多应用 monorepo，文件多本身是正常现象。
- 主体文件仍然是业务源码、配置、文档和测试，不建议做大范围误删。
- 真正值得优先清理的是临时文件、源码目录内混入的编译产物、历史兼容包和可能不应提交的运行时或本地开发资源。

## 清理分级

### A. 肯定优先清理

这类对象通常不应进入版本库，或至少不应长期保留在主分支。

#### 1. 根目录浏览器 E2E 临时 JSON

匹配模式：

```text
.tmp-browser-e2e-*.json
```

当前示例：

```text
.tmp-browser-e2e-fieldfill-verify-hit.json
.tmp-browser-e2e-fieldfill-verify.json
.tmp-browser-e2e-fields.json
.tmp-browser-e2e-fill-check.json
.tmp-browser-e2e-fill-hit.json
.tmp-browser-e2e-nav-direct-url-hit.json
.tmp-browser-e2e-nav-direct-url.json
.tmp-browser-e2e-obs.json
.tmp-browser-e2e-read-after-fill-hit.json
.tmp-browser-e2e-read-after-fill.json
.tmp-browser-e2e-read-by-value-hit.json
.tmp-browser-e2e-read-by-value.json
.tmp-browser-e2e-read-verify-hit.json
.tmp-browser-e2e-read-verify.json
```

判断：

- 高置信度属于调试或验证残留。
- 不属于正式源码、配置或长期文档资产。
- 当前根 `.gitignore` 仅忽略 `.tmp/` 目录，没有覆盖这类根目录临时 JSON。

建议动作：

- 从 Git 中移除这些文件。
- 在根 `.gitignore` 中补充如下规则：

```gitignore
.tmp-*.json
.tmp-browser-e2e-*.json
```

### B. 大概率可清理

这类对象高度像生成产物或误提交文件，但删除前最好先确认是否被运行流程或发布流程依赖。

#### 2. `identity-access` 源码目录中的 `.js` 和 `.js.map`

目录：

```text
apps/backend/governance/identity-access/src/
```

当前典型对象：

```text
apps/backend/governance/identity-access/src/decorators/index.js
apps/backend/governance/identity-access/src/decorators/index.js.map
apps/backend/governance/identity-access/src/decorators/permissions.decorator.js
apps/backend/governance/identity-access/src/decorators/permissions.decorator.js.map
apps/backend/governance/identity-access/src/decorators/roles.decorator.js
apps/backend/governance/identity-access/src/decorators/roles.decorator.js.map
apps/backend/governance/identity-access/src/guards/index.js
apps/backend/governance/identity-access/src/guards/index.js.map
apps/backend/governance/identity-access/src/guards/jwt-auth.guard.js
apps/backend/governance/identity-access/src/guards/jwt-auth.guard.js.map
apps/backend/governance/identity-access/src/guards/roles.guard.js
apps/backend/governance/identity-access/src/guards/roles.guard.js.map
apps/backend/governance/identity-access/src/index.js
apps/backend/governance/identity-access/src/index.js.map
apps/backend/governance/identity-access/src/metadata/authz.constants.js
apps/backend/governance/identity-access/src/metadata/authz.constants.js.map
apps/backend/governance/identity-access/src/strategies/index.js
apps/backend/governance/identity-access/src/strategies/index.js.map
apps/backend/governance/identity-access/src/strategies/ldap.strategy.js
apps/backend/governance/identity-access/src/strategies/ldap.strategy.js.map
```

判断：

- 同目录已经存在对应 `.ts` 源码，明显像局部编译残留。
- 这类文件混在 `src/` 下，会增加阅读噪音，也容易误导引用路径和构建结果。
- 如果项目的运行入口并不直接依赖这些 `.js` 文件，就应清理。

建议动作：

- 先检索是否有直接引用这些 `.js` 文件。
- 若无直接依赖，移除这些 `.js` 和 `.js.map`。
- 在忽略规则中增加适度约束，避免源码目录再次落入局部编译结果。

可考虑的忽略策略：

```gitignore
apps/backend/governance/identity-access/src/**/*.js
apps/backend/governance/identity-access/src/**/*.js.map
```

注意：

- 只有在确认该服务不会从 `src/**/*.js` 直接运行时，才能加这类定向忽略规则。

#### 3. `packages/backend-contracts/*` 中的编译产物

目录：

```text
packages/backend-contracts/
```

当前模式：

```text
packages/backend-contracts/*/src/index.ts
packages/backend-contracts/*/index.js
packages/backend-contracts/*/index.d.ts
packages/backend-contracts/*/index.js.map
packages/backend-contracts/*/index.d.ts.map
```

判断：

- 这些包同时保留源码和构建产物，典型像“发布包目录”形态。
- 如果这些包仅供 monorepo 内部消费，通常没有必要把产物一并提交。
- 如果这些包还承担外部发布、离线消费或不经构建直接被引用，则保留产物可能是有意设计。

建议动作：

- 先确认这些包是否需要 `index.js` 和 `index.d.ts` 作为提交产物。
- 若只在仓库内部使用，优先改为安装或构建阶段生成。
- `*.map` 基本可作为第一批优先候选移除。

建议优先审查的文件模式：

```text
packages/backend-contracts/*/index.js.map
packages/backend-contracts/*/index.d.ts.map
```

### C. 需要先确认后再清理

这类对象有一定清理价值，但误删风险比前两组高。

#### 4. `packages/contracts/` 历史兼容包

目录：

```text
packages/contracts/
```

当前对象：

```text
packages/contracts/errors.d.ts
packages/contracts/errors.js
packages/contracts/execution.d.ts
packages/contracts/execution.js
packages/contracts/index.d.ts
packages/contracts/index.js
packages/contracts/package.json
```

判断：

- 目录形态偏向历史发布产物或兼容层，不像活跃源码包。
- 如果仓库内仍有旧模块依赖它，不能直接删。
- 如果迁移到 `packages/backend-contracts/` 已完成，则这是很典型的收缩对象。

建议动作：

- 先全仓搜索 `packages/contracts` 的实际引用。
- 统计是否还有 `package.json` 依赖或 TS path alias 指向该目录。
- 如果已无运行或构建依赖，可归档或移除。

#### 5. 各服务 `generated/prisma/` 目录

典型目录：

```text
apps/backend/core/platform/src/generated/prisma/
apps/backend/execution-control/control-plane/src/generated/prisma/
apps/backend/execution-control/session-broker/src/generated/prisma/
apps/backend/intelligence/ai-orchestrator/src/generated/prisma/
apps/backend/runtimes/replay-worker/src/generated/prisma/
apps/backend/capabilities/browser-domain/semantics/generated/prisma/
apps/backend/capabilities/document-domain/report/generated/prisma/
apps/backend/capabilities/document-domain/template/generated/prisma/
```

判断：

- 这是典型代码生成目录。
- 从工程纯洁度上看，不提交更合理。
- 但很多仓库会保留 Prisma 产物，以保证某些环境在未先执行生成命令时也能编译或运行。

建议动作：

- 确认 CI、Docker、开发脚本是否都稳定执行 `prisma generate`。
- 如果生成步骤已完全可靠，再评估是否改为忽略。
- 若当前运行链路依赖这些文件已存在，则暂时不要动。

#### 6. `docker/office-addin/certs/` 中的证书与私钥

目录：

```text
docker/office-addin/certs/
```

当前对象：

```text
docker/office-addin/certs/ca.crt
docker/office-addin/certs/cert.crt
docker/office-addin/certs/server.crt
docker/office-addin/certs/ca.key
docker/office-addin/certs/cert.key
docker/office-addin/certs/server.key
```

判断：

- `*.crt` 可以是团队共享开发证书。
- `*.key` 涉及私钥，不建议长期直接提交到主仓库，除非这是明确的内网开发约定且无安全风险。

建议动作：

- 先确认这些证书是否仅用于本地开发。
- 若是本地开发证书，优先改成脚本生成或个人本地注入。
- 若确需保留，至少补充文档说明来源、用途和轮换方式。

#### 7. 文档样例附件与历史设计资料

典型对象：

```text
docs/artifacts/misc/*.xlsx
docs/design/v2/**
docs/design/v3/**
docs/design/archive/**
```

判断：

- 这些内容不是“垃圾文件”，但不是当前主实现基线。
- 如果仓库体积持续变大，可以把低频历史文档进一步归档，或迁移到外部知识库。

建议动作：

- 不建议直接删除。
- 可以先做目录分层优化，把低频资料进一步下沉到更明确的归档区域。

## 不建议清理的主体

以下对象虽然数量多，但大概率属于应当保留的仓库主资产：

- `apps/` 下的大部分 `.ts`、`.tsx`、配置和脚本。
- `packages/` 下仍处于活跃使用的共享包。
- `docker/` 下的 compose、镜像、脚本和 SQL。
- `docs/` 下仍被当前流程引用的设计、runbook 和样例资料。
- `tests/` 与 `.github/` 下的自动化支持文件。

## 推荐执行顺序

### 第一批

- 删除根目录 `.tmp-browser-e2e-*.json`。
- 补充根 `.gitignore`，避免这类临时 JSON 再次进入 Git。

### 第二批

- 逐项确认 `apps/backend/governance/identity-access/src/` 中的 `.js` 和 `.js.map` 是否被运行链路使用。
- 若未使用，移除并增加定向忽略规则。

### 第三批

- 审核 `packages/backend-contracts/*` 的发布方式。
- 优先移除 `*.map`，再决定是否保留 `index.js` 和 `index.d.ts`。

### 第四批

- 审核 `packages/contracts/` 是否仍有引用。
- 审核各 `generated/prisma/` 是否必须提交。
- 审核 `docker/office-addin/certs/*.key` 是否可以改为本地生成。

## 建议补充的忽略规则

以下规则不是要求一次性全部加入，而是建议按确认结果逐步落地：

```gitignore
# Root temporary browser E2E artifacts
.tmp-*.json
.tmp-browser-e2e-*.json

# Optional: remove source-map artifacts from committed package outputs
*.js.map
*.d.ts.map

# Optional: only after verifying runtime does not depend on source JS
apps/backend/governance/identity-access/src/**/*.js
apps/backend/governance/identity-access/src/**/*.js.map
```

## 落地原则

- 先删临时文件，再处理编译产物，最后再动兼容包和生成目录。
- 任何可能影响运行链路或发布方式的目录，都必须先做引用确认。
- 清理目标应优先保证“减少噪音”和“避免误提交”，而不是追求一次性把仓库变小。
- 对于需要保留的生成物，应补充文档说明原因，避免后续反复争议。
