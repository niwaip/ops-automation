"""Extract the user's task before skill defaults can bias goals or deliverables."""

import re
from .semantic_decision import structured_decision, ground_user_quote


PHYSICAL_EXPORT_RE = re.compile(
    r'(?:'
    r'导出|下载|保存为|保存到|落盘|写入|'
    r'(?:生成|制作|创建|输出|做个|做一份).*(?:文件|文档|报表|表格文件|excel|word|pdf|ppt|pptx|docx|xlsx|csv|html|markdown|\.md|\.txt|\.json)|'
    r'(?:复制|生成|新建|创建|更新|添加|删除|移除|删掉).*(?:sheet|工作表|标签页|报表|表格|工作簿|预测|预实|快照)|'
    r'(?:更新|修改|调整|刷新|填入|回填|覆盖|替换).*(?:预实|工数|表格|工作簿|sheet|工作表|预测|单元格|数据|数值)|'
    r'(?:将|把)\s*[A-Za-z0-9_]+\s*(?:改成|改为|替换为|换成)|'
    r'\.(?:xlsx|docx|pdf|pptx|csv|json|html|txt)\b|'
    r'(?:excel|word|pdf|ppt|pptx|docx|xlsx)\s*文件|'
    r'可下载'
    r')',
    re.I
)

VISUAL_EXPORT_RE = re.compile(
    r'(?:'
    r'(?:生成|制作|创建|输出|画|绘制|做个|做一份|出个).*(?:柱状图|折线图|饼图|散点图|雷达图|直方图|箱线图|面积图|图表|可视化|看板|大屏|架构图|时序图|流程图|拓扑图|图片|图像)|'
    r'(?:柱状图|折线图|饼图|散点图|雷达图|直方图|箱线图|面积图|图表|可视化看板|可视化图表|交互式页面)\b|'
    r'\.(?:html|png|jpg|jpeg|svg)\b'
    r')',
    re.I
)

SPREADSHEET_MUTATION_RE = re.compile(
    r'(?:'
    r'(?:复制|生成|新建|创建|更新|添加|删除|移除|删掉).*(?:sheet|工作表|标签页|工作簿|预测|预实|快照)|'
    r'(?:将|把).*(?:sheet|工作表|标签页|工作簿|表格).*(?:删除|移除|删掉|清空)|'
    r'(?:更新|修改|调整|刷新|填入|回填|覆盖|替换).*(?:预实|工数|表格|工作簿|sheet|工作表|预测|单元格|数据|数值)|'
    r'(?:将|把)\s*[A-Za-z0-9_]+\s*(?:改成|改为|替换为|换成)|'
    r'(?:更新|回填|写入|填入)\s*到\s*[^，。\n]*(?:预测|计划|实绩|表格|sheet|工作表|单元格)'
    r')',
    re.I
)

EXPORT_NEGATION_RE = re.compile(
    r'(?:'
    r'(?:不要|无需|不用|别|免去|严禁|禁止|暂不)\s*(?:导出|生成|保存|下载|落盘|输出|制作|做成|提供|交付)[^，。\n]*(?:文件|文档|表格|excel|word|pdf|ppt|xlsx|docx|html|图片|图表|附件)?|'
    r'(?:不|无|免)\s*(?:生成|导出|落盘|写出|下载)\s*(?:物理)?(?:文件|文档|表格|html|pdf|xlsx)|'
    r'只(?:在|需要|用)?(?:聊天|对话|正文|窗口|文本)(?:中|里)?(?:展示|解释|回答|呈现|列出|说明|输出)|'
    r'不生成文件|无需生成文件|不要生成文件|无需导出|不要导出|只在聊天中'
    r')',
    re.I
)

MUTATION_NEGATION_RE = re.compile(
    r'(?:'
    r'(?:不要|无需|不用|别|暂不|严禁|禁止)\s*(?:修改|更新|改动|调整|变更|填入|回填|覆盖|替换|触碰|动|删除|移除)[^，。\n]*(?:工作表|sheet|工作簿|表格|数据|单元格|文件)?|'
    r'(?:解释|说明|介绍|讨论|如何)\s*(?:更新|修改|调整|操作)|'
    r'暂不执行|不要修改|别改|别动|不用修改|不用更新'
    r')',
    re.I
)

