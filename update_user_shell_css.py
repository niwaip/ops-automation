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
            
            if '/header/' in filepath:
                style_import = "\nimport styles from '../UserLayout.module.css';"
            else:
                style_import = "\nimport styles from './UserLayout.module.css';"
            
            if "import './UserLayout.css';" in content:
                content = content.replace("import './UserLayout.css';", style_import.strip())
            else:
                content = content[:insert_pos] + style_import + content[insert_pos:]

    # Pass 1: className="user-shell-xxx foo" or "user-shell"
    def replace_double_quotes(m):
        classes = m.group(1).split()
        out = []
        for c in classes:
            if c.startswith('user-shell'):
                out.append(f"{{styles['{c}']}}")
            else:
                out.append(f"'{c}'")
        
        if len(out) == 1 and out[0].startswith('{styles'):
            return f"className={out[0]}"
        else:
            inner = ' '.join([f"${c}" if c.startswith('{styles') else c.strip("'") for c in out])
            return f"className={{`{inner}`}}"
            
    content = re.sub(r'className="([^"]*?user-shell[^"]*?)"', replace_double_quotes, content)

    # Pass 2: className={`user-shell-xxx ${foo}`}
    def replace_template(m):
        inner = m.group(1)
        new_inner = re.sub(r'(?<!\[\')\b(user-shell(?:-[\w-]+)?)\b', r"${styles['\1']}", inner)
        return f"className={{`{new_inner}`}}"
        
    content = re.sub(r'className=\{`([^`]*?user-shell[^`]*?)`\}', replace_template, content)
    
    with open(filepath, 'w') as f:
        f.write(content)

for f in sys.argv[1:]:
    process_file(f)