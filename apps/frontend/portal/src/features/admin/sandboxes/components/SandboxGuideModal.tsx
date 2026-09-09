import React from 'react';
import { Modal, Button, Alert, Descriptions, Typography, Space } from 'antd';
import { InfoCircleOutlined, BookOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

interface SandboxGuideModalProps {
  visible: boolean;
  onClose: () => void;
}

export const SandboxGuideModal: React.FC<SandboxGuideModalProps> = ({
  visible,
  onClose,
}) => {
  return (
    <Modal
      title={
        <Space size={8}>
          <BookOutlined style={{ color: '#1677ff' }} />
          <Text strong>Docker 个人沙箱运维与底座架构指南</Text>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="ok" type="primary" onClick={onClose}>
          已知悉
        </Button>,
      ]}
      width={760}
    >
      <Alert
        message="核心架构设计：不可变底座 + 个人数据持久化 + 零信任凭据拦截"
        description="普通用户在沙箱内部仅享有只读系统镜像与个人专属工作区读写权限，无法擅自更改系统底层环境，亦无法嗅探生产大模型真实 API Key。"
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 16, borderRadius: 8 }}
      />

      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="1. 镜像与 Harness 版本无损更新">
          <Paragraph style={{ margin: 0, fontSize: 13 }}>
            修改 <code>docker/user-sandbox/Dockerfile</code> 或升级 <code>dsh</code> 脚本后，在仓库根目录执行标准构建命令：
            <pre
              style={{
                background: 'rgba(0, 0, 0, 0.05)',
                padding: '8px 12px',
                borderRadius: 6,
                marginTop: 6,
                marginBottom: 6,
                fontFamily: 'monospace',
                fontSize: 12,
              }}
            >
              docker build -t ops-user-sandbox:local -f docker/user-sandbox/Dockerfile .
            </pre>
            构建完成后，在沙箱列表点击对应用户的 <b>“更新”</b> 按钮，即可平滑切换至最新底层环境，用户目录下的代码与知识库文件<b>100% 完整保留</b>。
          </Paragraph>
        </Descriptions.Item>

        <Descriptions.Item label="2. 集中式插件体系（热插拔实时生效）">
          <Paragraph style={{ margin: 0, fontSize: 13 }}>
            宿主机统一插件目录位于 <code>data/shared/dsh-plugins/</code>。
            管理员只需将 Python 工具脚本放置于该目录，所有沙箱内部挂载的 <code>/opt/dsh/plugins/</code> <b>立即可见并生效，无需重启任何沙箱容器</b>。
          </Paragraph>
        </Descriptions.Item>

        <Descriptions.Item label="3. 零信任 API 凭据代理防护">
          <Paragraph style={{ margin: 0, fontSize: 13 }}>
            大模型 Key 统一在后台【模型管理】集中安全保管。
            注入用户沙箱容器的仅为 <code>sandbox-user-token-${'{userId}'}</code> 虚拟凭据，所有请求均通过平台内网 AI Proxy 自动进行白名单过滤与安全置换，<b>真实 Key 绝对不落地进容器内部</b>。
          </Paragraph>
        </Descriptions.Item>

        <Descriptions.Item label="4. 弹性休眠与秒级唤醒机制">
          <Paragraph style={{ margin: 0, fontSize: 13 }}>
            沙箱处于空闲静默状态时，CPU 占用为 0%，内存仅数兆。连续无交互超过 <b>30 分钟</b>将触发自动休眠，释放宿主机全部算力；下一次交互将在 <b>1 秒内自动唤醒</b>。
          </Paragraph>
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  );
};
