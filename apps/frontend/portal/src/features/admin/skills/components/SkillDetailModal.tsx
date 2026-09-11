import React from 'react';
import { Modal, Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { SkillConfigDTO } from '@/api/skill';
import { isRegistryBuiltinSkill } from '@/features/admin/skills/builtinSkillInventory';
import { SkillDetailContent } from './SkillDetailContent';

interface SkillDetailModalProps {
  open: boolean;
  skill: SkillConfigDTO | null;
  onClose: () => void;
  onDelete?: (id: string, name?: string) => void;
  deleteLoading?: boolean;
}

export const SkillDetailModal: React.FC<SkillDetailModalProps> = ({
  open,
  skill,
  onClose,
  onDelete,
  deleteLoading = false,
}) => {
  if (!skill) return null;

  return (
    <Modal
      title={`技能详情 - ${skill.name}`}
      open={open}
      onCancel={onClose}
      footer={[
        ...(isRegistryBuiltinSkill(skill) || !onDelete
          ? []
          : [
              <Button
                key="delete"
                danger
                icon={<DeleteOutlined />}
                loading={deleteLoading}
                onClick={() => onDelete(skill.id, skill.name)}
              >
                删除 Skill
              </Button>,
            ]),
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
      width={850}
    >
      <SkillDetailContent skill={skill} embedded={false} />
    </Modal>
  );
};
