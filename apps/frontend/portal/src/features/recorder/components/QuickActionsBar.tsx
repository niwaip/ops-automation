import React from 'react';
import { Button, Space } from 'antd';
import {
  ArrowDownOutlined,
  CameraOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  EyeOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';

export interface QuickActionsBarProps {
  isLoading: boolean;
  waitDuration: number;
  t: (key: string) => string;
  onQuickAction: (tool: string, params?: Record<string, unknown>) => void | Promise<void>;
}

export const QuickActionsBar: React.FC<QuickActionsBarProps> = ({
  isLoading,
  waitDuration,
  t,
  onQuickAction,
}) => {
  return (
    <div style={{ marginTop: 2 }}>
      {/* Direct execution commands - click to execute immediately */}
      <div style={{ marginBottom: 8 }}>
        <Space wrap size="small">
          <Button
            size="small"
            icon={<CameraOutlined />}
            onClick={() => {
              void onQuickAction('screenshot');
            }}
            loading={isLoading}
            title="截取当前页面图片"
          >
            {t('recorder:ai.quick.screenshot') || '截图'}
          </Button>

          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              void onQuickAction('snapshot');
            }}
            loading={isLoading}
            title="获取页面结构快照"
          >
            {t('recorder:ai.quick.snapshot') || '快照'}
          </Button>

          <Button
            size="small"
            icon={<FileSearchOutlined />}
            onClick={() => {
              void onQuickAction('read_page');
            }}
            loading={isLoading}
            title="读取页面内容"
          >
            {t('recorder:ai.quick.readPage') || '读取页面'}
          </Button>

          <Button
            size="small"
            icon={<CodeOutlined />}
            onClick={() => {
              void onQuickAction('get_text');
            }}
            loading={isLoading}
            title="获取页面所有文本"
          >
            {t('recorder:ai.quick.getText') || '获取文本'}
          </Button>

          <Button
            size="small"
            icon={<ArrowDownOutlined />}
            onClick={() => {
              void onQuickAction('scroll', { direction: 'down' });
            }}
            loading={isLoading}
            title="向下滚动页面"
          >
            {t('recorder:ai.quick.scrollDown') || '向下'}
          </Button>

          <Button
            size="small"
            icon={<CloudUploadOutlined />}
            onClick={() => {
              void onQuickAction('scroll', { direction: 'top' });
            }}
            loading={isLoading}
            title="滚动到顶部"
          >
            {t('recorder:ai.quick.scrollTop') || '顶部'}
          </Button>

          <Button
            size="small"
            icon={<ClockCircleOutlined />}
            onClick={() => {
              void onQuickAction('wait', { duration: waitDuration * 1000 });
            }}
            loading={isLoading}
            title={`等待 ${waitDuration} 秒`}
          >
            {t('recorder:ai.quick.wait') || '等待'} {waitDuration}s
          </Button>
        </Space>
      </div>
    </div>
  );
};
