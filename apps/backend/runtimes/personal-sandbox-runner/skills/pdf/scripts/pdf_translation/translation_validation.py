"""Validate translations independently of model success claims."""
from collections import Counter
import re
import unicodedata

from .contracts import TranslationError, text_units, validate_ir

MONTH_MAP = {
    'january': '1', 'jan': '1',
    'february': '2', 'feb': '2',
    'march': '3', 'mar': '3',
    'april': '4', 'apr': '4',
    'may': '5',
    'june': '6', 'jun': '6',
    'july': '7', 'jul': '7',
    'august': '8', 'aug': '8',
    'september': '9', 'sep': '9', 'sept': '9',
    'october': '10', 'oct': '10',
    'november': '11', 'nov': '11',
    'december': '12', 'dec': '12',
}

ORDINAL_MAP = {
    'first': '1', '1st': '1',
    'second': '2', '2nd': '2',
    'third': '3', '3rd': '3',
    'fourth': '4', '4th': '4',
    'fifth': '5', '5th': '5',
}


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text) if c.isalnum())


def numbers(text):
    s = unicodedata.normalize('NFKC', text)
    s = re.sub(r',(?!\d{3}(?:\D|$))', ' ', s)
    return Counter(re.findall(r'\d+(?:\.\d+)?', s))


def numbers_detail(source, translated):
    src_nums = numbers(source)
    trans_nums = numbers(translated)
    src_norm = Counter({(k.lstrip('0') or '0'): v for k, v in src_nums.items()})
    trans_norm = Counter({(k.lstrip('0') or '0'): v for k, v in trans_nums.items()})
    missing = list((src_norm - trans_norm).elements())
    extra = list((trans_norm - src_norm).elements())
    return (f"numeric values changed: missing numbers from source: {missing}; "
            f"unexpected numbers: {extra}. Preserve the numbers, dates and metric suffixes in this source block.")


def numbers_compatible(source, translated):
    src_nums = numbers(source)
    trans_nums = numbers(translated)
    if src_nums == trans_nums:
        return True
    # 规范化去除纯整数前导 0
    src_norm = Counter({(k.lstrip('0') or '0'): v for k, v in src_nums.items()})
    trans_norm = Counter({(k.lstrip('0') or '0'): v for k, v in trans_nums.items()})
    if src_norm == trans_norm:
        return True

    diff = trans_norm - src_norm
    src_lower = source.lower()
    expected_extra_nums = set()
    for month_word, month_num in MONTH_MAP.items():
        if re.search(r'\b' + month_word + r'\b', src_lower):
            expected_extra_nums.add(month_num)
    for ord_word, ord_num in ORDINAL_MAP.items():
        if re.search(r'\b' + ord_word + r'\b', src_lower):
            expected_extra_nums.add(ord_num)

    remaining_diff = Counter(diff)
    for num in list(remaining_diff.keys()):
        if num in expected_extra_nums:
            del remaining_diff[num]

    missing = src_norm - trans_norm
    CN_NUM_WORDS = {
        '1': ('一', '壹'),
        '2': ('二', '两', '俩', '贰'),
        '3': ('三', '仨', '叁'),
        '4': ('四', '肆'),
        '5': ('五', '伍'),
        '6': ('六', '陆'),
        '7': ('七', '柒'),
        '8': ('八', '捌'),
        '9': ('九', '玖'),
        '10': ('十', '拾'),
        '11': ('十一',),
    }
    remaining_missing = Counter(missing)
    for num in list(remaining_missing.keys()):
        words = CN_NUM_WORDS.get(num, ())
        if isinstance(words, str):
            words = (words,)
        if any(w in translated for w in words):
            del remaining_missing[num]

    if not remaining_diff and not remaining_missing:
        return True
    return False


