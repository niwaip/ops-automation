import re
import json

with open('docker/compose/docker-compose.full.yml', 'r') as f:
    content = f.read()

pattern = r'(container_name: ops-browser-template\n\s+working_dir: /workspace/apps/backend/capabilities/browser-domain/templates\n\s+command: >\n\s+sh -c ")npm run build && node dist/main.js"'
repl = r'\1npx prisma generate && npm run dev"'
content = re.sub(pattern, repl, content, flags=re.DOTALL)

with open('docker/compose/docker-compose.full.yml', 'w') as f:
    f.write(content)

with open('apps/backend/capabilities/browser-domain/templates/nest-cli.json', 'r') as f:
    data = json.load(f)

data['compilerOptions'] = data.get('compilerOptions', {})
data['compilerOptions']['builder'] = 'tsc'

with open('apps/backend/capabilities/browser-domain/templates/nest-cli.json', 'w') as f:
    json.dump(data, f, indent=2)
