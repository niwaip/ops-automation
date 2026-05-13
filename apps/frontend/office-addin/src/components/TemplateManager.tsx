import React, { useEffect, useState } from 'react';
import { carboneAPI } from '../api/carbone-api';
import { useAppStore } from '../taskpane/store';
import { formatLocaleDate } from './TemplateConfigPanel.helpers';

export const TemplateManager: React.FC = () => {
  const { apiBaseUrl, addDebugLog } = useAppStore();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateDetail, setTemplateDetail] = useState<any>(null);
  const [skillDetail, setSkillDetail] = useState<any>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    addDebugLog('info', '加载模板列表...', '');
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.getTemplates();
      setTemplates(result.templates || []);
      addDebugLog('info', `模板列表加载成功`, `共 ${result.templates?.length || 0} 个模板`);
    } catch (error: any) {
      addDebugLog('error', '加载模板列表失败', error.message);
    } finally {
      setLoading(false);
    }
  };

  const viewTemplateDetail = async (templateId: string) => {
    try {
      addDebugLog('info', '正在获取模板详情...', templateId);
      const template = await carboneAPI.getTemplate(templateId);
      setTemplateDetail(template);
      setSelectedTemplate(templateId);
      setShowDetailPanel(true);

      if (template.skillId) {
        addDebugLog('info', '正在获取配套Skill详情...', template.skillId);
        try {
          const skill = await carboneAPI.getSkill(template.skillId);
          setSkillDetail(skill);
          addDebugLog('info', 'Skill详情获取成功', `包含 ${skill.parameters?.length || 0} 个参数`);
        } catch (skillError: any) {
          addDebugLog('error', '获取Skill详情失败', skillError.message);
          setSkillDetail(null);
        }
      } else {
        setSkillDetail(null);
        addDebugLog('warn', '此模板暂无配套Skill', '');
      }
    } catch (error: any) {
      addDebugLog('error', '获取模板详情失败', error.message);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [apiBaseUrl]);

  return (
    <div className="config-section template-manager">
      <h3>
        📁 模板管理
        <button
          className="refresh-btn"
          onClick={loadTemplates}
          disabled={loading}
          style={{ marginLeft: '10px', padding: '2px 8px', fontSize: '12px' }}
        >
          {loading ? '加载中...' : '刷新'}
        </button>
      </h3>

      {templates.length === 0 ? (
        <div className="no-templates" style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          暂无保存的模板
        </div>
      ) : (
        <div className="template-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {templates.slice(0, 20).map((template) => (
            <div
              key={template.id}
              className={`template-item ${selectedTemplate === template.id ? 'selected' : ''}`}
              style={{
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '8px',
                backgroundColor: selectedTemplate === template.id ? '#e3f2fd' : '#fff'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                {template.fileName || `模板 ${template.id.slice(0, 8)}...`}
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                <span>格式: {template.format || 'docx'}</span>
                {template.size && <span style={{ marginLeft: '10px' }}>大小: {(template.size / 1024).toFixed(1)}KB</span>}
                {template.createdAt && <span style={{ marginLeft: '10px' }}>创建: {formatLocaleDate(template.createdAt)}</span>}
              </div>
              {template.skillId && (
                <div style={{ fontSize: '12px', color: '#1565c0', marginTop: '5px' }}>
                  🔗 配套Skill: {template.skillId.slice(0, 8)}...
                </div>
              )}
              <div style={{ marginTop: '10px' }}>
                <a
                  href={`${apiBaseUrl}/studio/download-template/${template.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '5px 15px',
                    backgroundColor: '#2196f3',
                    color: '#fff',
                    borderRadius: '4px',
                    textDecoration: 'none',
                    fontSize: '12px',
                    marginRight: '10px'
                  }}
                >
                  📥 下载模板
                </a>
                <button
                  onClick={() => viewTemplateDetail(template.id)}
                  style={{
                    padding: '5px 15px',
                    fontSize: '12px',
                    backgroundColor: '#4caf50',
                    color: '#fff',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  📋 查看详情
                </button>
                {template.skillId && (
                  <a
                    href={`${apiBaseUrl}/studio/download-skill/${template.skillId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '5px 15px',
                      marginLeft: '10px',
                      backgroundColor: '#9c27b0',
                      color: '#fff',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      fontSize: '12px'
                    }}
                  >
                    🔧 下载Skill
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showDetailPanel && templateDetail && (
        <div style={{
          marginTop: '15px',
          padding: '15px',
          border: '2px solid #2196f3',
          borderRadius: '8px',
          backgroundColor: '#fafafa'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ margin: 0 }}>📋 模板与Skill详情</h4>
            <button
              onClick={() => setShowDetailPanel(false)}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                backgroundColor: '#f44336',
                color: '#fff',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              ✕ 关闭
            </button>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <h5 style={{ color: '#2196f3', marginBottom: '8px' }}>📄 模板信息</h5>
            <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
              <div><strong>模板ID:</strong> {templateDetail.id}</div>
              <div><strong>文件名:</strong> {templateDetail.fileName || '未命名'}</div>
              <div><strong>格式:</strong> {templateDetail.format}</div>
              {templateDetail.size && <div><strong>大小:</strong> {(templateDetail.size / 1024).toFixed(1)} KB</div>}
              {templateDetail.skillId && <div><strong>配套SkillID:</strong> {templateDetail.skillId}</div>}
            </div>
          </div>

          {skillDetail ? (
            <div style={{ marginBottom: '15px' }}>
              <h5 style={{ color: '#9c27b0', marginBottom: '8px' }}>🔧 配套Skill (AI参数化指南)</h5>
              <div style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' }}>
                <div><strong>Skill ID:</strong> {skillDetail.id}</div>
                <div><strong>模板类型:</strong> {skillDetail.templateType || '未指定'}</div>
                <div><strong>参数数量:</strong> {skillDetail.parameters?.length || 0} 个</div>
              </div>

              {skillDetail.parameters && skillDetail.parameters.length > 0 && (
                <div>
                  <h6 style={{ marginBottom: '8px' }}>📝 参数化变量列表</h6>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {skillDetail.parameters.map((param: any, idx: number) => (
                      <div key={idx} style={{
                        padding: '8px',
                        margin: '5px 0',
                        border: '1px solid #e0e0e0',
                        borderRadius: '4px',
                        backgroundColor: '#fff'
                      }}>
                        <div style={{ fontWeight: 'bold', color: '#1565c0' }}>
                          {param.name}
                        </div>
                        <div style={{ fontSize: '12px', marginTop: '5px' }}>
                          <span style={{ color: '#666' }}>用途: </span>
                          <span>{param.usage}</span>
                        </div>
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ color: '#666' }}>数据类型: </span>
                          <span style={{ color: '#4caf50' }}>{param.dataType}</span>
                        </div>
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ color: '#666' }}>提取提示: </span>
                          <span>{param.extractionHint}</span>
                        </div>
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ color: '#666' }}>示例值: </span>
                          <span style={{ color: '#ff9800' }}>{param.example}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff3e0', borderRadius: '4px' }}>
              <h5 style={{ color: '#ff9800', marginBottom: '5px' }}>⚠️ 无配套Skill</h5>
              <div style={{ fontSize: '13px' }}>
                此模板暂无配套的AI参数化指南(Skill)。Skill文件用于指导AI如何识别和提取数据填充到模板变量中。
              </div>
            </div>
          )}

          <div style={{ padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px', fontSize: '12px' }}>
            <h6 style={{ marginBottom: '8px', color: '#2e7d32' }}>💡 Skill文件如何指导AI参数化</h6>
            <div style={{ lineHeight: '1.6' }}>
              <p>Skill文件包含模板的参数化指南，结构如下：</p>
              <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                <li><strong>parameters</strong>: 参数列表，每个参数包含：</li>
                <li style={{ marginLeft: '15px' }}><code>name</code>: 变量名（如 <code>{'{d.partyA.name}'}</code>）</li>
                <li style={{ marginLeft: '15px' }}><code>usage</code>: 用途说明（如"甲方名称"）</li>
                <li style={{ marginLeft: '15px' }}><code>dataType</code>: 数据类型（text, number, date等）</li>
                <li style={{ marginLeft: '15px' }}><code>extractionHint</code>: AI提取数据的提示</li>
                <li style={{ marginLeft: '15px' }}><code>example</code>: 示例值供AI参考</li>
              </ul>
              <p>AI根据Skill文件中的参数定义，从用户输入或数据源中提取对应数据，填充到模板变量位置。</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

