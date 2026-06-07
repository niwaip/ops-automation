import React, { Suspense, lazy } from 'react';
import { getOfficeType } from '../host/office/host';

const ExcelApp = lazy(() => import('./ExcelApp'));
const WordApp = lazy(() => import('./WordApp'));

/**
 * 旧入口保留为薄分发层，只负责根据宿主选择对应 App。
 */
export const App: React.FC = () => {
  const officeType = getOfficeType();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      {officeType === 'excel' ? <ExcelApp /> : <WordApp officeType={officeType} />}
    </Suspense>
  );
};

export default App;
