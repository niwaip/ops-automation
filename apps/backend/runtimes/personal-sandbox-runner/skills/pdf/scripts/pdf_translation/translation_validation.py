"""Validate translations independently of model success claims."""
from collections import Counter
import re
import unicodedata

from .contracts import TranslationError, is_formula, text_units, validate_ir

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
    'sixth': '6', '6th': '6',
    'seventh': '7', '7th': '7',
    'eighth': '8', '8th': '8',
    'ninth': '9', '9th': '9',
    'tenth': '10', '10th': '10',
}

CARDINAL_WORDS = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
    'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14', 'fifteen': '15',
    'sixteen': '16', 'seventeen': '17', 'eighteen': '18', 'nineteen': '19',
    'twenty': '20', 'thirty': '30', 'forty': '40', 'fifty': '50',
    'sixty': '60', 'seventy': '70', 'eighty': '80', 'ninety': '90',
    'hundred': '100', 'thousand': '1000', 'million': '1000000', 'billion': '1000000000',
}
TENS = {'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90}
ONES = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9}
EN_NUM_WORDS = dict(CARDINAL_WORDS)
for t_word, t_val in TENS.items():
    for o_word, o_val in ONES.items():
        EN_NUM_WORDS[f'{t_word}-{o_word}'] = str(t_val + o_val)
        EN_NUM_WORDS[f'{t_word} {o_word}'] = str(t_val + o_val)


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text) if c.isalnum())


def _canonical_num_token(tok):
    try:
        val = float(tok)
        if val.is_integer() and abs(val) < 1e15:
            return str(int(val))
        return f"{val:.10g}"
    except (ValueError, OverflowError):
        return tok.lstrip('0') or '0'


def numbers(text):
    s = unicodedata.normalize('NFKC', text)
    # Strip PDF font CID glyph markers e.g. (cid:80)
    s = re.sub(r'\(cid:\d+\)', ' ', s)
    # Remove thousands separators e.g. 1,000 -> 1000
    s = re.sub(r'(?<=\d),(?=\d{3}(?:\D|$))', '', s)
    # Extract numbers including scientific notation
    raw_nums = re.findall(r'\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\d+', s)
    c = Counter()
    for tok in raw_nums:
        c[_canonical_num_token(tok)] += 1
    return c


def numbers_detail(source, translated):
    src_norm = numbers(source)
    trans_norm = numbers(translated)
    missing = list((src_norm - trans_norm).elements())
    extra = list((trans_norm - src_norm).elements())
    return (f"numeric values changed: missing numbers from source: {missing}; "
            f"unexpected numbers: {extra}. Preserve the numbers, dates and metric suffixes in this source block.")


