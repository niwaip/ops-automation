import json
import urllib.request

payload = {
    'sessionId': 'recorder-debug-1781844093464',
    'runtimeSessionId': 'recorder-ui-1781843049237-rqv09k',
    'backend': 'cli',
    'userGoal': '案件粗利率条件审批',
}

request = urllib.request.Request(
    'http://127.0.0.1:3007/ai/recorder-debug/export',
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
)

with urllib.request.urlopen(request, timeout=180) as response:
    data = json.load(response)

path = '/Users/chain/Documents/MyProject/ops-automation/.dbg-export-1781844093464.json'
with open(path, 'w', encoding='utf-8') as handle:
    json.dump(data, handle, ensure_ascii=False, indent=2)

print(path)
