import { SkillConfigDTO } from '@/api/skill';
export type { SkillParamFormItem, ValidationProgressMeta } from './utils/skillHelpers';
export type { SkillAdminTabKey } from './components/SkillAdminTabs';

export interface SkillFilterState {
  search?: string;
  category?: string;
}

export interface SkillModalState {
  editVisible: boolean;
  activeSkill?: SkillConfigDTO | null;
}

export interface SkillAdminPageProps {
  embedded?: boolean;
  initialSkillId?: string;
}
