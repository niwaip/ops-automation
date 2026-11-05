import { useRef, useState } from 'react';
import { Alert, Button, Collapse, Input, Modal, Space, Typography, message } from 'antd';

export type McpSummaryApi = {
  post<T = any>(path: string, data?: any, config?: { timeout?: number }): Promise<T>;
  put<T = any>(path: string, data: any): Promise<T>;
  delete<T = any>(path: string): Promise<T>;
};
type Draft = { description: string; revisionId: string; toolsetDigest: string; toolCount: number; model: string;
  coverage: { capability: string; tools: string[]; keywords: string[] }[] };

/** Generation is a draft. Only the explicit save action changes the Skill description. */
export default function McpSummaryEditor({ api, connectionId, name, onSaved }: {
  api: McpSummaryApi; connectionId: string; name: string; onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const request = useRef(0);
  const generate = async () => {
    const current = ++request.current;
    setOpen(true); setBusy('generate'); setError('');
    try {
      const value = await api.post<Draft>(`/mcp-integrations/connections/${connectionId}/summary/generate`, undefined, { timeout: 45000 });
      if (current === request.current) { setDraft(value); setText(value.description); }
    } catch (e: any) {
      if (current === request.current) setError(e?.response?.data?.message || e?.message || 'AI 生成失败，现有摘要未改变');
    } finally { if (current === request.current) setBusy(null); }
  };
  const close = () => { request.current++; setOpen(false); setBusy(null); setDraft(null); setText(''); setError(''); };
  const save = async (description: string) => {
    if (!draft) return;
    setBusy('save'); setError('');
    try {
      await api.put(`/mcp-integrations/connections/${connectionId}/summary`, {
        description, revisionId: draft.revisionId, toolsetDigest: draft.toolsetDigest,
      });
      close(); message.success(description ? '能力摘要已保存，后续路由将使用新描述' : '已恢复自动摘要');
      await onSaved();
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || '保存失败'); setBusy(null); }
  };
  const restoreAutomatic = async () => {
    setBusy('save'); setError('');
    try {
      await api.delete(`/mcp-integrations/connections/${connectionId}/summary`);
      close(); message.success('已恢复自动摘要'); await onSaved();
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || '恢复失败'); setBusy(null); }
  };
  return <>
    <Button size="small" loading={busy === 'generate'} onClick={() => void generate()}>AI 生成能力摘要</Button>
    <Modal title={`AI 生成能力摘要：${name}`} open={open} onCancel={busy === 'save' ? undefined : close} width={720}
      footer={<Space wrap>
        <Button disabled={!!busy} onClick={close}>取消</Button>
        <Button disabled={!!busy} onClick={() => void restoreAutomatic()}>恢复自动摘要</Button>
        <Button loading={busy === 'generate'} disabled={busy === 'save'} onClick={() => void generate()}>重新生成</Button>
        <Button type="primary" loading={busy === 'save'} disabled={!!busy || !draft || !text.trim() || Array.from(text.trim()).length > 160} onClick={() => void save(text)}>保存摘要</Button>
      </Space>}>
      <Alert type="info" showIcon message="基于当前已发布工具生成，可编辑后保存"
        description="摘要用于 Skills 路由和模型目录，控制在 160 字符以内。生成时不调用 MCP 工具，不读取本人凭证；保存摘要不会使连接授权失效。" />
      {error && <Alert type="error" style={{ marginTop: 12 }} message={error} />}
      <Input.TextArea aria-label="MCP 能力摘要" value={text} onChange={e => setText(e.target.value)} disabled={!!busy}
        rows={4} maxLength={160} showCount style={{ marginTop: 16, marginBottom: 16 }} placeholder={busy === 'generate' ? '正在归纳全部已发布工具的能力…' : '可修改生成结果后保存'} />
      {draft && <>
        <Typography.Paragraph type="secondary">已覆盖 {draft.toolCount} 个工具 · 模型：{draft.model}。工具或可见权限变化后，旧摘要会自动回退。</Typography.Paragraph>
        <Collapse items={[{ key: 'coverage', label: '查看生成时的工具覆盖依据', children: draft.coverage.map((item, index) =>
          <Typography.Paragraph key={index}><strong>{item.capability}</strong><br />{item.tools.join('、')}
            {item.keywords?.length > 0 && <><br />可核对原词：{item.keywords.join('、')}</>}</Typography.Paragraph>) }]} />
      </>}
    </Modal>
  </>;
}
