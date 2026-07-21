import re
import sys

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Add import styles
    if "import styles from" not in content:
        import_match = list(re.finditer(r'^import .*;', content, re.MULTILINE))
        if import_match:
            last_import = import_match[-1]
            insert_pos = last_import.end()
            
            if 'pages/DashboardPage.tsx' in filepath:
                style_import = "\nimport styles from './DashboardPage.module.css';"
            else:
                style_import = "\nimport styles from '../pages/DashboardPage.module.css';"
            
            if "import './DashboardPage.css';" in content:
                content = content.replace("import './DashboardPage.css';", style_import.strip())
            else:
                content = content[:insert_pos] + style_import + content[insert_pos:]

    # Pass 1: className="workbench-xxx foo"
    def replace_double_quotes(m):
        classes = m.group(1).split()
        out = []
        for c in classes:
            if 'workbench-' in c:
                out.append(f"{{styles['{c}']}}")
            else:
                out.append(f"'{c}'")
        
        # If there's only one class, output className={styles['workbench-foo']}
        if len(out) == 1 and out[0].startswith('{styles'):
            return f"className={out[0]}"
        else:
            # multiple classes: className={`${styles['workbench-foo']} bar`}
            inner = ' '.join([f"${c}" if c.startswith('{styles') else c.strip("'") for c in out])
            return f"className={{`{inner}`}}"
            
    content = re.sub(r'className="([^"]*?workbench-[^"]*?)"', replace_double_quotes, content)

    # Pass 2: className={`workbench-xxx ${foo}`}
    def replace_template(m):
        inner = m.group(1)
        # only replace if not already wrapped in styles
        # negative lookbehind to avoid replacing already processed
        new_inner = re.sub(r'(?<!\[\')\b(workbench-[\w-]+)\b', r"${styles['\1']}", inner)
        return f"className={{`{new_inner}`}}"
        
    content = re.sub(r'className=\{`([^`]*?workbench-[^`]*?)`\}', replace_template, content)
    
    with open(filepath, 'w') as f:
        f.write(content)

for f in sys.argv[1:]:
    process_file(f)