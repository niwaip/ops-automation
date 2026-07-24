import { SkillConfigDTO } from '@/api/skill';

export type SkillAdminTabKey = 'skills' | 'requests' | 'permissions';

export interface SkillFilterState {
  search?: string;
  category?: string;
}

export interface SkillModalState {
  editVisible: boolean;
  activeSkill?: SkillConfigDTO | null;
}
