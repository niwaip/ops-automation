import re

with open('docker/compose/docker-compose.full.yml', 'r') as f:
    content = f.read()

def replace_service(service_name, relative_path, has_prisma=False):
    global content
    
    # We want to match the whole block for the service, from `container_name: ops-{service_name}` up to the end of volumes
    pattern = rf'(\s+container_name: ops-{service_name}\n\s+working_dir: )/app\n\s+command: >.*?sh -c "npm config set registry.*?npm run start:dev"(.*?volumes:\n)\s+- \${{PROJECT_ROOT:-\.\.}}/{relative_path}:/app\n\s+- [a-zA-Z0-9_]+_node_modules:/app/node_modules'
    
    if has_prisma:
        cmd = f'sh -c "npx prisma generate && npm run start:dev"'
    else:
        cmd = f'sh -c "npm run start:dev"'
        
    repl = rf'\1/workspace/{relative_path}\n    command: >\n      {cmd}\2      - ${{PROJECT_ROOT:-..}}:/workspace'
    
    content = re.sub(pattern, repl, content, flags=re.DOTALL)

replace_service('ai-orchestrator', 'apps/backend/intelligence/ai-orchestrator', has_prisma=True)
replace_service('report', 'apps/backend/capabilities/document-domain/report')
replace_service('browser-semantics', 'apps/backend/capabilities/browser-domain/semantics')
replace_service('browser-template', 'apps/backend/capabilities/browser-domain/templates', has_prisma=True)
replace_service('browser-worker', 'apps/backend/runtimes/browser-worker')
replace_service('control-plane', 'apps/backend/execution-control/control-plane')
replace_service('session-broker', 'apps/backend/execution-control/session-broker')
replace_service('platform', 'apps/backend/core/platform', has_prisma=True)

with open('docker/compose/docker-compose.full.yml', 'w') as f:
    f.write(content)
