/**
 * E2E Test Cases Definition for Save to Workspace (资料空间保存功能)
 * Covers:
 * - Personal mode (沙盒保存内容) vs Work mode (工作任务成果)
 * - Pure content, HTML artifact generation, Markdown multi-level structure
 * - Companion files synchronization
 * - AI model metadata attribution
 * - Idempotency vs Session isolation
 */

export function buildCases(runId) {
  const timestamp = Date.now();

  return [
    {
      id: 'personal-pure-content',
      name: '个人模式：纯文本/问答沉淀生成与保存',
      description: '验证常规问答在个人模式下保存至「沙盒保存内容 (saved)」专属成果文件夹，包含标准 FrontMatter 和异步 AI 深度提炼',
      dto: {
        title: `敏捷开发站会规约_${runId}`,
        content: `## 团队站会实施要点\n\n1. 每日固定 9:30 开始，时长控制在 15 分钟以内。\n2. 聚焦三个问题：昨天完成了什么、今天计划做什么、遇到什么阻碍。\n3. 会后单独对齐阻碍事项，不在站会现场展开深度技术方案评审。\n4. 站会看板实时同步当前 Sprint 进度与风险燃尽图。`,
        tags: ['敏捷开发', '团队规范', '日常站会'],
        folderPath: '沙盒保存内容 (saved)',
        type: 'qa_note',
        userQuery: '请帮我梳理一套研发团队日常站会的高效规范与注意要点',
        sessionId: `sess-personal-pure-${timestamp}`,
        messageId: `msg-personal-pure-${timestamp}`,
      },
      expected: {
        rootFolderName: '沙盒保存内容 (saved)',
        folderPrefixRegex: /^\d{8}_/,
        docExtension: '.md',
        frontMatterCheck: (content) =>
          content.includes('type: "qa_note"') &&
          content.includes('status: "candidate"') &&
          content.includes('source:') &&
          content.includes('channel: "chat"'),
        checkAiRefinement: true,
      },
    },

    {
      id: 'personal-html-generation',
      name: '个人模式：HTML 格式交互式页面生成与资产提取',
      description: '验证当个人对话生成自包含 HTML（如看板原型/PPT）时，系统自动提取内联 HTML 为独立资产并创建导航链接',
      dto: {
        title: `DevOps发布看板原型_${runId}`,
        content: `这是为您设计的自包含前端 DevOps 流水线发布监控看板原型。\n\n**输出文件**: \`devops-pipeline-dashboard.html\`\n\n\`\`\`html\n<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <title>DevOps持续交付与发布监控看板</title>\n  <style>\n    body { font-family: sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }\n    .card { background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 12px; }\n    .badge { color: #22c55e; font-weight: bold; }\n  </style>\n</head>\n<body>\n  <h1>🚀 DevOps 持续交付流水线看板</h1>\n  <div class=\"card\">\n    <h3>生产集群发布状态: <span class=\"badge\">HEALTHY (99.99%)</span></h3>\n    <p>当前运行版本: release-v2.16.4 | 构建耗时: 3m 42s</p>\n  </div>\n</body>\n</html>\n\`\`\`\n\n看板已就绪，支持在任意现代浏览器中双击直接离线预览与交互。`,
        tags: ['DevOps', 'HTML原型', '前端看板'],
        folderPath: '沙盒保存内容 (saved)',
        type: 'qa_note',
        userQuery: '制作一个用于大屏展示的 DevOps 持续发布监控 HTML 原型页面',
        sessionId: `sess-personal-html-${timestamp}`,
        messageId: `msg-personal-html-${timestamp}`,
      },
      expected: {
        rootFolderName: '沙盒保存内容 (saved)',
        expectedArtifactName: 'devops-pipeline-dashboard.html',
        expectedMimeType: 'text/html',
        checkArtifactCatalogInNote: true,
      },
    },

    {
      id: 'personal-markdown-complex',
      name: '个人模式：复杂 Markdown 格式生成（表格/公式/多级标题）',
      description: '验证包含复杂 Markdown 表格、分级章节与代码块的深度调研分析报告的完整性与目录提取',
      dto: {
        title: `分布式缓存架构评测报告_${runId}`,
        content: `## 1. 架构总览与选型对比\n\n针对超大规模高并发场景，Redis 与 KeyDB/Dragonfly 的关键性能与架构差异如下：\n\n| 特性对比项 | Redis 7.2 | Dragonfly 1.15 | KeyDB 6.3 |\n| :--- | :--- | :--- | :--- |\n| **线程架构** | 单主线程 + I/O多线程 | 无锁多线程 Shared-nothing | 多主线程并发处理 |\n| **吞吐量 (QPS)** | ~120K QPS | ~1.5M QPS (16核) | ~600K QPS |\n| **内存利用率** | 标准 Jemalloc | 深度紧凑索引优化 (省30%) | 标准缓存对齐 |\n| **集群高可用** | Redis Sentinel / Cluster | 兼容 Cluster 协议 | 主从复制 / Active-Replica |\n\n## 2. 压测脚本参考\n\n\`\`\`bash\n# 执行 redis-benchmark 压力测试\nredis-benchmark -h 127.0.0.1 -p 6379 -c 50 -n 100000 -t get,set -q\n\`\`\`\n\n## 3. 运维改造建议\n- 读多写少且成本敏感业务优先评估内存压缩比；\n- 关键交易系统仍建议保留原生 Redis Cluster 以获得最广泛社区生态支持。`,
        tags: ['架构评测', 'Redis', 'Markdown深度报告'],
        folderPath: '沙盒保存内容 (saved)',
        type: 'qa_note',
        userQuery: '对比现代主流内存缓存架构并以表格形式输出对比评测报告',
        sessionId: `sess-personal-md-${timestamp}`,
        messageId: `msg-personal-md-${timestamp}`,
      },
      expected: {
        rootFolderName: '沙盒保存内容 (saved)',
        docExtension: '.md',
        checkHeadingsExtracted: true,
        checkTablePreserved: true,
      },
    },

    {
      id: 'work-pure-task-result',
      name: '工作模式：纯业务任务结果沉淀与归档',
      description: '验证企业工作模式下，任务执行成果自动归档至「工作任务成果 (tasks)」，携带 executionId 与任务成果元数据',
      dto: {
        title: `线上服务链路健康巡检总结_${runId}`,
        content: `### 🎯 巡检执行完毕汇报\n\n本次全量服务链路自动化拨测已于 2026-10-16 顺利完成：\n- **覆盖服务数量**：18 个微服务节点\n- **异常节点数**：0\n- **平均链路时延 (P99)**：34.2 ms\n- **数据库连接池利用率**：14.6%\n- **结论**：所有关键业务链路均处于健康状态，未触发任何警报。`,
        tags: ['运维巡检', '健康检查', '任务成果'],
        folderPath: '工作任务成果 (tasks)',
        type: 'task_result',
        executionId: `06e9ace5-4ca9-4fac-8c84-42adc36eed81`, // existing valid execution ID in db
        userQuery: '执行一次线上微服务链路健康巡检并输出巡检报告',
        sessionId: `sess-work-pure-${timestamp}`,
        messageId: `msg-work-pure-${timestamp}`,
        skillUsed: 'platform.system.healthcheck',
      },
      expected: {
        rootFolderName: '工作任务成果 (tasks)',
        folderPrefixRegex: /^\d{8}_/,
        docExtension: '.md',
        frontMatterCheck: (content) =>
          content.includes('type: "task_result"') &&
          content.includes('execution_id: "06e9ace5-4ca9-4fac-8c84-42adc36eed81"') &&
          content.includes('skill_used: "platform.system.healthcheck"'),
      },
    },

    {
      id: 'work-companion-artifacts',
      name: '工作模式：任务成果伴生复合产物归集（HTML与结构化数据）',
      description: '验证工作模式下伴随工具产生的报告（HTML交付物与结构化结果）自动作为产物同步至专属文件夹并建立索引表',
      dto: {
        title: `合规审查及安全报告_${runId}`,
        content: `### 📑 合规安全审查报告生成完毕\n\n本次审查识别出 2 项轻微风险条款，已出具审查文档及可视化概览图表。\n\n**输出交付物**: \`compliance_security_audit.html\`\n\n\`\`\`html\n<!DOCTYPE html>\n<html>\n<head><title>企业合规安全审计报告</title></head>\n<body>\n  <h2>企业合规与隐私审计摘要</h2>\n  <ul>\n    <li>GDPR/PIPL 遵循度: 98%</li>\n    <li>敏感数据脱敏率: 100%</li>\n  </ul>\n</body>\n</html>\n\`\`\`\n\n详细审查意见见上表与附件。`,
        tags: ['法务合规', '安全审计', '交付资产'],
        folderPath: '工作任务成果 (tasks)',
        type: 'task_result',
        executionId: `06e9ace5-4ca9-4fac-8c84-42adc36eed81`,
        userQuery: '审查第三方合作协议合规风险并出具可视化安全审计报告',
        sessionId: `sess-work-artifacts-${timestamp}`,
        messageId: `msg-work-artifacts-${timestamp}`,
        rawResultData: {
          auditScore: 98,
          riskLevel: 'LOW',
          scannedClauses: 45,
          timestamp: new Date().toISOString(),
        },
      },
      expected: {
        rootFolderName: '工作任务成果 (tasks)',
        expectedArtifactName: 'compliance_security_audit.html',
        checkArtifactCatalogInNote: true,
        checkRawDataInNote: true,
      },
    },

    {
      id: 'custom-model-attribution',
      name: '个人模型/指定 AI 模型元数据保存与记录',
      description: '验证指定不同模型（如 qwen-3.8-27b-custom）时，初始保存捕获请求模型，提炼后准确记录有效生效模型与降级溯源标记',
      dto: {
        title: `高并发系统调优纪要_${runId}`,
        content: `## 系统瓶颈定位分析\n经系统线程Dump排查，主要阻塞点为日志同步落盘引起的线程争抢。调整为异步 RingBuffer 写入后，吞吐提升 350%。`,
        tags: ['性能调优', '架构分析'],
        folderPath: '沙盒保存内容 (saved)',
        type: 'qa_note',
        aiModel: 'qwen-3.8-27b-custom',
        userQuery: '分析高并发日志写入瓶颈并提出优化方案',
        sessionId: `sess-custom-model-${timestamp}`,
        messageId: `msg-custom-model-${timestamp}`,
      },
      expected: {
        rootFolderName: '沙盒保存内容 (saved)',
        frontMatterCheck: (content) => content.includes('ai_model: "qwen-3.8-27b-custom"'),
        checkAiRefinement: true,
        postRefinementCheck: (refinedNode, preview) =>
          preview.content?.includes('requested_model: "qwen-3.8-27b-custom"') &&
          preview.content?.includes('fallback_used: true') &&
          (preview.content?.includes('ai_model: "default"') || preview.content?.includes('ai_model: "rule_fallback"')),
      },
    },

    {
      id: 'same-session-idempotency',
      name: '同会话 5 分钟内幂等防重机制',
      description: '验证在同一会话中多次触发同一内容保存时，后端精准返回已保存节点，防止脏数据与配额重复消耗',
      firstCall: {
        title: `幂等性校验测试文档_${runId}`,
        content: `这是一段测试幂等性的固定内容。在 5 分钟内同会话重复提交应返回同一节点。`,
        folderPath: '沙盒保存内容 (saved)',
        type: 'qa_note',
        sessionId: `sess-idempotency-${timestamp}`,
        messageId: `msg-idempotency-${timestamp}`,
      },
      secondCall: {
        title: `幂等性校验测试文档_${runId}`,
        content: `这是一段测试幂等性的固定内容。在 5 分钟内同会话重复提交应返回同一节点。`,
        folderPath: '沙盒保存内容 (saved)',
        type: 'qa_note',
        sessionId: `sess-idempotency-${timestamp}`,
        messageId: `msg-idempotency-${timestamp}`,
      },
    },

    {
      id: 'cross-session-isolation',
      name: '跨会话时间窗口隔离机制（防同名覆盖）',
      description: '验证不同会话使用完全相同的主题标题时，后端自动创建独立的专属文件夹（附加 HHMMSS 时间后缀），彻底杜绝跨会话覆盖',
      sessionA: {
        title: `通用系统方案_${runId}`,
        content: `会话 A 的方案内容：微服务网关选型。`,
        folderPath: '沙盒保存内容 (saved)',
        sessionId: `sess-iso-A-${timestamp}`,
      },
      sessionB: {
        title: `通用系统方案_${runId}`,
        content: `会话 B 的独立方案内容：分布式存储选型。`,
        folderPath: '沙盒保存内容 (saved)',
        sessionId: `sess-iso-B-${timestamp}`,
      },
    },
  ];
}
