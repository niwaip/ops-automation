"""Extract the user's task before skill defaults can bias goals or deliverables."""

import re
from .semantic_decision import structured_decision, ground_user_quote


PHYSICAL_EXPORT_RE = re.compile(
    r'(?:'
    r'导出|下载|保存为|保存到|落盘|写入|'
    r'(?:生成|制作|创建|输出|做个|做一份).*(?:文件|文档|报表|表格文件|excel|word|pdf|ppt|pptx|docx|xlsx|csv|html|markdown|\.md|\.txt|\.json)|'
    r'(?:复制|生成|新建|创建|更新|添加).*(?:sheet|工作表|标签页|报表|表格|工作簿|预测|预实|快照)|'
    r'(?:更新|修改|调整|刷新|填入|回填|覆盖).*(?:预实|工数|表格|工作簿|sheet|工作表|预测)|'
    r'\.(?:xlsx|docx|pdf|pptx|csv|json|html|txt)\b|'
    r'(?:excel|word|pdf|ppt|pptx|docx|xlsx)\s*文件|'
    r'可下载'
    r')',
    re.I
)

SPREADSHEET_MUTATION_RE = re.compile(
    r'(?:'
    r'(?:复制|生成|新建|创建|更新|添加).*(?:sheet|工作表|标签页|工作簿|预测|预实|快照)|'
    r'(?:更新|修改|调整|刷新|填入|回填|覆盖).*(?:预实|工数|表格|工作簿|sheet|工作表|预测)'
    r')',
    re.I
)


