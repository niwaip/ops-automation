const fs = require('fs');
const path = require('path');

const srcDir = '/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/executions';

const filesToUpdate = [
  'pages/ExecutionListPage.tsx',
  'list/components/ExecutionListDetailDrawer.tsx',
  'list/components/ExecutionListSummaryStrip.tsx',
  'list/components/ExecutionListToolbar.tsx',
  'list/components/ExecutionListEmptyState.tsx',
  'list/components/executionListView.tsx',
  'list/hooks/useExecutionListTableProps.tsx'
];

filesToUpdate.forEach(relPath => {
  const filePath = path.join(srcDir, relPath);
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Calculate relative path to ExecutionListPage.module.css
  const depth = relPath.split('/').length - 1;
  const prefix = depth === 1 ? '.' : '../'.repeat(depth - 1) + '.';
  const cssPath = `${prefix}/pages/ExecutionListPage.module.css`.replace('./../', '../');
  
  // If the file is ExecutionListPage.tsx, replace import './ExecutionListPage.css';
  if (relPath === 'pages/ExecutionListPage.tsx') {
    content = content.replace("import './ExecutionListPage.css';", `import styles from './ExecutionListPage.module.css';`);
  } else {
    // For other files, add import if not exists
    if (!content.includes('ExecutionListPage.module.css')) {
      content = content.replace(/(import .*?;[\r\n]+)(?=(?:import .*?;[\r\n]+)*\n?(?:interface|const|export|function|type))/, `$1import styles from '${cssPath}';\n`);
    }
  }

  // Replace className="some-class" with className={styles['some-class']}
  // Exclude some common non-module classes if any, but most start with execution- or btn-
  content = content.replace(/className="((?:execution-|btn-)[^"]+)"/g, `className={styles['$1']}`);
  
  // Replace className={`some-class ${other}`} with className={`${styles['some-class']} ${other}`}
  content = content.replace(/className=\{`((?:execution-|btn-)[a-zA-Z0-9-]+) (.*?)`\}/g, (match, p1, p2) => {
    return `className={\`\${styles['${p1}']} ${p2}\`}`;
  });

  // Handle rowClassName: () => 'execution-list-table-row'
  content = content.replace(/rowClassName: \(\) => '((?:execution-|btn-)[^']+)'/g, `rowClassName: () => styles['$1']`);

  // Handle className: 'execution-list-table'
  content = content.replace(/className: '((?:execution-|btn-)[^']+)'/g, `className: styles['$1']`);

  fs.writeFileSync(filePath, content, 'utf8');
});

console.log('Done replacing classNames');
