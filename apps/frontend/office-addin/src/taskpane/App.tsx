import React from 'react';
import { ExcelApp } from './ExcelApp';
import { WordApp } from './WordApp';
import { OfficeHelper } from '../utils/office-api';

/**
 * 旧入口保留为薄分发层，只负责根据宿主选择对应 App。
 */
export const App: React.FC = () => {
  const officeType = OfficeHelper.getOfficeType();

  if (officeType === 'excel') {
    return <ExcelApp />;
  }

  return <WordApp officeType={officeType} />;
};

export default App;