def has_physical_artifact_request(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    return bool(PHYSICAL_EXPORT_RE.search(text))


def is_spreadsheet_mutation_requested(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    return bool(SPREADSHEET_MUTATION_RE.search(text))


INSTRUCTIONS = """仅根据用户当前请求和必要的用户历史提取任务契约，不考虑任何候选的默认行为。skill_names只提供可调用名称，帮助识别用户是否指定执行对象，不包含技能用途或规则。
instruction_relation分析当前请求与历史对话的关系：
- standalone：全新独立任务或完整独立指令（如提出新统计、新问题、换了新文件、或语义自包含的任务）。独立任务的目标、范围与格式严格仅以当前请求为准，绝不继承历史对话中未重申的限定、条件或呈现格式（如历史上的“只要表格”、“无需解读”等修饰符已过期）。
- followup：对上一轮任务或其结果的明确延续、追加筛选（如“再加个条件”、“只要大于100的”）、追问（“为什么是这个结果”）、纠错重试、或回答助手的确认追问（如补充字段、确认口径、确认区块映射或写入单位）。回答助手的追问属于延续执行，task_mode 必须为 execute，绝不能标记为 consult！
当前明确要求优先于历史。requirements逐项引用真实用户原话，记录目标、限制、条件和交付，不添加改进偏好。独立任务(standalone)的requirements只能引用当前请求中的原话，禁止从历史中拖拽已过期的修饰符。
task_mode=consult 仅表示解释或讨论某项能力/技能本身（如“什么是工数”，“这个技能怎么用”）；凡是回答追问、提供业务字段、统计或实际完成任务的，一律为 execute！
output_mode=conversation表示在对话中回答，含文字、Markdown表格、列出结果；artifact用于用户在当前请求中明确要求生成、下载或导出物理文件的情况。对于要求在现有工作簿/文件中修改、更新、复制工作表(Sheet)、新建工作表(Sheet)、回填数值并保存的任务，属于必须生成/更新持久化交付物的更新任务，output_mode 必须为 artifact，artifact_types 为 ['.xlsx']！
读取、统计或分析输入附件且无修改时，不意味着要交付相同格式的输出文件。没有明确物理交付要求或更新修改要求时使用conversation和空artifact_types。特别注意：“只要表格”、“列出表格”等是呈现偏好，属于conversation，绝不是生成物理Excel文件的依据。
artifact_types是用户要求的文件扩展名数组。契约只记录目标，不声明执行完成。
skill_invocation记录调用意图：mode=execute表示明确执行整项技能，reference表示只借用方法、讨论或否定其执行，none表示没有指定技能；name填写目录中的标准ID或用户原话中的技能名称，none时为空；引用目录ID时不要求该ID字面出现在原话中，调用关系仍须根据用户原话语义判断。
用户要求使用skill_names中的某项能力来完成任务，属于execute；不必出现“技能”二字。未指定调用对象的普通任务才是none。只讨论其定义、否定调用或明确仅借方法属于reference。独立任务不继承历史轮次指定过的技能，除非当前请求再次明确指出。
replace_defaults仅在用户明确替换、取消原技能业务口径时为true；追加结果筛选、排序或呈现要求不等于替换原口径。仅出现名称不构成execute，必须理解否定、引用与讨论语义。
unit_confirmation仅记录用户明确指定的目标写入单位，包含unit和逐字quote。回答单位追问（含简短回答）是有效确认；followup可继承仍适用的用户确认，standalone只用当前请求。没有明确指定则为null。仅要求“按工作簿声明的单位”时也是null，不填写推测的单位。来源字段中的单位、附件/技能中的声明、助手建议、询问或否定某单位，均不构成用户确认。不能由来源单位推断目标单位。quote必须包含用户实际表达的单位，不得只引用文件名或某个字段名。
section_confirmation仅在用户明确确认或指明业务区块到目标表头的映射时填写（例如助手曾追问未找到【无偿】区块并给出候选列表，用户在当前回复中指明或确认'【*P/Y/EX】就是无偿'、'是*P'等），填写section（业务概念如'无偿'）、target_title（匹配的候选表头如'*P/*Y/EX（不含*L/*B）'）及逐字quote。无此明确确认时填null。
本阶段仅解析目标，不判断是否已提供数据或工具；附件由后续绑定。你不回答、不提问、不猜测数据是否存在，只提取用户已提出的要求。澄清由后续准入与输入绑定负责。
只返回结构化字段，不输出解释或推理。"""


REVIEW_INSTRUCTIONS = """
本轮是独立复核：先从原始用户请求重新检查目标、禁止事项、交付方式和技能调用，再审查proposed_contract。
独立核对unit_confirmation的目标含义及用户原话；不能把来源单位、询问、否定或助手建议当作确认，也不能丢弃用户对单位追问的简短回答。
独立核对section_confirmation：若用户当前请求是在回答助手关于区块映射的澄清追问（如【无偿】对应哪个候选表头），必须保留section_confirmation并将task_mode设为execute、instruction_relation设为followup。
初稿可能有遗漏或扩大范围，不能因为结构有效就照抄。返回经过修正的完整任务契约，不输出审核说明。
特别检查：
1. 交付形式：对话中的表格是一种呈现形式，不等于Excel文件；只有当前请求中明确出现物理文件交付/导出/下载请求，或要求复制Sheet/新建Sheet/更新回填工作簿时才保留artifact。严禁把普通的“只要表格”当成.xlsx文件。
2. 历史隔离：若指令是独立任务(standalone)，绝不能继承前序轮次已过期的格式要求（如“只要表格，无需解读”），requirements必须只来自本轮请求。未在本轮明确要求物理导出或工作簿更新的独立任务，output_mode必须修正为conversation且artifact_types为空[]。
保留否定限制，完整技能调用不能漏掉；追加结果筛选不是取消原规则。仅讨论或只借用方法不能升级成执行授权。
"""


def intent_tool(skill_names=None):
    from .user_declarations import SUPPORTED_UNITS
    text = {'type': 'string'}
    return {'type': 'function', 'function': {'name': 'submit_task_intent', 'description': '提取用户任务契约，不执行任务。',
        'parameters': {'type': 'object', 'additionalProperties': False, 'properties': {
            'instruction_relation': {'type': 'string', 'enum': ['standalone', 'followup'],
                'description': '指令与历史的关系：standalone=全新独立任务或自包含指令；followup=对上轮结果的追问/筛选/格式转换'},
            'task_mode': {'type': 'string', 'enum': ['execute', 'consult']},
            'output_mode': {'type': 'string', 'enum': ['conversation', 'artifact']},
            'artifact_types': {'type': 'array', 'items': text},
            'unit_confirmation': {'type': ['object', 'null'], 'additionalProperties': False,
                'properties': {'unit': {'type': 'string', 'enum': SUPPORTED_UNITS}, 'quote': text}, 'required': ['unit', 'quote'],
                'description': '用户明确指定的目标写入单位与逐字原话；无明确确认时null，禁止从来源或助手建议推断'},
            'section_confirmation': {'type': ['object', 'null'], 'additionalProperties': False,
                'properties': {'section': text, 'target_title': text, 'quote': text}, 'required': ['section', 'target_title', 'quote'],
                'description': '用户明确确认的业务区块到目标表头的映射与逐字原话'},
            'skill_invocation': {'type': 'object', 'additionalProperties': False, 'properties': {
                'mode': {'type': 'string', 'enum': ['execute', 'reference', 'none'] if skill_names else ['none'], 'description': '明确使用目录中的能力完成任务=execute；仅讨论或借方法=reference；未指定能力=none'}, 'name': {'type': 'string', 'enum': list(dict.fromkeys(['', *[name for s in (skill_names or []) for name in [s['id'], s.get('name', ''), *s.get('aliases', [])]]]))},
                'replace_defaults': {'type': 'boolean'}}, 'required': ['mode', 'name', 'replace_defaults']},
            'requirements': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                'properties': {'id': text, 'quote': text}, 'required': ['id', 'quote']}}},
            'required': ['instruction_relation', 'task_mode', 'output_mode', 'artifact_types', 'unit_confirmation', 'skill_invocation', 'requirements']}}}


