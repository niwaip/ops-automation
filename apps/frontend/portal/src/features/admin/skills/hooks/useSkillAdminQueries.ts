import { useMemo } from 'react';
import { useQuery } from 'react-query';
import { skillApi, builtinSkillApi, roleApi, SkillConfigDTO } from '@/api/skill';
import { userApi } from '@/api/auth';
import { carboneApi } from '@/api/carbone';
import { executionFlowApi } from '@/api/flows';
import {
  isRegistryBuiltinSkill,
  mergeSkillInventory,
} from '@/features/admin/skills/builtinSkillInventory';
import { isBuiltinSkill } from '../utils/skillHelpers';

interface UseSkillAdminQueriesOptions {
  permissionModalVisible?: boolean;
  selectedSkill?: SkillConfigDTO | null;
}

export function useSkillAdminQueries(options: UseSkillAdminQueriesOptions = {}) {
  const { permissionModalVisible = false, selectedSkill = null } = options;

  const skillsQuery = useQuery(['skills'], skillApi.list);
  const builtinSkillsQuery = useQuery(
    ['builtin-skill-inventory'],
    builtinSkillApi.listInventory
  );
  const rolesQuery = useQuery(['roles'], roleApi.list);
  const permissionUsersQuery = useQuery(
    ['permission-users', permissionModalVisible],
    () => userApi.list({ page: 1 }),
    { enabled: permissionModalVisible }
  );
  const templatesQuery = useQuery(['carbone-templates'], carboneApi.list);
  const executionFlowTemplatesQuery = useQuery(['flows'], () =>
    executionFlowApi.list({ isActive: true })
  );

  const permissionsQuery = useQuery(
    ['skill-permissions', selectedSkill?.id],
    () => skillApi.getPermissions(selectedSkill!.id),
    {
      enabled:
        permissionModalVisible &&
        !!selectedSkill &&
        !isRegistryBuiltinSkill(selectedSkill),
    }
  );

  const accessRequestsQuery = useQuery(
    ['skill-access-requests', selectedSkill?.id],
    () => skillApi.getAccessRequests(selectedSkill!.id, 'pending'),
    { enabled: permissionModalVisible && !!selectedSkill }
  );

  const approvedAccessRequestsQuery = useQuery(
    ['skill-access-requests', selectedSkill?.id, 'approved'],
    () => skillApi.getAccessRequests(selectedSkill!.id, 'approved'),
    { enabled: permissionModalVisible && !!selectedSkill }
  );

  const rejectedAccessRequestsQuery = useQuery(
    ['skill-access-requests', selectedSkill?.id, 'rejected'],
    () => skillApi.getAccessRequests(selectedSkill!.id, 'rejected'),
    { enabled: permissionModalVisible && !!selectedSkill }
  );

  const allSkills = useMemo(
    () =>
      mergeSkillInventory(
        skillsQuery.data?.skills || [],
        builtinSkillsQuery.data?.skills || []
      ),
    [skillsQuery.data?.skills, builtinSkillsQuery.data?.skills]
  );

  const builtinSkillByKey = useMemo(
    () =>
      new Map(
        (builtinSkillsQuery.data?.skills || []).map((skill) => [
          skill.capabilityKey,
          skill,
        ])
      ),
    [builtinSkillsQuery.data?.skills]
  );

  const builtinSkillsCount = useMemo(
    () => allSkills.filter(isBuiltinSkill).length,
    [allSkills]
  );

  const customSkillsCount = useMemo(
    () => allSkills.filter((s) => !isBuiltinSkill(s)).length,
    [allSkills]
  );

  const templateOptions = useMemo(
    () =>
      templatesQuery.data?.templates?.map((t) => ({
        value: t.id,
        label: `${t.name} (${t.id.slice(0, 8)}...)`,
      })) || [],
    [templatesQuery.data?.templates]
  );

  return {
    skillsQuery,
    builtinSkillsQuery,
    rolesQuery,
    permissionUsersQuery,
    templatesQuery,
    executionFlowTemplatesQuery,
    permissionsQuery,
    accessRequestsQuery,
    approvedAccessRequestsQuery,
    rejectedAccessRequestsQuery,
    allSkills,
    builtinSkillByKey,
    builtinSkillsCount,
    customSkillsCount,
    templateOptions,
  };
}
