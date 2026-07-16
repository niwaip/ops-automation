import re

with open('docker/compose/docker-compose.full.yml', 'r') as f:
    content = f.read()

def fix_service(service_name, rel_path, has_prisma=False):
    global content
    
    # 1. fix working_dir and command
    pattern = rf'(container_name: ops-{service_name}\n\s+working_dir: )/app\n\s+command: >.*?(?=\n\s+environment:)'
    if has_prisma:
        cmd = f'sh -c "npx prisma generate && npm run start:dev"\n'
    else:
        cmd = f'sh -c "npm run start:dev"\n'
        
    repl = rf'\1/workspace/{rel_path}\n    command: >\n      {cmd}'
    content = re.sub(pattern, repl, content, flags=re.DOTALL)
    
    # 2. fix volumes
    # find the volumes section for this service and replace it.
    vol_pattern = rf'(container_name: ops-{service_name}.*?\n\s+volumes:\n).*?(?=\n\s+(?:depends_on|networks|healthcheck):)'
    def vol_repl(m):
        prefix = m.group(1)
        vols = f'      - ${{PROJECT_ROOT:-..}}:/workspace'
        if 'var/cache/ai-orchestrator' in m.group(0):
            vols += '\n      - ${PROJECT_ROOT:-..}/apps/backend/var/cache/ai-orchestrator:/workspace/apps/backend/var/cache/ai-orchestrator'
        if 'report_files:/app/files' in m.group(0):
            vols += '\n      - report_files:/workspace/apps/backend/capabilities/document-domain/report/files'
        return prefix + vols
    
    content = re.sub(vol_pattern, vol_repl, content, flags=re.DOTALL)

fix_service('ai-orchestrator', 'apps/backend/intelligence/ai-orchestrator', True)
fix_service('report', 'apps/backend/capabilities/document-domain/report', False)
fix_service('browser-semantics', 'apps/backend/capabilities/browser-domain/semantics', False)
fix_service('browser-template', 'apps/backend/capabilities/browser-domain/templates', True)
fix_service('browser-worker', 'apps/backend/runtimes/browser-worker', False)
fix_service('control-plane', 'apps/backend/execution-control/control-plane', False)
fix_service('session-broker', 'apps/backend/execution-control/session-broker', False)
fix_service('platform', 'apps/backend/core/platform', True)

# Remove all _node_modules volumes from the file
content = re.sub(r'\n\s+[a-zA-Z0-9_]+_node_modules:(?=\n|$)', '', content)

with open('docker/compose/docker-compose.full.yml', 'w') as f:
    f.write(content)