def extract_task_intent(request, users, model, policy, telemetry, deadline, input_count=0, skill_names=None, history=None):
    # Ground possible identities before semantic classification. A mention is
    # eligible for review, never automatic execution or acceptance of rules.
    skill_names = [record for record in (skill_names or []) if any(
        ground_user_quote(name, [request, *users]) is not None
        for name in [record['id'], record.get('name', ''), *record.get('aliases', [])])]

    # Extract recent dialogue (both user and assistant) so LLM has context of prior questions
    recent_dialogue = []
    if history:
        for msg in history[-8:]:
            role = msg.get('role')
            if role in ('user', 'assistant'):
                c = msg.get('content', '')
                if '用户指令：' in c:
                    c = c.split('用户指令：')[-1].strip()
                recent_dialogue.append({'role': role, 'content': c[:600]})

    feedback = None
    for attempt in range(2):
        try:
            payload = {
                'request': request,
                'user_history': users,
                'input_count': input_count,
                'skill_names': skill_names or [],
                'feedback': feedback
            }
            if recent_dialogue:
                payload['recent_dialogue'] = recent_dialogue
            result = structured_decision(INSTRUCTIONS, payload,
                intent_tool(skill_names), model, policy, telemetry, deadline, 'task_intent', max_tokens=900)
            result = validate_intent(result, request, users, skill_names, allow_sanitize=attempt > 0, history=history)
            reviewed_payload = {
                'request': request,
                'user_history': users,
                'input_count': input_count,
                'skill_names': skill_names,
                'proposed_contract': result
            }
            if recent_dialogue:
                reviewed_payload['recent_dialogue'] = recent_dialogue
            reviewed = structured_decision(INSTRUCTIONS + REVIEW_INSTRUCTIONS,
                reviewed_payload, intent_tool(skill_names),
                model, policy, telemetry, deadline, 'task_intent_review', max_tokens=900)
            reviewed = validate_intent(reviewed, request, users, skill_names, allow_sanitize=True, history=history)
            telemetry.record_guard('task_intent_review', 'accept' if reviewed == result else 'revise',
                {'output_mode': reviewed['output_mode'], 'task_mode': reviewed['task_mode']})
            result = reviewed
            # Standalone Ephemeral Modifier Expiration & Mutation Promotion:
            # If standalone and no physical export requested in current prompt, enforce conversation mode.
            if result.get('instruction_relation') == 'standalone' and result['output_mode'] == 'artifact':
                if not has_physical_artifact_request(request):
                    result['output_mode'] = 'conversation'
                    result['artifact_types'] = []
            elif is_spreadsheet_mutation_requested(request) and result.get('task_mode') == 'execute':
                result['output_mode'] = 'artifact'
                if not any(t.lower().endswith(('.xlsx', '.xlsm')) for t in result.get('artifact_types', [])):
                    result['artifact_types'] = ['.xlsx']
            telemetry.record_guard('task_intent', 'accept', result)
            return result
        except ValueError as error:
            feedback = {'error': str(error)}
            telemetry.record_guard('task_intent_attempt', 'reject', str(error))
    raise ValueError('任务意图无法可靠确认，尚未加载或执行技能')


