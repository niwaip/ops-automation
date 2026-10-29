"""Separate blocking layout/content repairs from optional visual preferences."""
import re

REVIEW_INSTRUCTION = (
    '审核本页与用户要求：缺字、裁切、重叠、表格、页码、内容完整和读者适配。'
    '清单重复、重复内容、行内对象与建议不一致、不可操作或不安全的建议、记录区不足须返回REPAIR；'
    '无法阅读、缺页或明显布局破损返回FAIL。个人审美偏好不阻断，不要求其他页内容出现在本页。'
    '仅对用户要求的提示块检查色块；按记录用途检查空白空间。'
    '单页文档检查版面重心与留白率（非填报表格若下半部留白过半，可在OPTIONAL中建议双栏或扩充内容）；检查序号/标号格式的一致性（混杂时在OPTIONAL中建议归一）。'
    '第一行仅PASS、REPAIR或FAIL。REPAIR/FAIL后最多三条具体问题和修复办法。'
    'PASS后只允许无问题说明或以OPTIONAL:开头的纯审美建议，不能把需修复的内容问题放在PASS下。')


def validate_review(analysis):
    verdict = re.search(r'(?m)^\s*(?:\*\*)?(PASS|FAIL|REPAIR)\b', analysis)
    if not verdict or verdict[1] != 'PASS':
        raise ValueError('页面尚未通过视觉或内容检查：' + analysis[:2500])
    details = analysis[verdict.end():].strip().strip('*').strip()
    lines = [line.strip() for line in details.splitlines() if line.strip()]
    repairs = []
    for line in lines:
        if line.startswith('OPTIONAL:'):
            continue
        positive = re.sub(r'(?:无需|无须|不需|不必)(?:修复|修改|调整)|(?:无|没有)(?:缺字|裁切|重叠|重复|问题)', '', line)
        if re.search(r'修复|建议|需要修改|表述重叠|存在重复|内容重复|缺少|残留', positive):
            repairs.append(line)
    if repairs:
        raise ValueError('审阅虽标记PASS但仍提出需处理的问题：' + '\n'.join(repairs)[:2500])
