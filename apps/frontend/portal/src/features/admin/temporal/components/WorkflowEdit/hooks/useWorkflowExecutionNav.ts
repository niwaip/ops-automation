import { useNavigate } from 'react-router-dom';
import { useQueryClient } from 'react-query';
import { message } from 'antd';
import { executionApi } from '@/api/execution';
import type { TemporalWorkflowDTO } from '@/api/temporal';
import { resolveApiErrorMessage } from '../utils/workflowEditHelpers';

export function useWorkflowExecutionNav(
  selectedWorkflow: TemporalWorkflowDTO | null,
  setCreatingExecutionWorkflowId: (id: string | null) => void,
  setDetailModalVisible: (visible: boolean) => void
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const resolveWorkflowSourceSkillId = (workflow?: TemporalWorkflowDTO | null): string => {
    const sourceTemplate = workflow?.sourceTemplate || workflow?.sourceContext?.sourceTemplate;
    return String(sourceTemplate?.skillId || '').trim();
  };

  const buildExecutionInputFromWorkflow = (
    workflow: TemporalWorkflowDTO
  ): Record<string, unknown> => {
    const params = workflow.workflowDsl?.inputParams || {};
    const input: Record<string, unknown> = {};
    Object.entries(params).forEach(([key, config]) => {
      if (config?.defaultValue !== undefined && String(config.defaultValue).trim() !== '') {
        input[key] = config.defaultValue;
        return;
      }
      if (config?.exampleValue !== undefined && config.exampleValue !== null) {
        input[key] = config.exampleValue;
        return;
      }
      input[key] = '';
    });
    return input;
  };

  const handleCreateExecutionFromWorkflow = async () => {
    if (!selectedWorkflow) {
      return;
    }
    const skillId = resolveWorkflowSourceSkillId(selectedWorkflow);
    if (!skillId) {
      void message.warning('该工作流未绑定可执行 Skill，请先发布为 Skill 后再创建执行记录');
      return;
    }

    try {
      setCreatingExecutionWorkflowId(selectedWorkflow.id);
      const execution = await executionApi.create({
        skillId,
        runtimeType: 'browser',
        input: buildExecutionInputFromWorkflow(selectedWorkflow),
      });
      void message.success('已创建执行记录，正在跳转执行详情');
      setDetailModalVisible(false);
      void queryClient.invalidateQueries('executions');
      navigate(`/executions/${execution.id}`);
    } catch (error: unknown) {
      void message.error(resolveApiErrorMessage(error, '创建执行记录失败'));
    } finally {
      setCreatingExecutionWorkflowId(null);
    }
  };

  return {
    resolveWorkflowSourceSkillId,
    buildExecutionInputFromWorkflow,
    handleCreateExecutionFromWorkflow,
  };
}