def validate_intent(result, request, users, skill_names, allow_sanitize=False, history=None):
    allowed_keys = {'task_mode', 'output_mode', 'artifact_types', 'skill_invocation', 'requirements'}
    if set(result) - {'instruction_relation', 'unit_confirmation', 'section_confirmation'} != allowed_keys:
        raise ValueError('任务契约字段不完整')

    from .user_declarations import (
        validate_unit_confirmation, direct_unit_reply,
        validate_section_confirmation, direct_section_reply,
        bind_user_declarations
    )

    # Inspect last assistant turn in history to ground clarification follow-ups
    last_assistant = next((h.get('content', '') for h in reversed(history or []) if h.get('role') == 'assistant'), '')
    asked_section = None
    candidates = []
    if last_assistant:
        m_sec = re.search(r'未找到名为【([^】]+)】的区块', last_assistant)
        if m_sec:
            asked_section = m_sec.group(1).strip()
        cands = re.findall(r'【([^】]+)】', last_assistant)
        candidates = [c for c in cands if c != asked_section]

    direct_sec = direct_section_reply(request, last_assistant)
    direct_u = direct_unit_reply(request)

    is_clarification_response = bool(
        result.get('section_confirmation') or direct_sec or direct_u or (
            last_assistant and ('请确认' in last_assistant or '未找到名为' in last_assistant or '本次尚未生成更新文件' in last_assistant)
        )
    )

    # Enforce followup and task execution lock when answering an active clarification prompt
    if is_clarification_response and users:
        result['instruction_relation'] = 'followup'
        result['task_mode'] = 'execute'
        if any(is_spreadsheet_mutation_requested(u) for u in [request, *users]):
            result['output_mode'] = 'artifact'
            if not any(t.lower().endswith(('.xlsx', '.xlsm')) for t in result.get('artifact_types', [])):
                result['artifact_types'] = ['.xlsx']

    relation = result.setdefault('instruction_relation', 'standalone')
    if relation not in {'standalone', 'followup'}:
        raise ValueError('指令关系无效')

    # Resolve direct declarations
    if relation == 'followup':
        if direct_u:
            result['unit_confirmation'] = direct_u
        if not result.get('section_confirmation') and direct_sec:
            result['section_confirmation'] = direct_sec

    # Validate unit confirmation
    if 'unit_confirmation' in result and result['unit_confirmation']:
        u_quote = str((result['unit_confirmation'] or {}).get('quote') or '').strip()
        if re.fullmatch(r'[\u4e00-\u9fa5A-Za-z0-9_]+\s*[\(（]\s*[A-Za-z\u4e00-\u9fa5]+\s*[\)）](?:合计|总计|汇总|均值|平均)?', u_quote):
            result['unit_confirmation'] = None
        else:
            try:
                result['unit_confirmation'] = validate_unit_confirmation(
                    result['unit_confirmation'],
                    [request] if relation == 'standalone' else [request, *users]
                )
            except ValueError:
                if not allow_sanitize:
                    raise
                result['unit_confirmation'] = None

    # Validate section confirmation (normalizing abbreviations against candidate titles)
    if 'section_confirmation' in result and result['section_confirmation']:
        try:
            result['section_confirmation'] = validate_section_confirmation(
                result['section_confirmation'],
                [request] if relation == 'standalone' else [request, *users],
                candidates=candidates
            )
        except ValueError:
            result['section_confirmation'] = None

    # Immediate runtime binding and domain memory persistence when declarations exist
    if result.get('unit_confirmation') or result.get('section_confirmation'):
        bind_user_declarations({
            'unit_confirmation': result.get('unit_confirmation'),
            'section_confirmation': result.get('section_confirmation'),
            'user_statements': [request, *users]
        })

    # Answering clarification question or providing metric criteria in followup is execution, not consultation
    if relation == 'followup' and result.get('task_mode') == 'consult':
        if not re.search(r'(?:怎么用|是什么|为什么|解释.*技能|讨论|如何使用|原理|定义|介绍)', request):
            result['task_mode'] = 'execute'

    if is_spreadsheet_mutation_requested(request) and result.get('task_mode') == 'execute':
        result['output_mode'] = 'artifact'
        if not any(t.lower().endswith(('.xlsx', '.xlsm')) for t in result.get('artifact_types', [])):
            result['artifact_types'] = ['.xlsx']

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
        names = [invocation['name']]
        for record in skill_names or []:
            identifiers = [record['id'], record.get('name', ''), *record.get('aliases', [])]
            if invocation['name'] in identifiers:
                names.extend(identifiers)
        in_request = any(ground_user_quote(name, [request]) is not None for name in names)
        in_history = any(ground_user_quote(name, [request, *users]) is not None for name in names)
        if not in_history:
            raise ValueError('技能调用对象没有用户原话依据；不得从附件类型或任务类别推断指定了技能，未指定调用对象应为none')
        if relation == 'standalone' and not in_request:
            if allow_sanitize:
                invocation['mode'] = 'none'
                invocation['name'] = ''
                invocation['replace_defaults'] = False
            else:
                raise ValueError('当前指令判定为独立任务(standalone)，当前请求未指定调用技能；独立任务禁止继承历史对话中的技能，请将 skill_invocation 修改为 mode="none", name="", replace_defaults=false，且 requirements 只能引用当前请求中的原话')

    if result['task_mode'] == 'consult' and invocation['mode'] == 'execute':
        raise ValueError('讨论技能不能被解释为执行调用')
    if (result['output_mode'] == 'conversation' and types) or (result['output_mode'] == 'artifact' and not types):
        raise ValueError('对话回答不应附加物理文件交付')
    if not isinstance(result['requirements'], list) or len(result['requirements']) > 24:
        raise ValueError('任务要求格式无效')

    seen = set()
    valid_requirements = []
    for item in result['requirements']:
        if not isinstance(item, dict) or set(item) != {'id', 'quote'} or not isinstance(item['id'], str) or not item['id'] or item['id'] in seen:
            raise ValueError('任务要求标识无效')
        quote = ground_user_quote(item['quote'], [request, *users])
        if quote is None:
            raise ValueError('任务要求没有用户原话依据')
        quote_in_request = ground_user_quote(item['quote'], [request])
        if relation == 'standalone' and quote_in_request is None:
            if allow_sanitize:
                continue
            raise ValueError(f'当前指令判定为独立任务(standalone)，任务要求"{item.get("quote")}"来自历史对话；独立任务的 requirements 只能引用当前请求中的原话')
        item['quote'] = quote_in_request if relation == 'standalone' else quote
        seen.add(item['id'])
        valid_requirements.append(item)

    if not valid_requirements:
        if relation == 'followup' and users:
            last_u = users[-1].strip()
            if last_u:
                valid_requirements.append({'id': 'req_inherited', 'quote': last_u[:120]})
        if not valid_requirements and request.strip():
            req_quote = ground_user_quote(request.strip(), [request])
            if req_quote:
                valid_requirements.append({'id': 'req_direct', 'quote': req_quote})
        if not valid_requirements:
            raise ValueError('任务目标缺失')
    result['requirements'] = valid_requirements
    return result
