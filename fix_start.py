import re

with open('docker/compose/docker-compose.full.yml', 'r') as f:
    content = f.read()

content = content.replace('npm run start:dev', 'npm run dev')

with open('docker/compose/docker-compose.full.yml', 'w') as f:
    f.write(content)
