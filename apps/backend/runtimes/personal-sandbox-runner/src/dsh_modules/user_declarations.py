"""Ground semantically reviewed user declarations; never trust a tool's own assertion."""
import copy
import re
from contextvars import ContextVar

from .semantic_decision import ground_user_quote
from .spreadsheet_units import AMOUNT_UNIT_FACTORS, normalize_unit

_UNIT_CONFIRMATION = ContextVar('user_unit_confirmation', default=None)
_SECTION_CONFIRMATION = ContextVar('user_section_confirmation', default=None)

_ALIASES = set(AMOUNT_UNIT_FACTORS) | {'yuan', 'hours', '小时', 'h'}
SUPPORTED_UNITS = sorted(_ALIASES)
_UNIT_PATTERN = re.compile('|'.join(
    (r'(?<![A-Za-z])' + re.escape(alias) + r'(?![A-Za-z])') if alias.isascii()
    else re.escape(alias) for alias in sorted(_ALIASES, key=lambda value: (-len(value), value))))
_UNIT_REPLY = re.compile(r'\s*(?:单位\s*[:：为是]?\s*)?(' + '|'.join(
    re.escape(alias) for alias in sorted(_ALIASES, key=lambda value: (-len(value), value)))
    + r')\s*(?:单位)?[。.!！]?\s*')


def direct_unit_reply(request):
    """A complete unit-only user answer is a declaration, not a model inference."""
    if not request or not isinstance(request, str):
        return None
    match = _UNIT_REPLY.fullmatch(request.strip())
    return {'unit': normalize_unit(match.group(1)), 'quote': request.strip()} if match else None


def direct_section_reply(request, assistant_question=None):
    """Fallback candidate-driven matcher when LLM extraction is unavailable."""
    if not request or not isinstance(request, str):
        return None
    req = request.strip()
    if '用户指令：' in req:
        req = req.split('用户指令：')[-1].strip()

    asked_section = None
    candidates = []
    if assistant_question:
        m_sec = re.search(r'未找到名为【([^】]+)】的区块', assistant_question)
        if m_sec:
            asked_section = m_sec.group(1).strip()
        candidates = re.findall(r'【([^】]+)】', assistant_question)
        if asked_section and asked_section in candidates:
            candidates.remove(asked_section)

    clean_norm = lambda s: re.sub(r'[\s（）()/*_\-就是为对应即指]+', '', str(s or '').lower())
    norm_req = clean_norm(req)

    # Check for direct rejection / negation first
    negation_words = ('不要', '别', '不用', '不确认', '取消', '不是', '不选', '不使用', '没有')
    if any(nw in norm_req for nw in negation_words):
        return None

    # Candidate-Driven matching only: if user text contains candidate tokens
    if candidates:
        for cand in candidates:
            norm_cand = clean_norm(cand)
            if norm_cand and (norm_cand in norm_req or norm_req in norm_cand):
                sec = asked_section or ''
                return {'section': sec, 'target_title': cand, 'quote': req}

    return None


def validate_unit_confirmation(value, user_texts):
    """The intent extractor/reviewer supplies semantics; raw user spans supply evidence."""
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {'unit', 'quote'}:
        raise ValueError('单位确认必须包含单位及用户原话')
    unit = value['unit']
    if not isinstance(unit, str) or unit not in _ALIASES:
        raise ValueError('用户确认的单位未受支持')
    quote = ground_user_quote(value['quote'], user_texts)
    if quote is None or normalize_unit(unit) not in {
            normalize_unit(match.group()) for match in _UNIT_PATTERN.finditer(quote)}:
        raise ValueError('单位确认缺少对应的用户原话依据')
    return {'unit': normalize_unit(unit), 'quote': quote}


def validate_section_confirmation(value, user_texts, candidates=None):
    """Validate user section mapping confirmation grounded in user statements."""
    if value is None:
        return None
    if isinstance(value, dict):
        if 'section' in value and 'target_title' in value:
            items = [value]
        else:
            items = list(value.values())
    elif isinstance(value, list):
        items = value
    else:
        items = []
    validated = {}
    clean_norm = lambda s: re.sub(r'[\s（）()/*_\-]+', '', str(s or '').lower())
    for item in items:
        if not isinstance(item, dict) or not item.get('section') or not item.get('target_title'):
            continue
        quote = item.get('quote') or ""
        grounded_quote = ground_user_quote(quote, user_texts) if quote else None
        if quote and not grounded_quote:
            # Ungrounded/forged quote not present in user conversation text; reject
            continue
        section = str(item['section']).strip()
        target_title = str(item['target_title']).strip()
        if candidates:
            norm_target = clean_norm(target_title)
            for cand in candidates:
                norm_cand = clean_norm(cand)
                if norm_target == norm_cand or norm_target in norm_cand or norm_cand in norm_target:
                    target_title = cand
                    break
        validated[section] = {
            'section': section,
            'target_title': target_title,
            'quote': grounded_quote or quote
        }
    return validated or None


def bind_user_declarations(context=None):
    """Called only with the server's reviewed contract and original user statements."""
    context = context or {}
    user_texts = context.get('user_statements', [])
    u_decl = validate_unit_confirmation(context.get('unit_confirmation'), user_texts)
    s_decl = validate_section_confirmation(context.get('section_confirmation'), user_texts)
    _UNIT_CONFIRMATION.set(u_decl)
    _SECTION_CONFIRMATION.set(s_decl)

    # Persist validated section mappings to domain memory
    if s_decl:
        try:
            from .config import WORKSPACE_DIR
            from .domain_memory import save_section_mapping
            ws_dir = context.get('workspace') or WORKSPACE_DIR
            target_f = context.get('target_file') or context.get('target_file_name')
            for sec_name, conf in s_decl.items():
                save_section_mapping(
                    section_name=sec_name,
                    target_title=conf['target_title'],
                    file_hash=context.get('target_file_hash'),
                    file_name=target_f,
                    quote=conf.get('quote'),
                    workspace=ws_dir
                )
        except Exception:
            pass

    return {'unit': u_decl, 'sections': s_decl}


def unit_confirmation():
    return copy.deepcopy(_UNIT_CONFIRMATION.get())


def section_confirmation():
    return copy.deepcopy(_SECTION_CONFIRMATION.get())
