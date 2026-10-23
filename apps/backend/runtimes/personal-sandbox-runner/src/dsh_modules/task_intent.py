"""Extract the user's task before skill defaults can bias goals or deliverables."""

from .semantic_decision import structured_decision, ground_user_quote


INSTRUCTIONS = """仅根据用户当前请求和必要的用户历史提取任务契约，不考虑任何候选的默认行为。skill_names只提供可调用名称，帮助识别用户是否指定执行对象，不包含技能用途或规则。
当前明确要求优先于历史。requirements逐项引用真实用户原话，记录目标、限制、条件和交付，不添加改进偏好。
task_mode=consult表示解释或讨论某项能力/技能本身；execute表示实际完成任务。
output_mode=conversation表示在对话中回答，含文字、Markdown表格、列出结果；artifact只用于用户明确要求生成、下载或导出物理文件的情况。
读取、统计或分析输入附件不意味着要交付相同格式的输出文件。没有明确物理交付要求时使用conversation和空artifact_types。
artifact_types是用户要求的文件扩展名数组。契约只记录目标，不声明执行完成。
skill_invocation记录调用意图：mode=execute表示明确执行整项技能，reference表示只借用方法、讨论或否定其执行，none表示没有指定技能；name填写目录中的标准ID或用户原话中的技能名称，none时为空；引用目录ID时不要求该ID字面出现在原话中，调用关系仍须根据用户原话语义判断。
用户要求使用skill_names中的某项能力来完成任务，属于execute；不必出现“技能”二字。未指定调用对象的普通任务才是none。只讨论其定义、否定调用或明确仅借方法属于reference。
replace_defaults仅在用户明确替换、取消原技能业务口径时为true；追加结果筛选、排序或呈现要求不等于替换原口径。仅出现名称不构成execute，必须理解否定、引用与讨论语义。
本阶段仅解析目标，不判断是否已提供数据或工具；附件由后续绑定。你不回答、不提问、不猜测数据是否存在，只提取用户已提出的要求。澄清由后续准入与输入绑定负责。
只返回结构化字段，不输出解释或推理。"""


REVIEW_INSTRUCTIONS = """
本轮是独立复核：先从原始用户请求重新检查目标、禁止事项、交付方式和技能调用，再审查proposed_contract。
初稿可能有遗漏或扩大范围，不能因为结构有效就照抄。返回经过修正的完整任务契约，不输出审核说明。
特别检查：对话中的表格是一种呈现形式，不等于Excel文件；只有明确的物理文件交付请求才保留artifact。
保留否定限制，完整技能调用不能漏掉；追加结果筛选不是取消原规则。仅讨论或只借用方法不能升级成执行授权。
"""


def intent_tool(skill_names=None):
    text = {'type': 'string'}
    return {'type': 'function', 'function': {'name': 'submit_task_intent', 'description': '提取用户任务契约，不执行任务。',
        'parameters': {'type': 'object', 'additionalProperties': False, 'properties': {
            'task_mode': {'type': 'string', 'enum': ['execute', 'consult']},
            'output_mode': {'type': 'string', 'enum': ['conversation', 'artifact']},
            'artifact_types': {'type': 'array', 'items': text},
            'skill_invocation': {'type': 'object', 'additionalProperties': False, 'properties': {
                'mode': {'type': 'string', 'enum': ['execute', 'reference', 'none'] if skill_names else ['none'], 'description': '明确使用目录中的能力完成任务=execute；仅讨论或借方法=reference；未指定能力=none'}, 'name': {'type': 'string', 'enum': list(dict.fromkeys(['', *[name for s in (skill_names or []) for name in [s['id'], s.get('name', ''), *s.get('aliases', [])]]]))},
                'replace_defaults': {'type': 'boolean'}}, 'required': ['mode', 'name', 'replace_defaults']},
            'requirements': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                'properties': {'id': text, 'quote': text}, 'required': ['id', 'quote']}}},
            'required': ['task_mode', 'output_mode', 'artifact_types', 'skill_invocation', 'requirements']}}}


