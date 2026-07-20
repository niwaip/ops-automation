import React from 'react';
import { App, Input, Modal, Space, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ExecutionCreateAiModalProps {
  open: boolean;
  aiGenerating: boolean;
  aiTextInput: string;
  uploadedFileName?: string;
  onAiTextInputChange: (value: string) => void;
  onUploadedFileRead: (payload: { content: string; fileName: string }) => void;
  onCancel: () => void;
  onGenerate: () => void;
}

const ExecutionCreateAiModal: React.FC<ExecutionCreateAiModalProps> = ({
  open,
  aiGenerating,
  aiTextInput,
  uploadedFileName,
  onAiTextInputChange,
  onUploadedFileRead,
  onCancel,
  onGenerate,
}) => {
  const { message } = App.useApp();

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isText =
        file.type.startsWith('text/') ||
        file.type === 'application/json' ||
        /\.txt$|\.md$|\.csv$|\.json$/i.test(file.name);

      if (!isText) {
        void message.error('目前仅支持文本文件（.txt/.md/.csv/.json）用于参数识别');
        return Upload.LIST_IGNORE;
      }

      try {
        const reader = new FileReader();
        reader.onload = () => {
          const content = String(reader.result || '');
          onUploadedFileRead({ content, fileName: file.name });
          void message.success(`已读取文本文件：${file.name}`);
        };
        reader.onerror = () => {
          void message.error('读取文件失败');
        };
        reader.readAsText(file);
      } catch {
        void message.error('读取文件失败');
        return Upload.LIST_IGNORE;
      }

      return Upload.LIST_IGNORE;
    },
    multiple: false,
    maxCount: 1,
    showUploadList: false,
  };

  return (
    <Modal
      title="智能识别参数"
      open={open}
      onCancel={onCancel}
      onOk={onGenerate}
      okText={aiGenerating ? '正在识别...' : '识别并填充'}
      confirmLoading={aiGenerating}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Input.TextArea
          rows={4}
          placeholder="请输入你的需求描述，系统将基于技能参数 schema 自动识别并填充"
          value={aiTextInput}
          onChange={(event) => onAiTextInputChange(event.target.value)}
        />
        <Space direction="vertical" style={{ width: '100%' }}>
          <Upload.Dragger {...uploadProps} style={{ padding: 8 }}>
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">拖拽或点击上传文本文件（.txt/.md/.csv/.json）</p>
            <p className="ant-upload-hint">将读取文件文本用于参数识别；暂不支持直接解析PDF/Word。</p>
          </Upload.Dragger>
          {uploadedFileName ? <Text type="secondary">已选择文件：{uploadedFileName}</Text> : null}
        </Space>
      </Space>
    </Modal>
  );
};

export default ExecutionCreateAiModal;
