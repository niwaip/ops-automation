"""Ground semantically reviewed user declarations; never trust a tool's own assertion."""
import copy
import re
from contextvars import ContextVar

from .semantic_decision import ground_user_quote
from .spreadsheet_units import AMOUNT_UNIT_FACTORS, normalize_unit

_UNIT_CONFIRMATION = ContextVar('user_unit_confirmation', default=None)
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
    match = _UNIT_REPLY.fullmatch(request)
    return {'unit': normalize_unit(match.group(1)), 'quote': request.strip()} if match else None


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


def bind_user_declarations(context=None):
    """Called only with the server's reviewed contract and original user statements."""
    context = context or {}
    declaration = validate_unit_confirmation(context.get('unit_confirmation'),
                                             context.get('user_statements', []))
    _UNIT_CONFIRMATION.set(declaration)
    return declaration


def unit_confirmation():
    return copy.deepcopy(_UNIT_CONFIRMATION.get())
