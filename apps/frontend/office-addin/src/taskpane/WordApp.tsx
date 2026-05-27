import React from 'react';
import { WordHostWorkspace } from '../components/workspaces/WordHostWorkspace';
import { OfficeAppType } from './store';
import { TaskpaneShell } from './TaskpaneShell';

interface WordAppProps {
  officeType?: Extract<OfficeAppType, 'word' | 'ppt'>;
}

const helpContent = (
  <>
    <p>使用 AI 识别参数后，可预览并应用变量到当前文档。</p>
    <p>如需查看模型请求原文或原始返回，可在分析结果区域展开调试信息。</p>
  </>
);

export const WordApp: React.FC<WordAppProps> = ({ officeType = 'word' }) => {
  const officeLabel = officeType === 'ppt' ? 'PowerPoint' : 'Word';
  const templateLabel = officeType === 'ppt' ? 'PowerPoint 模板' : 'Word 模板';

  return (
    <TaskpaneShell
      officeType={officeType}
      officeLabel={officeLabel}
      templateLabel={templateLabel}
      helpContent={helpContent}
    >
      <WordHostWorkspace />
    </TaskpaneShell>
  );
};

export default WordApp;
