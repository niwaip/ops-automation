const fs = require('fs');
const path = require('path');

const cssPath = '/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/executions/pages/ExecutionListPage.module.css';

let content = fs.readFileSync(cssPath, 'utf8');

// Wrap .ant-xxx with :global(.ant-xxx)
// Match .ant-[a-zA-Z0-9-]+ but exclude if it's already inside :global
content = content.replace(/(?<!:global\()\.(ant-[a-zA-Z0-9-]+)(?!\))/g, ':global(.$1)');

fs.writeFileSync(cssPath, content, 'utf8');
console.log('Done CSS');
