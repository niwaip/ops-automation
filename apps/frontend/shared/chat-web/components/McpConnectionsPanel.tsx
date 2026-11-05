import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import McpSkillDetailsModal, { type McpSkillSelection } from './McpSkillDetailsModal';
import McpSummaryEditor from './McpSummaryEditor';

interface Api { get<T = any>(path: string): Promise<T>; post<T = any>(path: string, data?: any): Promise<T>; put<T = any>(path: string, data: any): Promise<T>; delete<T = any>(path: string): Promise<T> }
type Connection = { id: string; name: string; scope: string; status: string; configured: boolean; canManage: boolean; config: any };
const base = '/mcp-integrations';
const errorMessage = (e: any) => e?.response?.data?.message || e?.message || '操作失败';

export default function McpConnectionsPanel({ api, administrator = false }: { api: Api; administrator?: boolean }) {
  const [rows, setRows] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const authType = Form.useWatch('authType', form);
  const authLocation = Form.useWatch('authLocation', form);
  const [editing, setEditing] = useState<Connection | 'new' | null>(null);
  const [credential, setCredential] = useState<Connection | null>(null);
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [tools, setTools] = useState<any[]>([]);
  const [discovery, setDiscovery] = useState<Connection | null>(null);
  const [selected, setSelected] = useState<Record<string, { effect: string; allowedRoles: string[] }>>({});
  const [available, setAvailable] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [run, setRun] = useState<any>(null);
  const [argumentsText, setArgumentsText] = useState('{}');
  const [result, setResult] = useState<any>(null);
  const [skills, setSkills] = useState<any[]>([]);
  const [skillDetails, setSkillDetails] = useState<McpSkillSelection | null>(null);

  const reload = async () => {
    setBusy(true);
    try {
      const [connections, personal, work, confirmations, personalSkills, workSkills] = await Promise.all([
        api.get<Connection[]>(`${base}/connections`), api.get<any[]>(`${base}/tools?mode=personal&view=index`),
        api.get<any[]>(`${base}/tools?mode=work&view=index`), api.get<any[]>(`${base}/invocations`),
        api.get<any[]>(`${base}/skills?mode=personal`), api.get<any[]>(`${base}/skills?mode=work`),
      ]);
      setRows(connections); setAvailable([...personal, ...work]); setPending(confirmations); setSkills([...personalSkills, ...workSkills]);
    } catch (e) { message.error(errorMessage(e)); } finally { setBusy(false); }
  };
  useEffect(() => { void reload(); }, [api]);
  const action = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { const value = await fn(); await reload(); return value; }
    catch (e) { message.error(errorMessage(e)); return undefined; }
    finally { setBusy(false); }
  };
  const openEditor = (row: Connection | 'new') => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue(row === 'new' ? { transport: 'streamable_http', authType: 'bearer', authLocation: 'header', queryParameter: 'key', headerName: 'X-API-Key', timeoutMs: 15000 } : { transport: 'streamable_http', authLocation: 'header', queryParameter: 'key', name: row.name, ...row.config, privateHosts: row.config.privateHosts?.join(',') });
  };
  const discover = async (row: Connection) => {
    const value = await action(() => api.post<any>(`${base}/connections/${row.id}/discover`));
    if (value) { setTools(value.tools); setSelected({}); setDiscovery(row); }
  };
  const showResult = (value: any) => { if (value) setResult(value); };
  const prepareRun = async (tool: any) => {
    const connection = rows.find(row => row.id === tool.connectionId);
    if (!connection) return;
    setBusy(true);
    try {
      const detail = await api.get<any>(`${base}/skills/mcp-${connection.id}/tools/${encodeURIComponent(tool.remoteName)}?mode=${connection.scope === 'personal' ? 'personal' : 'work'}`);
      setRun({ ...tool, inputSchema: detail.inputSchema }); setArgumentsText('{}');
    } catch (e) { message.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Alert type="info" showIcon message={administrator ? '工作连接由管理员配置，调用使用各用户自己的账号' : '个人连接由您管理；工作连接由管理员发布，您只需连接自己的账号'}
      description="传输方式仅支持 Streamable HTTP；stdio（本地进程）与旧版 HTTP+SSE 尚未支持。认证支持无需认证、Bearer Token 和 API Key（请求头或查询参数）。连接测试不代表数据库权限已核验。写入和未知操作需要核对具体参数后确认。" />
    <Space><Button type="primary" onClick={() => openEditor('new')}>{administrator ? '新增工作连接' : '新增个人连接'}</Button><Button loading={busy} onClick={() => void reload()}>刷新</Button></Space>
    <Table<Connection> rowKey="id" loading={busy} dataSource={rows.filter(r => !administrator || r.scope === 'organization')} pagination={false} columns={[
      { title: '连接', dataIndex: 'name' },
      { title: '能力摘要', width: 300, render: (_, r) => <Typography.Paragraph style={{ marginBottom: 0 }} ellipsis={{ rows: 2, expandable: true }}>
        {skills.find(s => s.connectionId === r.id)?.description || (r.status === 'active' ? '尚未发布本人可见的工具' : '连接已停用')}
      </Typography.Paragraph> },
      { title: '传输方式', render: () => <Tag>Streamable HTTP</Tag> },
      { title: '范围', render: (_, r) => <Tag>{r.scope === 'personal' ? '个人' : '工作'}</Tag> },
      { title: '状态', render: (_, r) => <Space><Tag>{r.status === 'active' ? '启用' : '停用'}</Tag><Tag color={r.configured ? 'green' : 'orange'}>{r.config.authType === 'none' ? '公开 · 无需凭证' : r.configured ? '本人凭证已设置' : '需要本人授权'}</Tag></Space> },
      { title: '操作', render: (_, r) => <Space wrap>
        <Button size="small" disabled={!skills.some(s => s.connectionId === r.id)} onClick={() => setSkillDetails({ id: `mcp-${r.id}`, name: r.name, scope: r.scope })}>能力与执行说明</Button>
        {r.canManage && skills.some(s => s.connectionId === r.id) && <McpSummaryEditor api={api} connectionId={r.id} name={r.name} onSaved={reload} />}
        {r.config.authType !== 'none' && <><Button size="small" onClick={() => { setToken(''); setExpiresAt(''); setCredential(r); }}>连接我的账号</Button>
        <Button size="small" disabled={!r.configured} onClick={() => void action(() => api.delete(`${base}/connections/${r.id}/authorization`))}>撤销授权</Button></>}
        {r.canManage && <><Button size="small" onClick={() => openEditor(r)}>配置</Button><Button size="small" disabled={!r.configured || r.status !== 'active'} onClick={() => void discover(r)}>发现并选择工具</Button>
          <Button size="small" onClick={() => void action(() => api.post(`${base}/connections/${r.id}/status`, { disabled: r.status === 'active' }))}>{r.status === 'active' ? '停用' : '启用'}</Button></>}
      </Space> },
    ]} />
    <Card title="已选择的工具">
      <Table rowKey="id" dataSource={available.filter(t => rows.some(r => r.id === t.connectionId && (!administrator || r.scope === 'organization')))} pagination={{ pageSize: 8 }} columns={[
        { title: '工具', dataIndex: 'remoteName' },
        { title: '工具描述', render: (_, t) => <Typography.Paragraph style={{ maxWidth: 420, marginBottom: 0 }} ellipsis={{ rows: 2, expandable: true }}>{t.description}</Typography.Paragraph> },
        { title: '操作类型', dataIndex: 'effect' },
        { title: '操作', render: (_, t) => <Button disabled={!t.configured} loading={busy} onClick={() => void prepareRun(t)}>调用</Button> },
      ]} />
    </Card>
    {pending.length > 0 && <Card title="待确认的外部操作">
      {pending.map(p => <div key={p.invocationId} style={{ marginBottom: 12 }}>
        <Typography.Paragraph strong>{p.connectionName} / {p.toolName}</Typography.Paragraph>
        <Typography.Text code>{p.invocationId}</Typography.Text>
        <pre style={{ maxHeight: 180, overflow: 'auto' }}>{JSON.stringify(p.result?.arguments, null, 2)}</pre>
        <Button danger onClick={() => Modal.confirm({ title: '确认执行这组参数对应的外部写入？', content: '仅执行上述已保存的参数。结果未知时请先核查远端，不要重复提交。',
          onOk: async () => showResult(await action(() => api.post(`${base}/invocations/${p.invocationId}/confirm`))) })}>确认执行</Button>
      </div>)}
    </Card>}

    <Modal title={editing === 'new' ? '新增外部连接' : '修改连接（将使旧授权失效）'} open={!!editing} onCancel={() => setEditing(null)} confirmLoading={busy} onOk={async () => {
      const values = await form.validateFields();
      const data = { ...values, authLocation: values.authType === 'api_key' ? values.authLocation || 'header' : 'header', scope: administrator ? 'organization' : 'personal', privateHosts: String(values.privateHosts || '').split(',').map(s => s.trim()).filter(Boolean) };
      const value = await action(() => editing === 'new' ? api.post(`${base}/connections`, data) : api.put(`${base}/connections/${(editing as Connection).id}`, data));
      if (value) setEditing(null);
    }}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
        <Form.Item name="transport" label="传输方式" extra="当前仅支持远程 Streamable HTTP；其他方式尚未实现。"><Select options={[{ value: 'streamable_http', label: 'Streamable HTTP' }, { value: 'sse', label: 'HTTP + SSE（旧版，尚未支持）', disabled: true }, { value: 'stdio', label: 'stdio（本地进程，尚未支持）', disabled: true }]} /></Form.Item>
        <Form.Item name="endpoint" label="MCP 服务地址" extra="只填写服务地址，不包含 ?key=…。API Key 请在保存后通过「连接我的账号」设置。" rules={[{ required: true }, { type: 'url' }, { validator: async (_, value) => {
          if (!value) return;
          let url: URL; try { url = new URL(value); } catch { return; }
          if (url.search || url.hash || url.username || url.password) throw new Error('请移除地址中的凭证、查询参数或片段；API Key 可选择查询参数方式');
        } }]}><Input placeholder="https://mcp.example.com/mcp" /></Form.Item>
        <Form.Item name="authType" label="认证方式"><Select options={[{ value: 'none', label: '无需认证（公开服务）' }, { value: 'bearer', label: 'Bearer Token' }, { value: 'api_key', label: 'API Key' }]} /></Form.Item>
        {authType === 'api_key' && <>
          <Form.Item name="authLocation" label="API Key 位置"><Select options={[{ value: 'header', label: '请求头' }, { value: 'query', label: '查询参数' }]} /></Form.Item>
          {authLocation === 'query'
            ? <Form.Item name="queryParameter" label="API Key 参数名" extra="按服务要求填写参数名（例如 key），密钥由各用户单独保存。" rules={[{ required: true }, { pattern: /^[A-Za-z][A-Za-z0-9_-]{0,63}$/, message: '字母开头，最多 64 位字母、数字、下划线或连字符' }]}><Input placeholder="key" maxLength={64} /></Form.Item>
            : <Form.Item name="headerName" label="API Key 请求头"><Select options={[{ value: 'X-API-Key', label: 'X-API-Key' }, { value: 'API-Key', label: 'API-Key' }]} /></Form.Item>}
        </>}
        {administrator && <Form.Item name="privateHosts" label="内网目标（需已在运维允许名单中）"><Input placeholder="精确主机名，逗号分隔" /></Form.Item>}
      </Form>
    </Modal>
    <Modal title={`连接我的账号：${credential?.name || ''}`} open={!!credential} onCancel={() => { setCredential(null); setToken(''); }} confirmLoading={busy} onOk={async () => {
      if (!token.trim()) { message.warning('请输入凭证'); return; }
      const value = await action(() => api.put(`${base}/connections/${credential!.id}/authorization`, { token, ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}) }));
      if (value) { setCredential(null); setToken(''); }
    }}>
      <Typography.Paragraph>凭证将发送至：{credential?.config?.endpoint}。仅保存到您自己的凭证库，不会交给模型。</Typography.Paragraph>
      {credential?.config?.authType === 'api_key' && <Typography.Paragraph>发送方式：{credential.config.authLocation === 'query' ? `查询参数 ${credential.config.queryParameter}` : `请求头 ${credential.config.headerName}`}。只填写 API Key 的值。</Typography.Paragraph>}
      <Input.Password value={token} onChange={e => setToken(e.target.value)} autoComplete="new-password" placeholder="服务为您签发的 Token / API Key" />
      <Typography.Paragraph style={{ marginTop: 12 }}>有效期（可选）</Typography.Paragraph>
      <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
    </Modal>
    <Modal title={`选择工具：${discovery?.name || ''}`} open={!!discovery} width={800} onCancel={() => setDiscovery(null)} confirmLoading={busy} onOk={async () => {
      const value = await action(() => api.post(`${base}/connections/${discovery!.id}/publish`, { tools: Object.entries(selected).map(([name, policy]) => ({ name, ...policy })) }));
      if (value) setDiscovery(null);
    }}>
      <Alert type="warning" message="工具描述由外部服务提供。请确认实际用途后分类；未知和写入操作均需要用户确认。" />
      {tools.map(t => <Card key={t.name} size="small" style={{ marginTop: 8 }}>
        <Checkbox checked={!!selected[t.name]} onChange={e => setSelected(prev => { const next = { ...prev }; if (e.target.checked) next[t.name] = { effect: 'unknown', allowedRoles: ['employee', 'manager', 'admin'] }; else delete next[t.name]; return next; })}>{t.name}</Checkbox>
        <Typography.Paragraph ellipsis={{ rows: 2, expandable: true }}>{t.description}</Typography.Paragraph>
        {selected[t.name] && <Space wrap>
          <Select value={selected[t.name].effect} style={{ width: 160 }} options={[{ value: 'unknown', label: '未知（需要确认）' }, { value: 'read', label: '只读' }, { value: 'write', label: '写入（需要确认）' }]}
            onChange={effect => setSelected(p => ({ ...p, [t.name]: { ...p[t.name], effect } }))} />
          {discovery?.scope === 'organization' && <Select mode="multiple" style={{ minWidth: 220 }} value={selected[t.name].allowedRoles} options={['employee', 'manager', 'admin'].map(value => ({ value, label: value }))}
            onChange={allowedRoles => setSelected(p => ({ ...p, [t.name]: { ...p[t.name], allowedRoles } }))} />}
        </Space>}
      </Card>)}
    </Modal>
    <Modal title={`调用工具：${run?.remoteName || ''}`} open={!!run} onCancel={() => setRun(null)} confirmLoading={busy} onOk={async () => {
      let args; try { args = JSON.parse(argumentsText); } catch { message.error('参数必须是 JSON'); return; }
      const c = rows.find(r => r.id === run.connectionId);
      const value = await action(() => api.post(`${base}/tools/${run.id}/invoke`, { arguments: args, requestKey: crypto.randomUUID(), mode: c?.scope === 'organization' ? 'work' : 'personal' }));
      if (value) { setRun(null); showResult(value); }
    }}>
      <pre style={{ maxHeight: 220, overflow: 'auto' }}>{JSON.stringify(run?.inputSchema, null, 2)}</pre>
      <Input.TextArea rows={8} value={argumentsText} onChange={e => setArgumentsText(e.target.value)} aria-label="工具 JSON 参数" />
    </Modal>
    <Modal title="调用结果" open={!!result} onCancel={() => setResult(null)} footer={<Button onClick={() => setResult(null)}>关闭</Button>} width={800}>
      <pre style={{ maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
    </Modal>
    <McpSkillDetailsModal api={api} selection={skillDetails} onClose={() => setSkillDetails(null)} />
  </Space>;
}
