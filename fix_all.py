import re

with open('docker/compose/docker-compose.full.yml', 'r') as f:
    content = f.read()

# 1. Fix portal
content = re.sub(
    r'working_dir: /app\s+command: sh -c "npm config set registry https://registry.npmmirror.com && npm install --legacy-peer-deps && npm run dev"(.*?)- \${PROJECT_ROOT:-\.\.}/apps/frontend/portal:/app\s+- \${PROJECT_ROOT:-\.\.}/apps/frontend/shared:/shared\s+- \${PROJECT_ROOT:-\.\.}/packages/backend-contracts:/packages/backend-contracts\s+- \${PROJECT_ROOT:-\.\.}/packages/user-core:/packages/user-core\s+- \${PROJECT_ROOT:-\.\.}/tsconfig\.base\.json:/tsconfig\.base\.json:ro\s+- portal_node_modules:/app/node_modules',
    r'working_dir: /workspace/apps/frontend/portal\n    command: sh -c "npm run dev"\1- ${PROJECT_ROOT:-..}:/workspace',
    content,
    flags=re.DOTALL
)

# 2. Fix user-web
content = re.sub(
    r'working_dir: /app\s+command: sh -c "npm config set registry https://registry.npmmirror.com && npm install --legacy-peer-deps && npm run dev"(.*?)- \${PROJECT_ROOT:-\.\.}/apps/frontend/user-web:/app\s+- \${PROJECT_ROOT:-\.\.}/apps/frontend/shared:/shared\s+- \${PROJECT_ROOT:-\.\.}/packages/backend-contracts:/packages/backend-contracts\s+- \${PROJECT_ROOT:-\.\.}/packages/user-core:/packages/user-core\s+- \${PROJECT_ROOT:-\.\.}/tsconfig\.base\.json:/tsconfig\.base\.json:ro\s+- user_web_node_modules:/app/node_modules',
    r'working_dir: /workspace/apps/frontend/user-web\n    command: sh -c "npm run dev"\1- ${PROJECT_ROOT:-..}:/workspace',
    content,
    flags=re.DOTALL
)

# 3. Fix backend services
def fix_service(service_name, rel_path):
    global content
    
    # Match the block up to the end of volumes
    pattern = rf'(container_name: ops-{service_name}\n\s+working_dir: )/app\n\s+command: >.*?(?=\n\s+environment:)'
    cmd = f'sh -c "npm run dev"\n'
        
    repl = rf'\1/workspace/{rel_path}\n    command: >\n      {cmd}'
    content = re.sub(pattern, repl, content, flags=re.DOTALL)
    
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

fix_service('ai-orchestrator', 'apps/backend/intelligence/ai-orchestrator')
fix_service('report', 'apps/backend/capabilities/document-domain/report')
fix_service('browser-semantics', 'apps/backend/capabilities/browser-domain/semantics')
fix_service('browser-template', 'apps/backend/capabilities/browser-domain/templates')
fix_service('control-plane', 'apps/backend/execution-control/control-plane')
fix_service('session-broker', 'apps/backend/execution-control/session-broker')
fix_service('platform', 'apps/backend/core/platform')

# 4. Fix browser-worker
bw_pattern = r'(container_name: ops-browser-worker\n\s+working_dir: )/app\n\s+command: sh -c "npm config set registry https://registry.npmmirror.com && rm -rf /app/node_modules/\* /app/node_modules/\.\[\!\.\]\* /app/node_modules/\.\.\?\* 2>/dev/null \|\| true && npm install --legacy-peer-deps --include=dev --ignore-scripts && npm run dev"(.*?)volumes:\n\s+- \${PROJECT_ROOT:-\.\.}/apps/backend/runtimes/browser-worker:/app\n\s+- \${PROJECT_ROOT:-\.\.}/packages/backend-contracts:/packages/backend-contracts\n\s+- \${PROJECT_ROOT:-\.\.}/packages/user-core:/packages/user-core\n\s+- \${PROJECT_ROOT:-\.\.}/tsconfig\.base\.json:/tsconfig\.base\.json:ro\n\s+- /var/run/docker\.sock:/var/run/docker\.sock\n\s+- browser_worker_node_modules:/app/node_modules'
bw_repl = r'\1/workspace/apps/backend/runtimes/browser-worker\n    command: sh -c "npm run dev"\2volumes:\n      - ${PROJECT_ROOT:-..}:/workspace\n      - /var/run/docker.sock:/var/run/docker.sock'
content = re.sub(bw_pattern, bw_repl, content, flags=re.DOTALL)

# 5. Fix sandbox-worker
sw_pattern = r'(container_name: ops-sandbox-worker\n\s+working_dir: )/app\n\s+environment:(.*?)volumes:\n\s+- \${PROJECT_ROOT:-\.\.}/apps/backend/runtimes/sandbox-worker:/app\n\s+- \${PROJECT_ROOT:-\.\.}/packages/backend-contracts:/packages/backend-contracts\n\s+- \${PROJECT_ROOT:-\.\.}/packages/user-core:/packages/user-core\n\s+- \${PROJECT_ROOT:-\.\.}/tsconfig\.base\.json:/tsconfig\.base\.json:ro\n\s+- /var/run/docker\.sock:/var/run/docker\.sock\n\s+- sandbox_worker_node_modules:/app/node_modules'
sw_repl = r'\1/workspace/apps/backend/runtimes/sandbox-worker\n    environment:\2volumes:\n      - ${PROJECT_ROOT:-..}:/workspace\n      - /var/run/docker.sock:/var/run/docker.sock'
content = re.sub(sw_pattern, sw_repl, content, flags=re.DOTALL)

# 6. Fix carbone-engine
content = content.replace(
    '''  carbone-engine:
    build:
      context: ../..
      dockerfile: docker/carbone-engine/Dockerfile
    image: compose-carbone-engine
    container_name: carbone-engine
    working_dir: /workspace/apps/backend/capabilities/document-domain
    command: >
      sh -c "npm install --workspaces=false --include=dev --package-lock=false
      && npm run build
      && npm run start:prod"''',
    '''  carbone-engine:
    build:
      context: ../..
      dockerfile: docker/carbone-engine/Dockerfile
    image: compose-carbone-engine
    container_name: carbone-engine
    working_dir: /workspace/apps/backend/capabilities/document-domain
    command: >
      sh -c "npm run build && npm run start:prod"'''
)

content = content.replace(
    '''    volumes:
      - ${PROJECT_ROOT:-..}:/workspace
      - carbone_engine_node_modules:/workspace/apps/backend/capabilities/document-domain/node_modules
      - ${PROJECT_ROOT:-..}/apps/backend/var/templates/document-engine:/workspace/apps/backend/var/templates/document-engine''',
    '''    volumes:
      - ${PROJECT_ROOT:-..}:/workspace
      - ${PROJECT_ROOT:-..}/apps/backend/var/templates/document-engine:/workspace/apps/backend/var/templates/document-engine'''
)

# 7. Remove node_modules volumes definition at the end
content = re.sub(r'\n\s+[a-zA-Z0-9_]+_node_modules:(?=\n|$)', '', content)

with open('docker/compose/docker-compose.full.yml', 'w') as f:
    f.write(content)
