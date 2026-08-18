import { FolderAddOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { Alert, App, Button, Descriptions, Drawer, Form, Input, Space, Tooltip, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { savedSkillApi } from '@/api/savedSkills';

interface SaveWorkflowActionProps {
  executionId: string;
}

type SaveWorkflowFormValues = {
  name: string;
  description?: string;
};

export function SaveWorkflowAction({ executionId }: SaveWorkflowActionProps) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<SaveWorkflowFormValues>();
  const eligibilityQuery = useQuery(
    ['workflow-save-eligibility', executionId],
    () => savedSkillApi.getSaveEligibility(executionId),
    {
      enabled: Boolean(executionId),
      retry: false,
      staleTime: 30_000,
    }
  );
  const eligibility = eligibilityQuery.data;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: eligibility?.suggestedName || '我的工作流',
      description: undefined,
    });
  }, [eligibility?.suggestedName, form, open]);

  const saveMutation = useMutation(
    (values: SaveWorkflowFormValues) =>
      savedSkillApi.saveFromExecution(executionId, {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
      }),
    {
      onSuccess: async (savedSkill) => {
        setOpen(false);
        void message.success('工作流已保存，仅你可见');
        await Promise.all([
          queryClient.invalidateQueries(['workflow-save-eligibility', executionId]),
          queryClient.invalidateQueries(['user-saved-skills']),
        ]);
        navigate(`/published-skills?tab=my-workflows&skillId=${savedSkill.id}`);
      },
      onError: (error) => {
        void message.error(error instanceof Error ? error.message : '保存工作流失败');
      },
    }
  );

  if (eligibilityQuery.isLoading || eligibilityQuery.isError || !eligibility?.eligible) {
    return null;
  }

  if (eligibility.savedSkillId) {
    return (
      <Tooltip title="查看已保存的个人工作流">
        <Button
          type="text"
          size="small"
          icon={<FolderOpenOutlined />}
          onClick={() => navigate(`/published-skills?tab=my-workflows&skillId=${eligibility.savedSkillId}`)}
          className="chat-action-btn chat-action-btn-icon chat-action-btn-saved"
          aria-label="查看工作流"
        />
      </Tooltip>
    );
  }

  const externalFixedInput = eligibility.fixedInput || {};
  const hasExternalFixedInput = Object.keys(externalFixedInput).length > 0;

  return (
    <>
      <Tooltip title="保存为我的工作流（固定多步计划）">
        <Button
          type="text"
          size="small"
          icon={<FolderAddOutlined />}
          onClick={() => setOpen(true)}
          className="chat-action-btn chat-action-btn-icon chat-action-btn-save"
          aria-label="保存工作流"
        />
      </Tooltip>
      <Drawer
        destroyOnClose
        open={open}
        title="保存为我的工作流"
        width="min(480px, 100vw)"
        onClose={() => setOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button
              type="primary"
              loading={saveMutation.isLoading}
              onClick={() => void form.validateFields().then((values) => saveMutation.mutate(values))}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            showIcon
            type="info"
            message="将保存本次成功执行的固定多步计划和参数"
            description="保存后不会重新规划；AI 仅做安全与可复用性审查。该工作流属于当前用户，不进入公共技能授权体系。"
          />
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="来源执行单">
              <Typography.Text copyable>{executionId}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="步骤数">{eligibility.stepCount}</Descriptions.Item>
            <Descriptions.Item label="可见范围">仅自己</Descriptions.Item>
            <Descriptions.Item label="执行方式">固定计划</Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical">
            <Form.Item
              label="工作流名称"
              name="name"
              rules={[{ required: true, whitespace: true, message: '请输入工作流名称' }]}
            >
              <Input maxLength={255} showCount />
            </Form.Item>
            <Form.Item label="说明" name="description">
              <Input.TextArea maxLength={1000} rows={3} showCount />
            </Form.Item>
          </Form>
          <div>
            <Typography.Text strong>工作流已固化参数</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginBlock: 4 }}>
              参数来自冻结计划；步骤输出会在运行时自动传递，不会保存为定时任务参数。
            </Typography.Paragraph>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {(eligibility.frozenStepInputs || []).map((step) => (
                <div key={step.nodeId}>
                  <Typography.Text type="secondary">
                    第 {step.sequence} 步 · {step.title}
                  </Typography.Text>
                  <Input.TextArea
                    readOnly
                    value={JSON.stringify(step.parameters, null, 2)}
                    autoSize={{ minRows: 2, maxRows: 8 }}
                  />
                </div>
              ))}
              {(eligibility.frozenStepInputs || []).length === 0 ? (
                <Typography.Text type="secondary">本工作流没有需要展示的步骤参数。</Typography.Text>
              ) : null}
            </Space>
          </div>
          <div>
            <Typography.Text strong>外部定时参数</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginBlock: 4 }}>
              仅保留计划明确引用的用户输入；未引用的提示词上下文和历史结果不会保存。
            </Typography.Paragraph>
            {hasExternalFixedInput ? (
              <Input.TextArea
                readOnly
                value={JSON.stringify(externalFixedInput, null, 2)}
                autoSize={{ minRows: 2, maxRows: 8 }}
              />
            ) : (
              <Typography.Text type="secondary">无需额外参数，定时执行时直接复用冻结计划。</Typography.Text>
            )}
          </div>
        </Space>
      </Drawer>
    </>
  );
}
