import { useCallback, useState } from 'react';
import { App, Form, type FormInstance } from 'antd';
import type { SkillConfigDTO } from '@/api/skill';
import { aiApi } from '@/api/ai';
import type {
  ExecutionCreateFormValues,
  SchedulePattern,
  SchemaField,
} from '@/features/executions/create/lib/executionCreate';
import { getInitialInputValues } from '@/features/executions/create/lib/executionCreate';

interface UseExecutionCreateFormOptions {
  form: FormInstance<ExecutionCreateFormValues>;
  schemaFields: SchemaField[];
  selectedSkill?: SkillConfigDTO;
  selectedSkillDisplayName: string;
}

export function useExecutionCreateForm({
  form,
  schemaFields,
  selectedSkill,
  selectedSkillDisplayName,
}: UseExecutionCreateFormOptions) {
  const { message } = App.useApp();
  const selectedSkillId = Form.useWatch('skillId', form) as string | undefined;
  const executionMode =
    (Form.useWatch('executionMode', form) as ExecutionCreateFormValues['executionMode'] | undefined) ||
    'immediate';
  const schedulePattern =
    (Form.useWatch('schedulePattern', form) as SchedulePattern | undefined) || 'workdays';
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiTextInput, setAiTextInput] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [uploadedText, setUploadedText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');

  const handleCloseAiModal = useCallback(() => {
    setAiModalOpen(false);
    setAiTextInput('');
    setUploadedText('');
    setUploadedFileName('');
    setAiGenerating(false);
  }, []);

  const applyGeneratedParamsToForm = useCallback(
    (params: Record<string, unknown>) => {
      const currentValues =
        (form.getFieldValue('input') as Record<string, unknown> | undefined) || {};
      const nextValues: Record<string, unknown> = { ...currentValues };

      schemaFields.forEach((field) => {
        if (params[field.name] === undefined) {
          return;
        }

        const value = params[field.name];
        const normalizedType = field.type.toLowerCase();
        nextValues[field.name] =
          (normalizedType === 'object' || normalizedType === 'json') && typeof value !== 'string'
            ? JSON.stringify(value, null, 2)
            : value;
      });

      form.setFieldValue('input', nextValues);
      void message.success('已根据 AI 生成结果自动填充参数');
    },
    [form, message, schemaFields]
  );

  const handleOpenAiModal = useCallback(() => {
    if (!selectedSkillId) {
      void message.warning('请先选择技能');
      return;
    }

    setAiModalOpen(true);
  }, [message, selectedSkillId]);

  const handleAiGenerate = useCallback(async () => {
    if (!selectedSkill) {
      void message.error('请先选择技能');
      return;
    }

    const userInput = (aiTextInput || uploadedText || '').trim();
    if (!userInput) {
      void message.warning('请输入文字或上传文本文件');
      return;
    }

    setAiGenerating(true);
    try {
      const templateId = selectedSkill.carboneTemplateId || selectedSkill.templateId || '';
      const result = await aiApi.recognizeParams({
        template_id: templateId || 'unknown',
        user_input: uploadedFileName ? `【文件：${uploadedFileName}】\n${userInput}` : userInput,
        params_schema: selectedSkill.paramsSchema,
        context: {
          skillId: selectedSkill.id,
          skillName: selectedSkillDisplayName,
          skillDescription: selectedSkill.description,
          triggerKeywords: selectedSkill.triggerKeywords,
          tools: selectedSkill.tools,
        },
      });
      applyGeneratedParamsToForm(result.params || {});
      handleCloseAiModal();
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '参数识别失败');
    } finally {
      setAiGenerating(false);
    }
  }, [
    aiTextInput,
    applyGeneratedParamsToForm,
    handleCloseAiModal,
    message,
    selectedSkill,
    selectedSkillDisplayName,
    uploadedFileName,
    uploadedText,
  ]);

  const handleResetForm = useCallback(() => {
    form.resetFields([
      'executionMode',
      'skillId',
      'input',
      'scheduleName',
      'scheduleDescription',
      'timezone',
      'schedulePattern',
      'scheduleHour',
      'scheduleMinute',
      'weeklyDays',
      'monthlyDay',
    ]);
  }, [form]);

  const handleResetInputDefaults = useCallback(() => {
    form.setFieldValue('input', getInitialInputValues(schemaFields));
  }, [form, schemaFields]);

  const handleSwitchToScheduleMode = useCallback(() => {
    form.setFieldValue('executionMode', 'schedule');
  }, [form]);

  const handleUploadedFileRead = useCallback((payload: { content: string; fileName: string }) => {
    setUploadedText(payload.content);
    setUploadedFileName(payload.fileName);
  }, []);

  return {
    aiGenerating,
    aiModalOpen,
    aiTextInput,
    executionMode,
    schedulePattern,
    selectedSkillId,
    uploadedFileName,
    handleAiGenerate,
    handleAiTextInputChange: setAiTextInput,
    handleCloseAiModal,
    handleOpenAiModal,
    handleResetForm,
    handleResetInputDefaults,
    handleSwitchToScheduleMode,
    handleUploadedFileRead,
  };
}
