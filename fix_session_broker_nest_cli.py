import json

with open('apps/backend/execution-control/session-broker/nest-cli.json', 'r') as f:
    data = json.load(f)

data['compilerOptions'] = data.get('compilerOptions', {})
data['compilerOptions']['builder'] = 'tsc'

with open('apps/backend/execution-control/session-broker/nest-cli.json', 'w') as f:
    json.dump(data, f, indent=2)