def extract_task_intent(request, users, model, policy, telemetry, deadline, input_count=0, skill_names=None):
    # Ground possible identities before semantic classification. A mention is
    # eligible for review, never automatic execution or acceptance of rules.
    skill_names = [record for record in (skill_names or []) if any(
        ground_user_quote(name, [request, *users]) is not None
        for name in [record['id'], record.get('name', ''), *record.get('aliases', [])])]
    feedback = None
    for _ in range(2):
        try:
            result = structured_decision(INSTRUCTIONS, {'request': request, 'user_history': users, 'input_count': input_count, 'skill_names': skill_names or [], 'feedback': feedback},
                intent_tool(skill_names), model, policy, telemetry, deadline, 'task_intent', max_tokens=900)
            result = validate_intent(result, request, users, skill_names)
            reviewed = structured_decision(INSTRUCTIONS + REVIEW_INSTRUCTIONS,
                {'request': request, 'user_history': users, 'input_count': input_count,
                 'skill_names': skill_names, 'proposed_contract': result}, intent_tool(skill_names),
                model, policy, telemetry, deadline, 'task_intent_review', max_tokens=900)
            reviewed = validate_intent(reviewed, request, users, skill_names)
            telemetry.record_guard('task_intent_review', 'accept' if reviewed == result else 'revise',
                {'output_mode': reviewed['output_mode'], 'task_mode': reviewed['task_mode']})
            result = reviewed
            telemetry.record_guard('task_intent', 'accept', result)
            return result
        except ValueError as error:
            feedback = {'error': str(error)}
            telemetry.record_guard('task_intent_attempt', 'reject', str(error))
    raise ValueError('任务意图无法可靠确认，尚未加载或执行技能')


def validate_intent(result, request, users, skill_names):
    if set(result) != {'task_mode', 'output_mode', 'artifact_types', 'skill_invocation', 'requirements'}:
        raise ValueError('任务契约字段不完整')
    if result['task_mode'] not in {'execute', 'consult'} or result['output_mode'] not in {'conversation', 'artifact'}:
        raise ValueError('任务模式无效')
    types = result['artifact_types']
    if not isinstance(types, list) or not all(isinstance(t, str) and t.strip('.').isalnum() for t in types):
        raise ValueError('文件类型格式无效')
    result['artifact_types'] = ['.' + t.lstrip('.') for t in types]
    invocation = result['skill_invocation']
    if (not isinstance(invocation, dict) or set(invocation) != {'mode', 'name', 'replace_defaults'}
            or invocation['mode'] not in {'execute', 'reference', 'none'}
            or not isinstance(invocation['name'], str) or not isinstance(invocation['replace_defaults'], bool)):
        raise ValueError('技能调用意图格式无效')
    if invocation['mode'] == 'none':
        if invocation['name'] or invocation['replace_defaults']:
            raise ValueError('未指定技能时不能填入调用规则')
    else:
        # Canonical IDs may differ from the user-facing name, but must
        # still bind to a source mention. This validates identity only;
        # the model decides execute/reference, never a name substring.
        names = [invocation['name']]
        for record in skill_names or []:
            identifiers = [record['id'], record.get('name', ''), *record.get('aliases', [])]
            if invocation['name'] in identifiers:
                names.extend(identifiers)
        if not any(ground_user_quote(name, [request, *users]) is not None for name in names):
            raise ValueError('技能调用对象没有用户原话依据；不得从附件类型或任务类别推断指定了技能，未指定调用对象应为none')
    if result['task_mode'] == 'consult' and invocation['mode'] == 'execute':
        raise ValueError('讨论技能不能被解释为执行调用')
    if (result['output_mode'] == 'conversation' and types) or (result['output_mode'] == 'artifact' and not types):
        raise ValueError('对话回答不应附加物理文件交付')
    if not isinstance(result['requirements'], list) or len(result['requirements']) > 24:
        raise ValueError('任务要求格式无效')
    seen = set()
    for item in result['requirements']:
        if not isinstance(item, dict) or set(item) != {'id', 'quote'} or not isinstance(item['id'], str) or not item['id'] or item['id'] in seen:
            raise ValueError('任务要求标识无效')
        quote = ground_user_quote(item['quote'], [request, *users])
        if quote is None:
            raise ValueError('任务要求没有用户原话依据')
        item['quote'] = quote; seen.add(item['id'])
    if not seen:
        raise ValueError('任务目标缺失')
    return result
