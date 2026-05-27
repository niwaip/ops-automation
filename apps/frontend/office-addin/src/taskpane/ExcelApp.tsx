import React from 'react';
import { ExcelHostWorkspace } from '../components/workspaces/ExcelHostWorkspace';
import { TaskpaneShell } from './TaskpaneShell';

const helpContent = (
  <>
    <p>默认规则：左侧使用 sheet `0 / 2 / 4 ...` 作为空白模板，右侧使用 sheet `1 / 3 / 5 ...` 作为真实数据。</p>
    <p>对照组的勾选与删除放在第二步“参数识别”卡片中；文档理解区域只负责理解工作簿内容。</p>
    <p>Excel 模板流程：第一步先理解工作簿内容；第二步再基于对照组执行参数识别。</p>
  </>
);

export const ExcelApp: React.FC = () => {
  return (
    <TaskpaneShell
      officeType="excel"
      officeLabel="Excel"
      templateLabel="Excel 模板"
      helpContent={helpContent}
    >
      <ExcelHostWorkspace />
    </TaskpaneShell>
  );
};

export default ExcelApp;
