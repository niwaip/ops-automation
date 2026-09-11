import { useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import {
  skillApi,
  SkillConfigDTO,
  SkillValidationResult,
  SkillValidationStreamEvent,
} from '@/api/skill';
import { getValidationProgressMeta } from '../utils/skillHelpers';

interface UseSkillValidationOptions {
  onApplyAdjustment: (id: string, generatedSkill?: any) => void;
}

export function useSkillValidation({ onApplyAdjustment }: UseSkillValidationOptions) {
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [validatingSkillId, setValidatingSkillId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<SkillValidationResult | null>(null);
  const [validationLogs, setValidationLogs] = useState<string[]>([]);
  const [validationStage, setValidationStage] = useState('等待开始');
  const [validationPulse, setValidationPulse] = useState(0);
  const validationAbortRef = useRef<(() => void) | null>(null);

  const appendValidationLog = (log: string) => {
    setValidationLogs((prev) => [...prev, log]);
  };

  const stopValidationStream = () => {
    validationAbortRef.current?.();
    validationAbortRef.current = null;
  };

  const resetValidationState = () => {
    stopValidationStream();
    setValidationResult(null);
    setValidationLogs([]);
    setValidationStage('等待开始');
    setValidatingSkillId(null);
  };

  useEffect(() => {
    return () => {
      stopValidationStream();
    };
  }, []);

  useEffect(() => {
    if (!validatingSkillId) {
      setValidationPulse(0);
      return;
    }

    const timer = window.setInterval(() => {
      setValidationPulse((prev) => prev + 1);
    }, 450);

    return () => window.clearInterval(timer);
  }, [validatingSkillId]);

  const handleValidationEvent = (event: SkillValidationStreamEvent) => {
    if (event.type === 'stage') {
      setValidationStage(event.content || '处理中');
      appendValidationLog(`[阶段] ${event.content}`);
      return;
    }

    if (event.type === 'log') {
      appendValidationLog(event.content);
      return;
    }

    if (event.type === 'result') {
      const validation = event.data?.validation as SkillValidationResult | undefined;
      if (validation) {
        setValidationResult(validation);
      }
      setValidationStage('验证完成');
      setValidatingSkillId(null);
      validationAbortRef.current = null;
      return;
    }

    if (event.type === 'error') {
      appendValidationLog(`[错误] ${event.content}`);
      setValidationStage('验证失败');
      setValidatingSkillId(null);
      validationAbortRef.current = null;
      message.error(event.content || '验证失败');
    }
  };

  const handleValidate = (skill: SkillConfigDTO) => {
    stopValidationStream();
    setValidationResult(null);
    setValidationLogs([]);
    setValidationStage('正在启动验证');
    setValidatingSkillId(skill.id);
    setValidationModalVisible(true);
    validationAbortRef.current = skillApi.streamValidate(
      skill.id,
      handleValidationEvent,
      (error) => {
        appendValidationLog(`[错误] ${error.message}`);
        setValidationStage('验证失败');
        setValidatingSkillId(null);
        validationAbortRef.current = null;
        message.error(error.message || '验证失败');
      },
      () => {
        setValidatingSkillId((current) => (current === skill.id ? null : current));
        validationAbortRef.current = null;
      }
    );
  };

  const handleCloseValidationModal = () => {
    resetValidationState();
    setValidationModalVisible(false);
  };

  const handleApplySuggestion = (selectedSkill: SkillConfigDTO | null) => {
    if (!selectedSkill || !validationResult?.details?.skillSimulation?.generatedSkill) {
      return;
    }

    onApplyAdjustment(
      selectedSkill.id,
      validationResult.details.skillSimulation.generatedSkill
    );
  };

  const validationProgressMeta = getValidationProgressMeta(
    validationResult ? '验证完成' : validationStage,
    Boolean(validatingSkillId),
    validationPulse
  );
  const validationAnimatedDots = '.'.repeat((validationPulse % 3) + 1);

  return {
    validationModalVisible,
    setValidationModalVisible,
    validatingSkillId,
    validationResult,
    validationLogs,
    validationStage,
    validationProgressMeta,
    validationAnimatedDots,
    handleValidate,
    handleCloseValidationModal,
    handleApplySuggestion,
    resetValidationState,
  };
}
