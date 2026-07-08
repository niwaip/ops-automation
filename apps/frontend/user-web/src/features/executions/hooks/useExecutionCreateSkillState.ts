import { useEffect, useMemo, useRef } from 'react';
import { Form, type FormInstance } from 'antd';
import type { ExecutionCreateFormValues } from '@/features/executions/lib/executionCreate';
import { useQuery } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import { capabilityReleaseApi } from '@/api/capabilities';
import { skillApi } from '@/api/skill';
import {
  getDefaultScheduleName,
  getInitialInputValues,
  getSchemaFields,
} from '@/features/executions/lib/executionCreate';
import { useAuthStore } from '@/shared/store/authStore';

type PublishedSkillOption = {
  skillId: string;
  skillName: string;
  updatedAt: string;
};

type PublishedSkillCandidate = PublishedSkillOption & {
  releaseVersion: number;
};

interface UseExecutionCreateSkillStateOptions {
  form: FormInstance;
}

export function useExecutionCreateSkillState({
  form,
}: UseExecutionCreateSkillStateOptions) {
  const selectedSkillId = Form.useWatch('skillId', form) as ExecutionCreateFormValues['skillId'] | undefined;
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const initializedSkillIdRef = useRef<string | undefined>();
  const initialSkillId = searchParams.get('skillId') || undefined;

  const publishedSkillsQuery = useQuery(
    ['published-skills-for-execution-create'],
    capabilityReleaseApi.listReleaseCenter
  );
  const authorizedSkillsQuery = useQuery(
    ['authorized-skills-for-execution-create'],
    skillApi.list
  );

  const authorizedSkillIds = useMemo(
    () => new Set((authorizedSkillsQuery.data?.skills || []).map((skill) => skill.id)),
    [authorizedSkillsQuery.data?.skills]
  );

  const skillOptions = useMemo(() => {
    const releases = publishedSkillsQuery.data?.releases || [];
    const skillMap = new Map<string, PublishedSkillCandidate>();

    releases.forEach((release) => {
      if (!release.publishedSkillId) {
        return;
      }

      if (user?.role !== 'admin' && !authorizedSkillIds.has(release.publishedSkillId)) {
        return;
      }

      const sourceKey = [
        release.sourceType,
        release.sourceId || release.sourceName || release.publishedSkillId,
      ].join('::');
      const nextItem: PublishedSkillCandidate = {
        skillId: release.publishedSkillId,
        skillName: release.sourceName || release.sourceId || release.publishedSkillId,
        updatedAt: release.updatedAt,
        releaseVersion: release.releaseVersion || 0,
      };
      const currentItem = skillMap.get(sourceKey);

      const shouldReplace =
        !currentItem ||
        nextItem.releaseVersion > currentItem.releaseVersion ||
        (nextItem.releaseVersion === currentItem.releaseVersion &&
          new Date(nextItem.updatedAt).getTime() > new Date(currentItem.updatedAt).getTime());

      if (shouldReplace) {
        skillMap.set(sourceKey, nextItem);
      }
    });

    return Array.from(skillMap.values())
      .map(({ releaseVersion: _releaseVersion, ...item }) => item)
      .sort((left, right) => left.skillName.localeCompare(right.skillName));
  }, [authorizedSkillIds, publishedSkillsQuery.data?.releases, user?.role]);

  const selectedSkillOption = useMemo(
    () => skillOptions.find((skill) => skill.skillId === selectedSkillId),
    [selectedSkillId, skillOptions]
  );

  const selectedSkillQuery = useQuery(
    ['skill-detail-for-execution-create', selectedSkillId],
    () => skillApi.getById(selectedSkillId ?? ''),
    { enabled: Boolean(selectedSkillId) }
  );

  const selectedSkill = selectedSkillQuery.data;
  const selectedSkillDisplayName =
    selectedSkillOption?.skillName || selectedSkill?.name || selectedSkillId || '-';
  const schemaFields = useMemo(
    () => getSchemaFields(selectedSkill?.paramsSchema),
    [selectedSkill?.paramsSchema]
  );
  const requiredFieldCount = schemaFields.filter((field) => field.required).length;
  const optionalFieldCount = schemaFields.length - requiredFieldCount;

  useEffect(() => {
    if (!initialSkillId) {
      return;
    }

    if (!form.getFieldValue('skillId')) {
      form.setFieldValue('skillId', initialSkillId);
    }
  }, [form, initialSkillId]);

  useEffect(() => {
    if (!selectedSkill?.id) {
      initializedSkillIdRef.current = undefined;
      form.setFieldValue('input', {});
      return;
    }

    if (initializedSkillIdRef.current === selectedSkill.id) {
      return;
    }

    initializedSkillIdRef.current = selectedSkill.id;
    form.setFieldsValue({
      input: getInitialInputValues(schemaFields),
    });
  }, [form, schemaFields, selectedSkill]);

  useEffect(() => {
    if (!selectedSkillDisplayName || !selectedSkillId) {
      return;
    }

    const currentScheduleName = form.getFieldValue('scheduleName');
    if (!currentScheduleName) {
      form.setFieldValue('scheduleName', getDefaultScheduleName(selectedSkillDisplayName));
    }

    const currentTimezone = form.getFieldValue('timezone');
    if (!currentTimezone) {
      form.setFieldValue('timezone', 'Asia/Shanghai');
    }

    if (!form.getFieldValue('schedulePattern')) {
      form.setFieldValue('schedulePattern', 'workdays');
    }
    if (!form.getFieldValue('scheduleHour')) {
      form.setFieldValue('scheduleHour', '09');
    }
    if (!form.getFieldValue('scheduleMinute')) {
      form.setFieldValue('scheduleMinute', '00');
    }
    if (!form.getFieldValue('weeklyDays')) {
      form.setFieldValue('weeklyDays', ['1']);
    }
    if (!form.getFieldValue('monthlyDay')) {
      form.setFieldValue('monthlyDay', 1);
    }
  }, [form, selectedSkillDisplayName, selectedSkillId]);

  return {
    initialSkillId,
    isSkillOptionsLoading: publishedSkillsQuery.isLoading || authorizedSkillsQuery.isLoading,
    selectedSkill,
    selectedSkillDisplayName,
    selectedSkillLoading: selectedSkillQuery.isFetching,
    skillOptions,
    schemaFields,
    requiredFieldCount,
    optionalFieldCount,
  };
}
