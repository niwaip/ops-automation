# AI识别测试说明

## 测试文件结构

```
apps/backend/capabilities/document-domain/
├── test/e2e/
│   └── ai-identify.e2e-spec.ts          # E2E测试
├── scripts/
│   └── run-ai-tests.sh                  # 测试运行脚本
└── docs/
    └── AI-IDENTIFY-TESTS.md             # 测试说明

docker/
├── docker-compose.test.yml               # 测试环境配置
└── mock-ai-server.js                     # Mock AI服务器
```

## 测试覆盖范围

### 说明

- 历史 `ai-identifier.service.spec.ts` 单元测试入口已退出当前仓库。
- 当前保留的 AI 识别验证入口以 `ai-identify.e2e-spec.ts` 为主。

### E2E测试 (`ai-identify.e2e-spec.ts`)

| 测试模块                                       | 测试内容                     |
| ---------------------------------------------- | ---------------------------- |
| **POST /studio/direct-ai-identify**            | 直接AI识别API                |
| **POST /studio/direct-ai-identify-multistage** | 多阶段AI识别API              |
| **GET /studio/direct-ai-identify-progress**    | SSE进度API                   |
| **POST /studio/validate-content**              | 内容验证API                  |
| **POST /studio/preview-content**               | 预览内容API                  |
| **GET /studio/template-types**                 | 模板类型列表API              |
| **完整流程**                                   | identify-preview-apply cycle |
| **性能测试**                                   | 大文档处理、响应时间         |

## 运行测试

### 方式1: Docker环境（推荐）

```bash
# 在仓库根目录运行测试（使用 mock AI 服务器）
./docker/start-smart.sh docker-compose.test.yml up --abort-on-container-exit carbone-engine-test

# 或者单独运行测试
./docker/start-smart.sh docker-compose.test.yml run --rm carbone-engine-test
```

### 方式2: 在现有容器中运行

```bash
# 在仓库根目录启动测试容器后进入
./docker/start-smart.sh docker-compose.test.yml up -d carbone-engine-test

# 进入 carbone-engine 测试容器
docker exec -it carbone-engine bash

# 运行测试
cd /app
./scripts/run-ai-tests.sh
```

### 方式3: 本地环境

```bash
# 在仓库根目录执行

# 运行仍保留的 AI E2E 测试
pnpm --filter carbone-engine test:e2e -- --testPathPattern="ai-identify.e2e-spec"
```

## 核心逻辑测试点

### 1. 流程判断（最重要的测试）

```typescript
// 测试用例: 有underlineInfo → 快速流程（1次AI调用）
it('should use quickNameParameters when underlineInfo is provided', async () => {
  // underlineInfo有数据 → expect(mockedAxios.post).toHaveBeenCalledTimes(1)
});

// 测试用例: 无underlineInfo → 多阶段流程（N次AI调用）
it('should use multi-stage flow when underlineInfo is empty', async () => {
  // underlineInfo为空 → expect(mockedAxios.post.mock.calls.length).toBeGreaterThanOrEqual(2)
});
```

### 2. 下划线信息处理

```typescript
// 测试用例: 正确处理underlineInfo的位置信息
it('should correctly process underlineInfo with position', () => {
  // 验证underlineInfo转换为内部格式
});

// 测试用例: 处理同一段落多个下划线
it('should handle multiple underline positions in same paragraph', () => {
  // 验证多个下划线都被识别
});
```

### 3. 章节过滤

```typescript
// 测试用例: 只对需要参数化的章节调用AI
it('should filter sections by needsParameterization', async () => {
  // 验证needsParameterization=false的章节不调用AI
});
```

## Mock AI服务器

测试使用mock AI服务器模拟AI响应，避免实际调用外部AI服务。

```javascript
// docker/mock-ai-server.js

// 根据prompt内容返回不同的预设响应
app.post('/ai/models/:modelId/test', (req, res) => {
  if (prompt.includes('参数位置列表')) {
    // 快速流程响应
    return res.json({ success: true, response: JSON.stringify([...]) });
  }
  if (prompt.includes('文档分析专家')) {
    // 文档理解响应
    return res.json({ success: true, response: JSON.stringify({...}) });
  }
  // ...
});
```

## 测试数据准备

### 合同模板示例

```typescript
const mockContractContent = `
第一条 协议双方

甲方：______
地址：______
法定代表人：______

乙方：______
地址：______
法定代表人：______

第二条 合同内容

本合同于____年____月____日签署，合同金额为____元。

第三条 合同生效

本合同自双方签字之日起生效，具有法律效力。
`;

const mockUnderlineInfo = [
  {
    text: '______',
    underlineType: 'single',
    paragraphText: '甲方：______',
    paragraphIndex: 0,
    position: { start: 3, end: 9 },
  },
  // ...
];
```

## 注意事项

1. **代码修改后需要重启容器**: 由于代码通过卷加载，修改代码后需要重启容器才能生效

   ```bash
   docker restart carbone-engine
   ```

2. **测试会使用mock AI**: 测试环境使用mock-ai-server.js，不会调用真实AI服务

3. **测试隔离**: E2E测试使用独立的模板和输出目录，不会影响实际数据

4. **覆盖率报告**: 单元测试会生成覆盖率报告，可在`coverage/`目录查看
