import { EditOutlined } from '@ant-design/icons';
import { Button, Input, message, Modal } from 'antd';
import { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { savedSkillApi, type SavedSkill } from '@/api/savedSkills';

export function SavedWorkflowAliasAction({ skill }: { skill: SavedSkill }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const mutation = useMutation(
    (aliases: string[]) => savedSkillApi.updateAliases(skill.id, aliases),
    {
      onSuccess: async () => {
        await queryClient.invalidateQueries(['user-saved-skills']);
        message.success('工作流别名已保存');
        setOpen(false);
      },
      onError: () => {
        message.error('保存别名失败，请检查是否与其他工作流重复');
      },
    },
  );

  const show = () => {
    setValue((skill.aliases || []).join('\n'));
    setOpen(true);
  };

  return (
    <>
      <Button block icon={<EditOutlined />} onClick={show}>别名</Button>
      <Modal
        title={`“${skill.name}”的触发别名`}
        open={open}
        confirmLoading={mutation.isLoading}
        onCancel={() => setOpen(false)}
        onOk={() => mutation.mutate(
          value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean),
        )}
      >
        <Input.TextArea
          rows={6}
          maxLength={2000}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="每行一个别名，例如：每日微博摘要推送"
        />
      </Modal>
    </>
  );
}
