# Enterprise Skill Platform: Capability Release Implementation Plan v2.0

## 1. Phase 1: Foundation (Completed)

- [x] Infrastructure bootstrap (raw SQL tables).
- [x] Backend service: Release lifecycle management (create, build, validate, draft).
- [x] Backend service: Approval, deployment, rollback, and audit logic.
- [x] Portal page: Admin management for capability releases.
- [x] API Client for Portal.
- [x] Verification: Template-type release chain.
- [x] Verification: Temporal-workflow-type release chain.

## 2. Phase 2: Refinement & UX (In Progress)

### 2.1 UI/UX Enhancements
- [x] Implement "Capability Studio": Dedicated editor for DSL and codegen side-by-side.
- [x] Implement "Release Center": Consumer-facing view of available skills and their release history.
- [x] Add real-time log streaming via SSE/WebSockets for build/validation steps.
- [x] Visualize "Diff" between release snapshots.

### 2.2 Functional Deepening
- [x] Multi-environment configuration management.
- [x] Automatic smoke tests post-deployment.
- [x] Support for rollback to specific release version.
- [ ] Integration with external CI/CD pipelines (optional).

### 2.3 Current Status Summary

- Phase 2 UI/UX 主目标已完成，`Capability Studio` 与 `Release Center` 已具备可用首版。
- `Capability Studio` 已支持：
  - 源定义编辑
  - Skill 草案编辑
  - `paramsSchema` 表单化编辑
  - `apiEndpoints` 结构化编辑
  - 构建 / Sandbox 校验实时日志
  - Snapshot Diff 对比
- `Release Center` 已支持：
  - 发布版本列表
  - 状态筛选与搜索
  - 发布详情查看
  - 跳转到指定 `Capability Release`
- Phase 2 功能深化当前已完成：
  - 多环境配置管理首版（`deploymentProfiles` + 部署覆盖参数）
  - 自动部署后 smoke test 回写到 `capability_validations`
  - 回滚到指定 release version
- Phase 2 当前剩余的主要尾项：
  - 外部 CI/CD 集成（可选）
  - 多环境配置的进一步增强（独立配置表、密钥托管、更细粒度策略）

## 3. Phase 3: Scaling & Compliance (Future)

- [ ] Transition from raw SQL bootstrap to Prisma Migrations.
- [ ] Fine-grained RBAC for release actions (who can approve vs. who can deploy).
- [ ] Integration with Enterprise Audit systems.
- [ ] Support for high-availability worker deployment strategies.

## 4. Current Landing Results

The following core flows are verified and live:

1. **Template Release**:
   - Snapshot -> Static Validate -> Sandbox Validate -> Skill Draft -> Approve -> Publish -> Deploy.
   - Runtime: `flow_runtime`.
2. **Temporal Workflow Release**:
   - Snapshot -> Codegen Build -> Static Validate -> Sandbox Validate -> Skill Draft -> Approve -> Publish -> Deploy.
   - Runtime: `temporal_worker`.
   - AI Prompt engineering for robust codegen (self-contained, no external imports).
   - Sandbox executor fixes for `MockRequests` compliance.

## 5. Phase 2 Incremental Landing Notes

1. **Capability Studio**
   - 已从只读详情演进为工作台式页面。
   - 已支持源定义编辑、Skill 草案编辑、参数 Schema 结构化编辑与 API Endpoint 结构化编辑。

2. **Release Center**
   - 已新增用户侧入口，可按状态检索已发布或已部署能力。
   - 已支持从发布中心跳转回 `Capability Release` 详情。

3. **Real-time Streaming**
   - `build` 与 `sandbox validate` 已接入 SSE 风格流式日志展示。

4. **Snapshot Diff**
   - 已支持版本选择、差异统计、只看差异与双栏对比。

5. **Post-deploy Smoke Test**
   - `deploy` 成功后自动触发一次 `post_deploy_smoke` 验证。
   - smoke test 结果会写入 `capability_validations`，并关联到 `deployment_records.smoke_validation_id`。

6. **Multi-environment Configuration**
   - 已支持在 `sourcePayload.deploymentProfiles` 中维护 `dev/test/staging/prod` 环境配置。
   - Portal 部署弹窗支持环境选择、策略选择、环境 profile 预览和覆盖参数。
   - 部署记录会持久化环境 profile、覆盖参数和最终生效配置。
