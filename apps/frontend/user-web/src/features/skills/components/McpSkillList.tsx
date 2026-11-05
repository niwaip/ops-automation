import { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Space, Tag, Typography, message } from 'antd';
import McpSkillDetailsModal, { type McpSkillSelection } from '@chat-web/components/McpSkillDetailsModal';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api';

/** Uses the same user-scoped metadata projection as the sandbox Skill catalog. */
export function McpSkillList() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<any[]>([]);
  const [selection, setSelection] = useState<McpSkillSelection | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = async () => {
    setLoading(true);
    try {
      const [personal, work] = await Promise.all([
        apiClient.get<any[]>('/mcp-integrations/skills?mode=personal'),
        apiClient.get<any[]>('/mcp-integrations/skills?mode=work'),
      ]);
      setSkills([...personal, ...work]);
    } catch { message.error('加载外部 Skills 失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Alert type="info" showIcon message="已启用并选择工具的 MCP 连接自动公开为本人可用 Skill"
      description="聊天只加载名称与用途摘要；读取 Skill 才展示工具索引，选定工具后再加载参数。工作 Skill 仅在所属组织和允许角色内可见。" />
    <Space><Button loading={loading} onClick={() => void reload()}>刷新</Button><Button onClick={() => navigate('/settings?tab=mcp')}>管理外部连接</Button></Space>
    {!skills.length && !loading && <Empty description="暂无已公开的 MCP Skills，请先启用连接并选择工具" />}
    {skills.map(skill => <Card key={skill.id} title={<Space>{skill.name}<Tag>{skill.scope === 'personal' ? '个人' : '工作'}</Tag></Space>}>
      <Typography.Paragraph>{skill.description}</Typography.Paragraph>
      <Space><Tag color={skill.configured ? 'green' : 'orange'}>{skill.configured ? '可调用' : '需本人授权'}</Tag>
        <Button onClick={() => setSelection(skill)}>能力与执行说明</Button>
      </Space>
    </Card>)}
    <McpSkillDetailsModal api={apiClient} selection={selection} onClose={() => setSelection(null)} />
  </Space>;
}