def is_literal_or_command(text):
    if not isinstance(text, str):
        return False
    s = text.strip()
    if not s:
        return True
    s_clean = re.sub(r'^[$#]\s*', '', s)
    if re.match(r'^(?:docker|git|pip\d?|npm|npx|yarn|pnpm|curl|wget|python\d?|conda|apt(?:-get)?|brew|sudo|bash|sh|make|tar|chmod|chown)\s+', s_clean, re.I):
        return True
    if re.match(r'^(?:(?:\.|\.\.|~)?/[\w.-]+|[\w.-]+\.(?:py|sh|json|yaml|yml|md|txt|cpp|h|c|ts|js|html|css|xml|tex))$', s, re.I):
        return True
    if re.match(r'^(?:import\s+\w+|from\s+\w+\s+import|export\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*)', s):
        return True
    if re.fullmatch(r'[\d\s.,%+−✓✔✗×/²³⁰¹⁴⁵⁶⁷⁸⁹†‡*()-]+', s):
        return True
    if re.fullmatch(r'[A-Z]{2,}\d*', s) or re.fullmatch(r'[a-z]+(?:_[a-z0-9]+)+', s):
        return True
    return False


def is_proper_or_brand(text):
    """判断是否为品牌名、产品名、专有名词短语（如 IMT: Immersive Translate PDF Pro.）"""
    if not isinstance(text, str):
        return False
    if re.fullmatch(r'[A-Z][a-z]+(?:-[a-z]+|\d+)', text.strip()):
        return False  # Ordinary hyphenated words and labels with footnote numbers.
    s = re.sub(r'[^\w\s]', '', text).strip()
    if not s:
        return True
    words = s.split()
    if len(words) <= 6:
        is_all_capitalized = True
        for w in words:
            if w.lower() in ('for', 'of', 'and', 'in', 'on', 'with', 'by', 'v1', 'v2', 'v3', 'v4'):
                continue
            if not (w[0].isupper() or w[0].isdigit()):
                is_all_capitalized = False
                break
        if is_all_capitalized:
            return True
    return False


def needs_translation(text):
    stripped = re.sub(r'https?://\S+|\b[\w.+-]+@[\w.-]+\b', '', text)
    if is_literal_or_command(stripped):
        return False
    # Numeric cells, check marks, acronyms and formulas are literal values, not failed translations.
    return bool(re.search(r'[A-Za-z]{2,}[a-z]|[\u3040-\u30ff\u4e00-\u9fff]', stripped))


def validate_value(source, translated, lang, strict_numbers=True):
    """Check source facts and language before the independent visual review."""
    if not isinstance(translated, str) or not translated.strip():
        return 'missing or empty translated string'
    if '\ufffd' in translated or '\x00' in translated:
        return 'invalid characters'
    if strict_numbers and not numbers_compatible(source, translated):
        return 'numeric values changed'
    if is_literal_or_command(source) and source.strip() != translated.strip():
        return 'literal or command changed'
    for link in re.findall(r'https?://[^\s<>]+', source):
        if link.rstrip('.,;)') not in translated:
            return 'URL changed'
    if needs_translation(source):
        if is_literal_or_command(translated):
            return None
        if normalize(source) == normalize(translated):
            if is_proper_or_brand(source):
                return None
            return 'source text returned unchanged'
        if lang.lower().startswith(('zh', 'cn')) and re.search(r'[a-z]{4,}', source):
            if not re.search(r'[\u4e00-\u9fff]', translated):
                if is_proper_or_brand(source):
                    return None
                return 'Chinese translation missing'
        if lang.lower().startswith('ja') and re.search(r'[a-z]{4,}', source):
            if not re.search(r'[\u3040-\u30ff\u4e00-\u9fff]', translated):
                if is_proper_or_brand(source):
                    return None
                return 'Japanese translation missing'
    return None


def validate_translation(ir, lang):
    validate_ir(ir)
    expected = list(text_units(ir))
    results = ir.get('translations', {})
    errors = {n['id']: validate_value(n['text'], results.get(n['id']), lang) for n in expected}
    errors = {k: v for k, v in errors.items() if v}
    if set(results) - {n['id'] for n in expected}:
        errors['unexpected_ids'] = 'unknown translation IDs'
    return {'valid': not errors, 'expected_ids': [n['id'] for n in expected],
            'translated_ids': sorted(results), 'errors': errors,
            'exempt_ids': [n['id'] for n in ir['nodes'] if n['type'] in
                           ('author', 'formula', 'furniture', 'reference')]}
