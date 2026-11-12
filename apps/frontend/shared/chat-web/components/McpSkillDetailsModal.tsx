import { useEffect, useState } from 'react';
import { Alert, Button, Card, Collapse, Empty, Modal, Space, Spin, Tag, Typography } from 'antd';
import McpSummaryEditor, { type McpSummaryApi } from './McpSummaryEditor';

type Api = McpSummaryApi & { get<T = any>(path: string): Promise<T> };
export type McpSkillSelection = { id: string; name: string; scope: string };
type Tool = { id: string; name: string; description: string; effect: string };
type Detail = { skill: McpSkillSelection & { description: string; descriptionSource: string; canManageSummary: boolean; summaryStale: boolean }; catalogEntry: string; instructions: string; tools: Tool[] };
type ToolDetail = Tool & { inputSchema: unknown; outputSchema?: unknown };
const pathFor = (skill: McpSkillSelection) => `/mcp-integrations/skills/${encodeURIComponent(skill.id)}`;
const modeFor = (skill: McpSkillSelection) => skill.scope === 'personal' ? 'personal' : 'work';
const effectLabel = (effect: string) => ({ read: '只读', write: '写入', unknown: '未知' }[effect] || effect);

/** Mounted only when one tool is expanded; opening the overview never reads schemas. */
function ToolContract({ api, skill, tool }: { api: Api; skill: McpSkillSelection; tool: Tool }) {
  const [detail, setDetail] = useState<ToolDetail | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setDetail(null); setError(false);
    api.get<ToolDetail>(`${pathFor(skill)}/tools/${encodeURIComponent(tool.name)}?mode=${modeFor(skill)}`)
      .then(value => { if (active) setDetail(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [api, skill.id, skill.scope, tool.name, attempt]);
  if (error) return <Alert type="error" message="工具已变更或暂无访问权限" action={<Button onClick={() => setAttempt(n => n + 1)}>重试</Button>} />;
  if (!detail) return <Spin />;
  return <>
    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{detail.description}</Typography.Paragraph>
    <Typography.Text strong>输入参数契约</Typography.Text>
    <pre style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail.inputSchema, null, 2)}</pre>
    {detail.outputSchema != null && <><Typography.Text strong>输出契约</Typography.Text>
      <pre style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail.outputSchema, null, 2)}</pre></>}
  </>;
}

function SkillContent({ api, selection }: { api: Api; selection: McpSkillSelection }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api.get<Detail>(`${pathFor(selection)}?mode=${modeFor(selection)}`)
      .then(value => { if (active) setDetail(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [api, selection.id, selection.scope, attempt]);
  if (error) return <Alert type="error" message="此连接尚未发布工具、已停用或无访问权限" action={<Button onClick={() => { setError(false); setAttempt(n => n + 1); }}>重试</Button>} />;
  if (!detail) return <Spin />;
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Alert type="info" showIcon message="按三层公开：能力摘要 → 工具索引与执行说明 → 单个工具契约"
      description="预览不调用外部工具。执行说明由平台提供；工具描述来自外部服务，作为数据使用。" />
    <Card size="small" title={detail.skill.descriptionSource === 'curated' ? '能力摘要（已保存）' : '能力摘要（自动拼接）'}
      extra={detail.skill.canManageSummary && <McpSummaryEditor api={api} connectionId={selection.id.replace(/^mcp-/, '')} name={selection.name} onSaved={() => setAttempt(n => n + 1)} />}>
      <Typography.Paragraph>{detail.skill.description}</Typography.Paragraph>
      <Typography.Text type="secondary">{detail.skill.descriptionSource === 'curated' ? '该摘要用于当前可见工具的路由和目录；参数契约仍按需加载。' :
        detail.skill.summaryStale ? '工具或可见权限已变化，已回退自动摘要；可重新生成并保存。' : '默认摘要最多覆盖前 8 个工具；可使用 AI 生成精炼的完整能力总述。'}</Typography.Text>
    </Card>
    <Collapse items={[
      { key: 'catalog', label: '第一层：模型目录提示词预览（用途最多 160 字符）', children: <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{detail.catalogEntry}</pre> },
      { key: 'instructions', label: '第二层：平台执行说明（读取 Skill 时加载）', children: <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{detail.instructions}</Typography.Paragraph> },
    ]} />
    <Typography.Text strong>已发布工具（{detail.tools.length}）</Typography.Text>
    {!detail.tools.length && <Empty description="暂无可用工具" />}
    {detail.tools.map(tool => <Card key={tool.id} size="small" title={<Space wrap>{tool.name}<Tag>{effectLabel(tool.effect)}</Tag></Space>}>
      <Typography.Paragraph>{tool.description}</Typography.Paragraph>
      <Button size="small" aria-expanded={expanded === tool.id} onClick={() => setExpanded(expanded === tool.id ? null : tool.id)}>
        {expanded === tool.id ? '收起工具详情与参数' : '展开工具详情与参数'}
      </Button>
      {expanded === tool.id && <div style={{ marginTop: 12 }}><ToolContract api={api} skill={selection} tool={tool} /></div>}
    </Card>)}
  </Space>;
}

export default function McpSkillDetailsModal({ api, selection, onClose }: { api: Api; selection: McpSkillSelection | null; onClose: () => void }) {
  return <Modal title={`能力与执行说明：${selection?.name || 'MCP Skill'}`} open={!!selection} onCancel={onClose}
    width={900} footer={<Button onClick={onClose}>关闭</Button>}>
    {selection && <SkillContent key={`${selection.id}:${selection.scope}`} api={api} selection={selection} />}
  </Modal>;
}
