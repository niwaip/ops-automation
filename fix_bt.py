import re

with open('docker/compose/docker-compose.full.yml', 'r') as f:
    content = f.read()

pattern = r'(container_name: ops-browser-template\n\s+working_dir: /workspace/apps/backend/capabilities/browser-domain/templates\n\s+command: >\n\s+sh -c ")npm run build && npm run dev"'
repl = r'\1npm run build && node dist/main.js"'
content = re.sub(pattern, repl, content, flags=re.DOTALL)

with open('docker/compose/docker-compose.full.yml', 'w') as f:
    f.write(content)
