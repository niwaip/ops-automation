import { Alert, App, Button, Card, Input, List, Space, Switch, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { imChannelApi, type XiaozhiChannelStatus } from '@/api';

const { Text, Paragraph } = Typography;

const STATUS_TEXT: Record<string, string> = {
  unconfigured: '未配置', disabled: '已停用', connecting: '连接中', online: 'MCP 已连接',
  reauth_required: '凭据失效', error: '连接错误',
};

export default function XiaozhiChannelCard() {
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [endpoint, setEndpoint] = useState('');
  const [alias, setAlias] = useState('');
  const status = useQuery('xiaozhi-channel', imChannelApi.getXiaozhi, { refetchInterval: 5000 });
  const tasks = useQuery('xiaozhi-tasks', imChannelApi.getXiaozhiTasks, { refetchInterval: 5000 });
  const refresh = (data?: XiaozhiChannelStatus) => { if (data) cache.setQueryData('xiaozhi-channel', data); void tasks.refetch(); };
  const save = useMutation(() => imChannelApi.saveXiaozhi(endpoint, alias), {
    onSuccess: (data) => { setEndpoint(''); refresh(data); message.success('接入点已加密保存'); },
    onError: () => { message.error('保存失败，请检查接入点格式或绑定状态'); },
  });
  const enabled = useMutation((value: boolean) => imChannelApi.setXiaozhiEnabled(value), {
    onSuccess: (data) => { refresh(data); message.success(data.enabled ? '连接已启用' : '连接已停用'); },
    onError: () => { message.error('更新连接状态失败'); },
  });
  const test = useMutation(imChannelApi.testXiaozhi, {
    onSuccess: (data) => { message.info(`接入点：${data.endpointValid ? '有效' : '无效'}；MCP 工具：${data.toolDiscovery ? '可发现' : '未连接'}；内部服务：${data.internalTaskService ? '已配置' : '未配置'}`); },
    onError: () => { message.error('连接诊断失败'); },
  });
  const remove = useMutation(imChannelApi.removeXiaozhi, {
    onSuccess: () => { void status.refetch(); void tasks.refetch(); message.success('小智接入点已解除绑定'); },
    onError: () => { message.error('解除绑定失败'); },
  });
  const channel = status.data;

  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Alert type="info" showIcon message="小智语音 / AI Passport" description="设备通过小智云端识别和播报。这里的在线状态表示 ops 与小智 MCP 的连接状态，不表示设备在线。长任务会先受理，之后可以询问“刚才任务的结果是什么”。" />
    <Card title="连接设置" extra={<Space><Tag color={channel?.status === 'online' ? 'success' : 'default'}>{STATUS_TEXT[channel?.status || 'unconfigured']}</Tag><Switch checked={channel?.enabled} disabled={!channel?.configured} loading={enabled.isLoading} onChange={(value) => enabled.mutate(value)} /></Space>}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text>智能体别名</Text><Input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder={channel?.alias || '例如：办公室小智'} maxLength={100} />
        <Text>MCP 接入点 {channel?.configured && <Tag color="green">已配置</Tag>}</Text>
        <Input.Password value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="wss://api.xiaozhi.me/mcp/...?token=..." autoComplete="off" />
        <Space wrap><Button type="primary" disabled={!endpoint || channel?.enabled} loading={save.isLoading} onClick={() => save.mutate()}>保存接入点</Button><Button loading={test.isLoading} disabled={!channel?.configured} onClick={() => test.mutate()}>测试连接</Button><Button danger disabled={!channel?.configured} onClick={() => modal.confirm({ title: '解除小智绑定？', content: '接入点凭据将删除，历史任务按审计记录保留。', onOk: async () => { await remove.mutateAsync(); } })}>解除绑定</Button></Space>
        {channel?.lastError && <Text type="danger">{channel.lastError}</Text>}
        {channel?.lastConnectedAt && <Text type="secondary">上次连接：{new Date(channel.lastConnectedAt).toLocaleString()}</Text>}
      </Space>
    </Card>
    <Card title="已开放能力"><Paragraph>ops_submit_task：提交任务并获得受理号。ops_get_task_status：查询当前连接最近任务或指定任务的真实状态。审批与补充信息请在网页处理。</Paragraph></Card>
    <Card title="最近任务" loading={tasks.isLoading}><List dataSource={tasks.data || []} locale={{ emptyText: '暂无语音任务' }} renderItem={(task) => <List.Item actions={task.detail_path ? [<a key="detail" href={task.detail_path}>执行详情</a>] : []}><List.Item.Meta title={<Space><Text>{task.instruction}</Text><Tag>{task.status}</Tag></Space>} description={<><Text type="secondary">{new Date(task.createdAt).toLocaleString()} · {task.request_id}</Text><br />{task.speech}</>} /></List.Item>} /></Card>
  </Space>;
}