CANCELLATION_OR_ABORT_RE = re.compile(
    r'(?:'
    r'^(?:请|请先|先)?\s*(?:取消|终止|放弃|不用了|算了|停止|暂停|别做|别改|别动|暂不|不要修改|不要更新)|'
    r'(?:请|请先|先)?\s*(?:取消|终止|放弃|停止|暂停)\s*(?:任务|操作|执行|更新|生成|修改|导出)?|'
    r'(?:先别|暂不|不要|别)\s*(?:修改|更新|执行|动|生成|导出|落盘|回填)|'
    r'只(?:是|在)?(?:问|咨询|讨论|了解|查看|解释)|'
    r'暂不执行|不用修改|不要做任何操作'
    r')',
    re.I
)


def is_cancellation_or_abort(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    # 排除取消特定口径、规则、筛选、条件的情况（例如“取消其过滤规则”、“取消限制条件”）
    if re.search(r'取消\s*(?:其|这些|原有|默认|的)?\s*(?:过滤|规则|口径|条件|限制|参数|排序|筛选)', text):
        return False
    return bool(CANCELLATION_OR_ABORT_RE.search(text.strip()))


def is_physical_export_negated(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    return bool(EXPORT_NEGATION_RE.search(text))


def has_physical_artifact_request(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    if is_physical_export_negated(text):
        return False
    return bool(PHYSICAL_EXPORT_RE.search(text) or VISUAL_EXPORT_RE.search(text))


def is_visual_artifact_requested(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    if is_physical_export_negated(text) and not re.search(r'(?:html|图片|png|svg|页面|看板|大屏)', text):
        return False
    return bool(VISUAL_EXPORT_RE.search(text))


def is_spreadsheet_mutation_requested(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    if MUTATION_NEGATION_RE.search(text):
        return False
    return bool(SPREADSHEET_MUTATION_RE.search(text))


def clean_dialogue_content(role: str, content: str) -> str:
    if not content or not isinstance(content, str):
        return ''
    c = content.strip()
    if '用户指令：' in c:
        c = c.split('用户指令：')[-1].strip()
    if role == 'assistant':
        # Remove code blocks (markdown ```...```)
        c = re.sub(r'```[\s\S]*?```', '', c)
        # Remove HTML tags
        c = re.sub(r'<[^>]+>', ' ', c)
        # Collapse multiple spaces / blank lines
        c = re.sub(r'[ \t\r\f\v]+', ' ', c)
        c = re.sub(r'\n\s*\n+', '\n', c).strip()
        return c[:400]
    return c[:600]


def is_condition_replacement_or_refinement(request: str, users: list) -> bool:
    if not request or not isinstance(request, str) or not users:
        return False
    if is_cancellation_or_abort(request):
        return False

    req_str = request.strip()
    # 1. Explicit replacement / refinement phrasing
    if re.search(r'^(?:再|另外|并且|而且|同时|接着|然后|顺便|重新|继续|修改为|改成|换成|改为|替换为|调整为)\b', req_str):
        return True
    if re.search(r'(?:只包含|仅包含|不包含|排除|只看|仅看|只要|只统计|重新按|替换为|改为|换成)', req_str):
        if any(re.search(r'(?:包含|不包含|排除|按.*统计|金额|合计|明细|工数|数据|记录)', u) for u in users[-2:]):
            return True

    # 2. Lexical / character overlap with recent user turn
    last_user = users[-1].strip()
    chars_curr = set(re.findall(r'[\u4e00-\u9fa5A-Za-z0-9]', req_str))
    chars_prev = set(re.findall(r'[\u4e00-\u9fa5A-Za-z0-9]', last_user))
    if chars_curr and chars_prev:
        overlap = len(chars_curr & chars_prev) / len(chars_curr)
        if overlap >= 0.55 and any(
            is_visual_artifact_requested(u) or has_physical_artifact_request(u)
            or is_spreadsheet_mutation_requested(u)
            or re.search(r'(?:统计|合计|计算|分析|汇总|筛选|明细|均值|平均)', u)
            for u in users[-2:]
        ):
            return True

    return False


INSTRUCTIONS = """仅根据用户当前请求和必要的用户历史提取任务契约，不考虑任何候选的默认行为。skill_names只提供可调用名称，帮助识别用户是否指定执行对象，不包含技能用途或规则。
instruction_relation分析当前请求与历史对话的关系：
- standalone：与前序对话无关联的全新独立任务（如提出完全不同的新业务领域、新问题、换了全新文件、或用户明确表示“开启新任务”）。独立任务的目标、范围与格式严格仅以当前请求为准，绝不继承历史对话中未重申的限定、条件或呈现格式（如历史上的“只要表格”、“无需解读”等修饰符已过期）。
- followup：对上一轮任务或其结果的明确延续、追加筛选（如“再加个条件”、“只要大于100的”）、筛选条件替换或参数调整（如在同一分析中将“不包含”改为“只包含”、调整过滤前缀或阈值）、追问（“为什么是这个结果”）、纠错重试、或回答助手的确认追问（如补充字段、确认口径、确认区块映射或写入单位）。当用户在同一会话中针对相同文件、数据源或同一分析维度调整参数或替换筛选条件时，属于延续和修正前序任务，必须判定为 followup，绝不能判定为 standalone！若上一轮已明确交付形式（如柱状图、可视化看板、导出表格），且本轮用户未显式要求切换格式（如明确要求“不要图表”或“只在聊天中输出”），应延续交付形式（output_mode 为 artifact，artifact_types 继承对应类型如 ['.html']），按新条件重新计算生成交付物！回答助手的追问属于延续执行，task_mode 必须为 execute，绝不能标记为 consult！若用户明确表示“取消任务”、“请先暂停”、“不要修改”、“别动”、“算了”、“放弃”等终止/拒绝意愿，必须尊重用户意愿，task_mode 必须为 consult，output_mode 必须为 conversation，不得执行或导出！
当前明确要求优先于历史。requirements逐项引用真实用户原话，记录目标、限制、条件和交付，不添加改进偏好。独立任务(standalone)的requirements只能引用当前请求中的原话，禁止从历史中拖拽已过期的修饰符。
task_mode=consult 表示解释或讨论某项能力/技能本身（如“什么是工数”，“这个技能怎么用”），或用户要求取消、暂停、停止操作；凡是回答追问、提供业务字段、统计或实际完成任务的，一律为 execute！
output_mode=conversation表示在对话中回答，含文字、Markdown表格、列出结果；若用户明确说明“不要导出文件”、“不生成文件”、“只在聊天中解释”等否定导出要求，output_mode 必须为 conversation，不得为 artifact！artifact用于用户在当前请求中明确要求生成、下载或导出物理文件的情况。对于要求在现有工作簿/文件中修改、更新、复制工作表(Sheet)、新建工作表(Sheet)、回填数值并保存的任务，属于必须生成/更新持久化交付物的更新任务，output_mode 必须为 artifact，artifact_types 为 ['.xlsx']！对于要求生成图表（如柱状图、折线图、饼图、雷达图、数据可视化大屏/看板）的任务，必须交付可视化组件或物理图表，output_mode 必须为 artifact，artifact_types 为 ['.html']！
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
独立核对section_confirmation：若用户当前请求是在回答助手关于区块映射的澄清追问（如【无偿】对应哪个候选表头），必须保留section_confirmation并将task_mode设为execute、instruction_relation设为followup。若用户明确表示“取消”、“暂停”、“放弃”等终止意愿，必须修正为 consult 与 conversation，绝不强制执行。
初稿可能有遗漏或扩大范围，不能因为结构有效就照抄。返回经过修正的完整任务契约，不输出审核说明。
特别检查：
1. 交付形式：对话中的表格是一种呈现形式，不等于Excel文件；只有当前请求中明确出现物理文件交付/导出/下载请求，或要求复制Sheet/新建Sheet/更新回填工作簿时才保留artifact。严禁把普通的“只要表格”当成.xlsx文件。若用户明确说明“不要导出文件”、“不生成文件”、“只在聊天中解释”，必须修正为 conversation 且 artifact_types 为空[]。
2. 历史隔离与延续：若指令是独立任务(standalone)，绝不能继承前序轮次已过期的格式要求（如“只要表格，无需解读”），requirements必须只来自本轮请求。未在本轮明确要求物理导出或工作簿更新的独立任务，output_mode必须修正为conversation且artifact_types为空[]。但若用户在同一分析任务中微调参数或替换筛选条件（如“不包含”改为“只包含”），必须修正为 followup 并延续图表/文件交付物要求，绝不能误判为 standalone 导致图表交付丢失。
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
                c = clean_dialogue_content(role, msg.get('content', ''))
                if c:
                    recent_dialogue.append({'role': role, 'content': c})

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

            # 取消/中止意图保全：用户明确叫停时严格保持 consult 与 conversation
            if is_cancellation_or_abort(request):
                result['task_mode'] = 'consult'
                result['output_mode'] = 'conversation'
                result['artifact_types'] = []
                result['unit_confirmation'] = None
                result['section_confirmation'] = None

            # Standalone Ephemeral Modifier Expiration & Mutation Promotion:
            # If standalone and no physical export requested in current prompt, enforce conversation mode.
            if result.get('instruction_relation') == 'standalone' and result['output_mode'] == 'artifact':
                if not has_physical_artifact_request(request) or is_physical_export_negated(request):
                    result['output_mode'] = 'conversation'
                    result['artifact_types'] = []
            elif is_spreadsheet_mutation_requested(request) and result.get('task_mode') == 'execute' and not is_physical_export_negated(request):
                result['output_mode'] = 'artifact'
                if not result.get('artifact_types'):
                    result['artifact_types'] = ['.xlsx']
                elif not any(t.lower().endswith(('.xlsx', '.xlsm', '.csv')) for t in result['artifact_types']):
                    result['artifact_types'].append('.xlsx')
            elif is_visual_artifact_requested(request) and result.get('task_mode') == 'execute' and not is_physical_export_negated(request):
                result['output_mode'] = 'artifact'
                if not result.get('artifact_types'):
                    result['artifact_types'] = ['.html']
                elif not any(t.lower().endswith(('.html', '.png', '.svg', '.jpg', '.jpeg', '.pdf')) for t in result['artifact_types']):
                    result['artifact_types'].append('.html')
            elif result.get('instruction_relation') == 'followup' and result.get('task_mode') == 'execute' and not is_physical_export_negated(request):
                if any(is_visual_artifact_requested(u) for u in [request, *users]):
                    result['output_mode'] = 'artifact'
                    if not result.get('artifact_types'):
                        result['artifact_types'] = ['.html']
                    elif not any(t.lower().endswith(('.html', '.png', '.svg', '.jpg', '.jpeg', '.pdf')) for t in result['artifact_types']):
                        result['artifact_types'].append('.html')
                elif any(is_spreadsheet_mutation_requested(u) for u in [request, *users]):
                    result['output_mode'] = 'artifact'
                    if not result.get('artifact_types'):
                        result['artifact_types'] = ['.xlsx']
                    elif not any(t.lower().endswith(('.xlsx', '.xlsm', '.csv')) for t in result['artifact_types']):
                        result['artifact_types'].append('.xlsx')

            if is_physical_export_negated(request):
                result['output_mode'] = 'conversation'
                result['artifact_types'] = []

            # 最终契约通过初审、复核并完成全部校验后，原子提交声明绑定
            if result.get('unit_confirmation') or result.get('section_confirmation'):
                from .user_declarations import bind_user_declarations
                bind_user_declarations({
                    'unit_confirmation': result.get('unit_confirmation'),
                    'section_confirmation': result.get('section_confirmation'),
                    'user_statements': [request, *users]
                })

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
        validate_section_confirmation, direct_section_reply
    )

    # 1. 检查用户是否明确表达取消、暂停或终止意图
    is_abort = is_cancellation_or_abort(request)
    if is_abort:
        result['task_mode'] = 'consult'
        result['output_mode'] = 'conversation'
        result['artifact_types'] = []
        result['unit_confirmation'] = None
        result['section_confirmation'] = None

    # Inspect last assistant turn in history to ground clarification follow-ups
    last_assistant = next((h.get('content', '') for h in reversed(history or []) if h.get('role') == 'assistant'), '')
    is_prev_stopped = bool(
        last_assistant and any(k in last_assistant for k in ("任务已由用户手动停止", "手动停止", "已停止", "cancelled"))
    )

    # 检查用户是否明确为轻量口令/仅回复特定文字要求（如：仅回复“取消后可以继续”）
    is_verbatim_reply = bool(re.search(r'^(?:仅回复|只回复|仅输出|只需回复|只回答)\b', request.strip()))
    if is_verbatim_reply or (is_prev_stopped and not re.search(r'(?:继续|重试|重新执行|按上次)', request)):
        result['instruction_relation'] = 'standalone'
        result['task_mode'] = 'consult'
        result['output_mode'] = 'conversation'
        result['artifact_types'] = []
        result['unit_confirmation'] = None
        result['section_confirmation'] = None
        result['skill_invocation'] = {'mode': 'none', 'name': '', 'replace_defaults': False}
        result['requirements'] = [{'id': 'req_direct', 'quote': request[:120]}]

    asked_section = None
    candidates = []
    if last_assistant and not is_prev_stopped and not is_verbatim_reply:
        m_sec = re.search(r'未找到名为【([^】]+)】的区块', last_assistant)
        if m_sec:
            asked_section = m_sec.group(1).strip()
        cands = re.findall(r'【([^】]+)】', last_assistant)
        candidates = [c for c in cands if c != asked_section]

    direct_sec = direct_section_reply(request, last_assistant) if not is_prev_stopped else None
    direct_u = direct_unit_reply(request) if not is_prev_stopped else None

    # 只有当用户没有表达取消/终止，且确实在积极响应澄清追问时，才认定为澄清响应
    is_clarification_response = False
    if not is_abort and not is_prev_stopped and not is_verbatim_reply:
        if result.get('section_confirmation') or direct_sec or direct_u:
            is_clarification_response = True
        elif last_assistant and ('请确认' in last_assistant or '未找到名为' in last_assistant or '本次尚未生成更新文件' in last_assistant):
            is_affirmative = bool(re.search(r'^(?:是|确认|对|好的|可以|是的|确定|同意|就按|按|行)\b', request.strip()))
            is_clarification_response = is_affirmative or bool(direct_sec or direct_u) or (
                result.get('task_mode') == 'execute' and not is_cancellation_or_abort(request)
            )

    # Enforce followup and task execution lock when answering an active clarification prompt
    if is_clarification_response and users and not is_abort and not is_prev_stopped and not is_verbatim_reply:
        result['instruction_relation'] = 'followup'
        result['task_mode'] = 'execute'
        if any(is_spreadsheet_mutation_requested(u) for u in [request, *users]) and not is_physical_export_negated(request):
            result['output_mode'] = 'artifact'
            if not result.get('artifact_types'):
                result['artifact_types'] = ['.xlsx']
            elif not any(t.lower().endswith(('.xlsx', '.xlsm', '.csv')) for t in result['artifact_types']):
                result['artifact_types'].append('.xlsx')

    # Enforce followup and deliverable inheritance when continuing or replacing criteria of previous analysis
    is_continuation = not is_abort and not is_prev_stopped and not is_verbatim_reply and bool(users) and is_condition_replacement_or_refinement(request, users)
    if is_continuation:
        result['instruction_relation'] = 'followup'
        result['task_mode'] = 'execute'
        if any(is_visual_artifact_requested(u) for u in [request, *users]) and not is_physical_export_negated(request):
            result['output_mode'] = 'artifact'
            if not result.get('artifact_types'):
                result['artifact_types'] = ['.html']
            elif not any(t.lower().endswith(('.html', '.png', '.svg', '.jpg', '.jpeg', '.pdf')) for t in result['artifact_types']):
                result['artifact_types'].append('.html')
        elif any(is_spreadsheet_mutation_requested(u) for u in [request, *users]) and not is_physical_export_negated(request):
            result['output_mode'] = 'artifact'
            if not result.get('artifact_types'):
                result['artifact_types'] = ['.xlsx']
            elif not any(t.lower().endswith(('.xlsx', '.xlsm', '.csv')) for t in result['artifact_types']):
                result['artifact_types'].append('.xlsx')

    relation = result.setdefault('instruction_relation', 'standalone')
    if relation not in {'standalone', 'followup'}:
        raise ValueError('指令关系无效')

    # Resolve direct declarations
    if relation == 'followup' and not is_abort:
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

    # Answering clarification question or providing metric criteria in followup is execution, not consultation
    if relation == 'followup' and result.get('task_mode') == 'consult' and not is_abort:
        if not re.search(r'(?:怎么用|是什么|为什么|解释.*技能|讨论|如何使用|原理|定义|介绍|暂不|取消|暂停|别)', request):
            result['task_mode'] = 'execute'

    if is_spreadsheet_mutation_requested(request) and result.get('task_mode') == 'execute' and not is_physical_export_negated(request):
        result['output_mode'] = 'artifact'
        if not result.get('artifact_types'):
            result['artifact_types'] = ['.xlsx']
        elif not any(t.lower().endswith(('.xlsx', '.xlsm', '.csv')) for t in result['artifact_types']):
            result['artifact_types'].append('.xlsx')
    elif is_visual_artifact_requested(request) and result.get('task_mode') == 'execute' and not is_physical_export_negated(request):
        result['output_mode'] = 'artifact'
        if not result.get('artifact_types'):
            result['artifact_types'] = ['.html']
        elif not any(t.lower().endswith(('.html', '.png', '.svg', '.jpg', '.jpeg', '.pdf')) for t in result['artifact_types']):
            result['artifact_types'].append('.html')
    elif (relation == 'followup' or is_continuation) and result.get('task_mode') == 'execute' and not is_physical_export_negated(request):
        if any(is_visual_artifact_requested(u) for u in [request, *users]):
            result['output_mode'] = 'artifact'
            if not result.get('artifact_types'):
                result['artifact_types'] = ['.html']
            elif not any(t.lower().endswith(('.html', '.png', '.svg', '.jpg', '.jpeg', '.pdf')) for t in result['artifact_types']):
                result['artifact_types'].append('.html')
        elif any(is_spreadsheet_mutation_requested(u) for u in [request, *users]):
            result['output_mode'] = 'artifact'
            if not result.get('artifact_types'):
                result['artifact_types'] = ['.xlsx']
            elif not any(t.lower().endswith(('.xlsx', '.xlsm', '.csv')) for t in result['artifact_types']):
                result['artifact_types'].append('.xlsx')

    if is_physical_export_negated(request):
        result['output_mode'] = 'conversation'
        result['artifact_types'] = []

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
            if is_continuation:
                relation = 'followup'
                result['instruction_relation'] = 'followup'
            elif allow_sanitize:
                continue
            else:
                raise ValueError(f'当前指令判定为独立任务(standalone)，任务要求"{item.get("quote")}"来自历史对话；独立任务的 requirements 只能引用当前请求中的原话')
        item['quote'] = quote_in_request if relation == 'standalone' else quote
        seen.add(item['id'])
        valid_requirements.append(item)

    if not valid_requirements:
        if relation == 'followup' and users and not is_prev_stopped and not is_verbatim_reply:
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

    # 只有当契约全部字段校验通过、无任何异常后，才执行声明绑定
    if result.get('unit_confirmation') or result.get('section_confirmation'):
        from .user_declarations import bind_user_declarations
        bind_user_declarations({
            'unit_confirmation': result.get('unit_confirmation'),
            'section_confirmation': result.get('section_confirmation'),
            'user_statements': [request, *users]
        })

    return result