def numbers_compatible(source, translated):
    src_norm = numbers(source)
    trans_norm = numbers(translated)
    if src_norm == trans_norm:
        return True

    CN_NUM_WORDS = {
        '0': ('零', '〇'),
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
        '12': ('十二',),
        '20': ('二十', '廿'),
        '30': ('三十', '卅'),
        '40': ('四十',),
        '50': ('五十',),
        '60': ('六十',),
        '70': ('七十',),
        '80': ('八十',),
        '90': ('九十',),
        '100': ('一百', '百'),
        '1000': ('一千', '千'),
        '10000': ('一万', '万'),
        '100000000': ('一亿', '亿'),
    }

    diff = trans_norm - src_norm
    src_lower = source.lower()
    expected_extra_counts = Counter()
    for month_word, month_num in MONTH_MAP.items():
        matches = len(re.findall(r'\b' + month_word + r'\b', src_lower))
        if matches:
            expected_extra_counts[month_num] += matches
    for ord_word, ord_num in ORDINAL_MAP.items():
        matches = len(re.findall(r'\b' + ord_word + r'\b', src_lower))
        if matches:
            expected_extra_counts[ord_num] += matches

    # English cardinal number words in source (e.g. "Forty" -> "40", "twenty-one" -> "21")
    src_check = src_lower
    for word in sorted(EN_NUM_WORDS.keys(), key=lambda w: (-len(w), w)):
        num_str = EN_NUM_WORDS[word]
        pattern = r'(?<!-)\b' + re.escape(word) + r'\b(?!-)' if '-' not in word else r'\b' + re.escape(word) + r'\b'
        matches = len(re.findall(pattern, src_check))
        if matches:
            expected_extra_counts[num_str] += matches
            src_check = re.sub(pattern, ' ', src_check)

    remaining_diff = Counter(diff)
    for num, exp_count in expected_extra_counts.items():
        if num in remaining_diff:
            remaining_diff[num] = max(0, remaining_diff[num] - exp_count)
            if remaining_diff[num] == 0:
                del remaining_diff[num]

    for num in list(remaining_diff.keys()):
        words = CN_NUM_WORDS.get(num, ())
        if isinstance(words, str):
            words = (words,)
        word_count = sum(source.count(w) for w in words)
        if word_count > 0:
            remaining_diff[num] = max(0, remaining_diff[num] - word_count)
            if remaining_diff[num] == 0:
                del remaining_diff[num]

    missing = src_norm - trans_norm
    remaining_missing = Counter(missing)
    for num in list(remaining_missing.keys()):
        words = CN_NUM_WORDS.get(num, ())
        if isinstance(words, str):
            words = (words,)
        word_count = sum(translated.count(w) for w in words)
        if word_count > 0:
            remaining_missing[num] = max(0, remaining_missing[num] - word_count)
            if remaining_missing[num] == 0:
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
    if is_formula(s):
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
    if not re.search(r'\s', s) and re.fullmatch(r'[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+', s) and not s.endswith('.'):
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
        # Common English grammatical words indicating an ordinary sentence rather than a brand/proper name
        first_lower = words[0].lower()
        if first_lower in ('this', 'that', 'these', 'those', 'there', 'here', 'we', 'they', 'you', 'it', 'what', 'why', 'how', 'if', 'when'):
            return False
        if any(w.lower() in ('is', 'are', 'was', 'were', 'has', 'have', 'had', 'does', 'did', 'cannot', 'could', 'should', 'would') for w in words):
            return False
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
    stripped = re.sub(r'\(cid:\d+\)', ' ', stripped)
    if is_literal_or_command(stripped) or is_formula(stripped):
        return False
    # Numeric cells, check marks, acronyms and formulas are literal values, not failed translations.
    return bool(re.search(r'[A-Za-z]{2,}[a-z]|[\u3040-\u30ff\u4e00-\u9fff]', stripped))


def _clean_url(url: str) -> str:
    return re.sub(r'[\s.,;:!?()\[\]{}。，；：！？“”‘’（）《》「」『』、]+$', '', str(url or ''))


def _canonical_url_parts(url: str):
    raw = _clean_url(url)
    try:
        from urllib.parse import urlparse
        p = urlparse(raw)
        return p.netloc.lower(), p.path.rstrip('/'), raw
    except Exception:
        return '', raw, raw


def _urls_compatible(src_url: str, trans_urls) -> bool:
    if isinstance(trans_urls, str):
        trans_urls = [trans_urls]
    if src_url in trans_urls:
        return True
    s_netloc, s_path, _ = _canonical_url_parts(src_url)
    if not s_netloc:
        return False
    for t_link in trans_urls:
        t_netloc, t_path, _ = _canonical_url_parts(t_link)
        if s_netloc == t_netloc:
            if s_path == t_path:
                return True
            if s_path.startswith(t_path + '/') or t_path.startswith(s_path + '/'):
                excess = s_path[len(t_path):].strip('/') or t_path[len(s_path):].strip('/')
                if len(excess) <= 4:
                    return True
    return False


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
    src_urls = [_clean_url(link) for link in re.findall(r'https?://[^\s<>]+', source)]
    trans_urls = {_clean_url(link) for link in re.findall(r'https?://[^\s<>]+', translated)}
    for link in src_urls:
        if not _urls_compatible(link, trans_urls):
            return 'URL changed'
    src_set = set(src_urls)
    for link in trans_urls:
        if not _urls_compatible(link, src_set):
            return 'URL changed'
    if needs_translation(source):
        if is_literal_or_command(translated):
            if is_literal_or_command(source) or len(source.strip().split()) <= 2:
                return None
            return 'source text returned truncated literal'
        if normalize(source) == normalize(translated):
            if is_proper_or_brand(source) or is_formula(source):
                return None
            if re.match(r'^\[\d+\]\s+[A-Z]', source) and re.search(r'https?://|doi|arxiv', source, re.I):
                return None
            norm = normalize(source)
            if len(norm) <= 4 and re.search(r'[\u4e00-\u9fff]', source):
                if lang.lower().startswith(('ja', 'zh', 'cn')):
                    return None
            if len(norm) <= 1:
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
                           ('author', 'formula', 'furniture', 'reference')
                           or (n.get('type') == 'figure' and n.get('asset') and is_formula(n.get('text', '')))]}
