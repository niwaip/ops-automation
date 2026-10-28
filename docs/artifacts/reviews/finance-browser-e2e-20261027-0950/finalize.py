"""Finalize this browser run's evidence without touching product code."""
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).parent
statuses = {
    'F01': 'DEGRADED：识别正确，完成后仍显示排队中',
    'F02': 'DEGRADED：四指标正确，来源坐标倒置',
    'F03': 'DEGRADED：预算数值正确，未明确给一致性结论',
    'F04': 'FAIL：错误月份/差异，并带入排除的利润表',
    'F05': 'FAIL：部分完成，完整异常清单未交付',
    'F06': 'FAIL：干净重跑触发datetime序列化异常',
    'F07': 'DEGRADED：空结果正确，日期附加解释错误',
    'F08': 'DEGRADED：恢复后交付有效XLSX，重复标注有误',
    'F09': 'DEGRADED：差额正确，正式检查未闭环',
    'F10': 'PASS：刷新历史保留，再次下载字节一致',
    'F11': 'PASS：正确请求补充附件',
    'F12': 'FAIL：停止及历史保留成功，新指令却输出旧分析',
}
case_file = root / 'cases.md'
lines = case_file.read_text().splitlines()
for i, line in enumerate(lines):
    match = re.match(r'\| (F\d\d) \|', line)
    if match:
        parts = line.rsplit('|', 2)
        lines[i] = parts[0] + '| ' + statuses[match[1]] + ' |'
case_file.write_text('\n'.join(lines) + '\n')

def scrub(value):
    if isinstance(value, dict):
        return {key: '[REDACTED]' if key.lower() in {
            'ticket', 'token', 'accesstoken', 'refreshtoken', 'authorization', 'password'
        } else scrub(item) for key, item in value.items()}
    if isinstance(value, list):
        return [scrub(item) for item in value]
    if isinstance(value, str):
        return re.sub(r'([?&](?:token|ticket|access_token)=)[^&\s"<\\]+', r'\1[REDACTED]', value)
    return value

for path in root.glob('*.json'):
    path.write_text(json.dumps(scrub(json.loads(path.read_text())), ensure_ascii=False, indent=2))

before = Path('.playwright-mcp/finance-anomalies-before.xlsx')
after = Path('.playwright-mcp/finance-anomalies-after.xlsx')
source = Path('/Users/chain/Desktop/AI能力测试_财务报表.xlsx')
validation = {
    'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'download_bytes': before.stat().st_size,
    'download_sha256': hashlib.sha256(before.read_bytes()).hexdigest(),
    'same_bytes_after_refresh': before.read_bytes() == after.read_bytes(),
    'case_statuses': statuses,
}
(root / 'validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2))
print(json.dumps(validation, ensure_ascii=False))
