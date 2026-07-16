import re

with open('docker/compose/docker-compose.full.yml', 'r') as f:
    content = f.read()

# Replace command: > \n sh -c "npm run dev" with command: > \n sh -c "npx prisma generate && npm run dev"
# for all backend services.
# Let's just do a regex replace for the command under these specific services.
services_with_prisma = [
    'platform', 'session-broker', 'control-plane', 'browser-template', 
    'browser-semantics', 'ai-orchestrator', 'report'
]

for svc in services_with_prisma:
    pattern = rf'(container_name: ops-{svc}\n\s+working_dir: /workspace/apps/backend/.*?\n\s+command: >\n\s+sh -c ")npm run dev"'
    repl = rf'\1npx prisma generate && npm run dev"'
    content = re.sub(pattern, repl, content, flags=re.DOTALL)

with open('docker/compose/docker-compose.full.yml', 'w') as f:
    f.write(content)
