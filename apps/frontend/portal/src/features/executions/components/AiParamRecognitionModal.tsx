import React, { useState } from 'react';
import { Input, Modal, Space, Typography, Upload, UploadProps } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { aiApi } from '@/api/ai';
import { SkillConfigDTO } from '@/api/skill';

const { Text } = Typography;

export interface AiParamRecognitionModalProps {
  open: boolean;
  onClose: () => void;
  selectedSkill?: SkillConfigDTO;
  selectedSkillDisplayName: string;
  onGeneratedParams: (params: Record<string, unknown>) => void;
  message: {
    success: (content: string) => void;
    error: (content: string) => void;
    warning: (content: string) => void;
  };
}

export const AiParamRecognitionModal: React.FC<AiParamRecognitionModalProps> = ({
  open,
  onClose,
  selectedSkill,
  selectedSkillDisplayName,
  onGeneratedParams,
  message,
}) => {
  const [aiTextInput, setAiTextInput] = useState('');
  const [uploadedText, setUploadedText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  const handleClose = () => {
    setAiTextInput('');
    setUploadedText('');
    setUploadedFileName('');
    setAiGenerating(false);
    onClose();
  };

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isText =
        file.type.startsWith('text/') ||
        file.type === 'application/json' ||
        /\.txt$|\.md$|\.csv$|\.json$/i.test(file.name);
      if (!isText) {
        message.error('目前仅支持文本文件（.txt/.md/.csv/.json）用于参数识别');
        return Upload.LIST_IGNORE;
      }
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const content = String(reader.result || '');
          setUploadedText(content);
          setUploadedFileName(file.name);
          message.success(`已读取文本文件：${file.name}`);
        };
        reader.onerror = () => {
          message.error('读取文件失败');
        };
        reader.readAsText(file);
      } catch {
        message.error('读取文件失败');
        return Upload.LIST_IGNORE;
      }
      return Upload.LIST_IGNORE;
    },
    multiple: false,
    maxCount: 1,
    showUploadList: false,
  };

  const handleAiGenerate = async () => {
    if (!selectedSkill) {
      message.error('请先选择技能');
      return;
    }
    const userInput = (aiTextInput || uploadedText || '').trim();
    if (!userInput) {
      message.warning('请输入文字或上传文本文件');
      return;
    }
    setAiGenerating(true);
    try {
      const templateId = selectedSkill.carboneTemplateId || selectedSkill.templateId || '';
      const paramsSchema = selectedSkill.paramsSchema;
      const result = await aiApi.recognizeParams({
        template_id: templateId || 'unknown',
        user_input: uploadedFileName ? `【文件：${uploadedFileName}】\n${userInput}` : userInput,
        params_schema: paramsSchema,
        context: {
          skillId: selectedSkill.id,
          skillName: selectedSkillDisplayName,
          skillDescription: selectedSkill.description,
          triggerKeywords: selectedSkill.triggerKeywords,
          tools: selectedSkill.tools,
        },
      });
      onGeneratedParams(result.params || {});
      handleClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '参数识别失败');
    } finally {
      setAiGenerating(false);
    }
  };

  return (
    <Modal
      title="智能识别参数"
      open={open}
      onCancel={handleClose}
      onOk={() => void handleAiGenerate()}
      okText={aiGenerating ? '正在识别...' : '识别并填充'}
      confirmLoading={aiGenerating}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Input.TextArea
          rows={4}
          placeholder="请输入你的需求描述，系统将基于技能参数 schema 自动识别并填充"
          value={aiTextInput}
          onChange={(e) => setAiTextInput(e.target.value)}
        />
        <Space direction="vertical" style={{ width: '100%' }}>
          <Upload.Dragger {...uploadProps} style={{ padding: 8 }}>
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">拖拽或点击上传文本文件（.txt/.md/.csv/.json）</p>
            <p className="ant-upload-hint">
              将读取文件文本用于参数识别；暂不支持直接解析PDF/Word。
            </p>
          </Upload.Dragger>
          {uploadedFileName ? <Text type="secondary">已选择文件：{uploadedFileName}</Text> : null}
        </Space>
      </Space>
    </Modal>
  );
};
