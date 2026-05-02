/**
 * Mock AI Server for Testing
 * 模拟AI Orchestrator服务返回预设响应
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3007;

// 中间件
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-ai-server' });
});

// Mock AI模型测试接口
app.post('/ai/models/:modelId/test', (req, res) => {
  const prompt = req.body.prompt || '';

  console.log('[Mock AI] Received prompt:', prompt.substring(0, 100) + '...');

  // 根据prompt内容返回不同的mock响应

  // 快速命名流程响应
  if (prompt.includes('参数位置列表') || prompt.includes('变量名称')) {
    return res.json({
      success: true,
      response: JSON.stringify([
        { index: 1, variablePath: '{d.partyA.name}', variableName: 'partyA_name', significance: '甲方公司名称', fieldType: 'text', confidence: 0.95 },
        { index: 2, variablePath: '{d.partyA.address}', variableName: 'partyA_address', significance: '甲方地址', fieldType: 'text', confidence: 0.90 },
        { index: 3, variablePath: '{d.partyB.name}', variableName: 'partyB_name', significance: '乙方公司名称', fieldType: 'text', confidence: 0.95 },
        { index: 4, variablePath: '{d.partyB.address}', variableName: 'partyB_address', significance: '乙方地址', fieldType: 'text', confidence: 0.90 }
      ])
    });
  }

  // 文档理解流程响应
  if (prompt.includes('文档分析专家') || prompt.includes('文档内容')) {
    return res.json({
      success: true,
      response: JSON.stringify({
        documentType: '合同',
        mainPurpose: '合同模板，用于约定双方权利义务',
        keyEntities: ['甲方', '乙方', '合同金额', '签署日期'],
        dataSchema: '{ partyA: { name, address }, partyB: { name, address }, contract: { amount, date } }',
        sections: [
          { name: '第一条 协议双方', content: '明确合同当事人', purpose: '约定双方基本信息', needsParameterization: true, estimatedParams: ['甲方名称', '甲方地址'] },
          { name: '第二条 合同内容', content: '合同主要内容', purpose: '约定合同标的', needsParameterization: true, estimatedParams: ['合同金额', '签署日期'] },
          { name: '第三条 合同生效', content: '合同生效条件', purpose: '约定生效条件', needsParameterization: false, estimatedParams: [] }
        ],
        parties: [
          { role: '甲方', fieldsNeeded: ['名称', '地址', '代表人'] },
          { role: '乙方', fieldsNeeded: ['名称', '地址', '代表人'] }
        ]
      })
    });
  }

  // 章节参数化响应
  if (prompt.includes('章节内容') || prompt.includes('参数化专家')) {
    return res.json({
      success: true,
      response: JSON.stringify({
        suggestions: [
          { index: 1, originalText: '______', variablePath: '{d.partyA.name}', variableName: 'partyA_name', fieldType: 'text', significance: '甲方名称', context: '甲方：______', confidence: 0.95 },
          { index: 2, originalText: '______', variablePath: '{d.partyA.address}', variableName: 'partyA_address', fieldType: 'text', significance: '甲方地址', context: '地址：______', confidence: 0.90 }
        ]
      })
    });
  }

  // 整合确认响应
  if (prompt.includes('整合') || prompt.includes('确认')) {
    return res.json({
      success: true,
      response: JSON.stringify([
        { index: 1, originalText: '______', variablePath: '{d.partyA.name}', variableName: 'partyA_name', fieldType: 'text', significance: '甲方名称', confidence: 0.95 },
        { index: 2, originalText: '______', variablePath: '{d.partyA.address}', variableName: 'partyA_address', fieldType: 'text', significance: '甲方地址', confidence: 0.90 },
        { index: 3, originalText: '______', variablePath: '{d.partyB.name}', variableName: 'partyB_name', fieldType: 'text', significance: '乙方名称', confidence: 0.95 },
        { index: 4, originalText: '______', variablePath: '{d.partyB.address}', variableName: 'partyB_address', fieldType: 'text', significance: '乙方地址', confidence: 0.90 }
      ])
    });
  }

  // 默认响应
  return res.json({
    success: true,
    response: JSON.stringify([
      { index: 1, variablePath: '{d.placeholder}', variableName: 'placeholder', significance: '占位符', fieldType: 'text', confidence: 0.8 }
    ])
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`[Mock AI Server] Running on port ${PORT}`);
  console.log(`[Mock AI Server] Health: http://localhost:${PORT}/health`);
  console.log(`[Mock AI Server] AI Test: POST http://localhost:${PORT}/ai/models/:modelId/test`);
});