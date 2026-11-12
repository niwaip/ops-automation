"""PPTX task routing, deterministic in-place translation workflow, and OOXML quality gate."""

import hashlib
import importlib.util
import json
import os
import re
import shutil
from types import SimpleNamespace
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from xml.etree import ElementTree as ET

from .tool_result import ToolResult

PPTX_IN_PLACE_TRANSLATION_CUE_RE = re.compile(
    r'翻译|日文版|日语版|英文版|英语版|中文版|法文版|德文版|韩文版|本地化|多语言|'
    r'译成|译为|翻成|\btranslat(?:e|ion|ing)?\b|\blocaliz(?:e|ation)\b',
    re.I,
)

_PRESERVE_FORMAT_CUE_RE = re.compile(
    r'保持(?:原)?(?:有)?(?:的)?(?:格式|版式)|保留(?:原)?(?:有)?(?:的)?(?:格式|版式)|'
    r'格式不变|版式不变|preserve\s+(?:the\s+)?(?:original\s+)?format|keep\s+(?:the\s+)?(?:original\s+)?format',
    re.I,
)

_NEG_PRESERVE_RE = re.compile(
    r'(?:不要|无需|不用|不必|不要求|do not|without)\s*(?:保持|保留|保存|keep|preserv)',
    re.I,
)

_PPTX_LANGUAGE_TABLE = (
    (re.compile(r'英文|英语|\benglish\b|\ben(?:-us|-gb)?\b', re.I), 'en-US', 'Calibri'),
    (re.compile(r'日文|日语|日本語|\bjapanese\b|\bja(?:-jp)?\b', re.I), 'ja-JP', 'Yu Gothic'),
    (re.compile(r'中文|简体中文|汉语|\bchinese\b|\bzh(?:-cn)?\b', re.I), 'zh-CN', 'Microsoft YaHei'),
    (re.compile(r'韩文|韩语|\bkorean\b|\bko(?:-kr)?\b', re.I), 'ko-KR', 'Malgun Gothic'),
    (re.compile(r'法文|法语|\bfrench\b|\bfr(?:-fr)?\b', re.I), 'fr-FR', 'Calibri'),
    (re.compile(r'德文|德语|\bgerman\b|\bde(?:-de)?\b', re.I), 'de-DE', 'Calibri'),
)

_A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
_NS = {'a': _A_NS}
_CJK_RE = re.compile(r'[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]')
_ZH_SIMPLIFIED_RESIDUAL_RE = re.compile(r'[云业为从优构图网边鉴权护设备资审联闭环统览据库检识应处开实转软节简录频译议签问线层]')
_FILL_TAGS = {'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'}


def _strip_prompt_header(prompt: Optional[str]) -> str:
    return (prompt or '').split('用户指令：')[-1].strip()


def translation_language(prompt: Optional[str]) -> Optional[str]:
    """Resolves target BCP-47 language tag from user instruction."""
    request = _strip_prompt_header(prompt)
    if not request:
        return None
    best_pos = -1
    best_lang: Optional[str] = None
    for pat, lang_code, _ in _PPTX_LANGUAGE_TABLE:
        for m in pat.finditer(request):
            if m.start() >= best_pos:
                best_pos = m.start()
                best_lang = lang_code
    return best_lang


def pptx_translation_command_hint(prompt: Optional[str]) -> Tuple[str, str]:
    """Returns (--lang, --font) pair matching the requested target language."""
    lang = translation_language(prompt) or 'ja-JP'
    for _, code, font in _PPTX_LANGUAGE_TABLE:
        if code == lang:
            return code, font
    return lang, 'Calibri'


def preserves_pptx_format(prompt: Optional[str]) -> bool:
    request = _strip_prompt_header(prompt)
    if not request or _NEG_PRESERVE_RE.search(request):
        return False
    return bool(_PRESERVE_FORMAT_CUE_RE.search(request))


def is_pptx_in_place_transform_task(prompt: str, skill: Any = None, files: Optional[List[str]] = None) -> bool:
    """Returns True when transforming/translating an existing PPTX while keeping layout intact."""
    from .skill_router import is_text_only_request

    if is_text_only_request(prompt):
        return False
    files = files or []
    source_fmts = getattr(skill, 'source_formats', None) or [Path(f).suffix.lower() for f in files]
    if not any(fmt in ('.pptx', '.ppt') for fmt in source_fmts):
        if not re.search(r'\.(?:pptx?)\b', prompt or '', re.I):
            return False

    request = _strip_prompt_header(prompt)
    contract = getattr(skill, 'task_contract', None) or {}
    quotes = ' '.join(r.get('quote', '') for r in (contract.get('requirements') or []))
    combined = f"{request} {quotes}"
    return bool(PPTX_IN_PLACE_TRANSLATION_CUE_RE.search(combined) or preserves_pptx_format(combined))


PPTX_IN_PLACE_TRANSLATE_INSTRUCTION = """
【已有 PPTX 高保真翻译与多语言替换硬性规范】
保留原演示文稿版式、母版、组合图形、颜色与字体大小，使用沙箱内置 OOXML 翻译引擎处理，严禁 `Presentation()` 从空白重绘或手写 `python-pptx` 循环/长字典。
命令：`python3 /opt/dsh/skills/pptx/scripts/ooxml_translate.py auto "<输入.pptx>" "/workspace/<输出.pptx>" --lang <目标语言>`
交付前必须检查所有形状及组合图形（含 `p:grpSp`）内无未翻源语言残留，并核验字号颜色属性完整。
"""


def _has_cross_format_target(request: str, deliverables: Optional[List[str]] = None) -> bool:
    if re.search(
        r'(?<![A-Za-z])(?:pdf|word|docx?|xlsx?|excel|html|markdown|txt)(?![A-Za-z])|\.md\b|纯文本',
        request,
        re.I,
    ):
        return True
    for item in (deliverables or []):
        if not str(item).lower().endswith(('.pptx', '.ppt')):
            return True
    return False


def fixed_pptx_translation(prompt: str, files: Optional[List[str]], deliverables: Optional[List[str]] = None) -> bool:
    """Returns True when a single-PPTX whole-deck translation should run deterministically via ooxml_translate.py."""
    from .skill_router import is_text_only_request
    from .task_intent import is_physical_export_negated

    if not prompt or len(files or []) != 1:
        return False
    if Path(files[0]).suffix.lower() != '.pptx':
        return False
    request = _strip_prompt_header(prompt)
    if is_text_only_request(prompt) or is_physical_export_negated(request):
        return False
    if not PPTX_IN_PLACE_TRANSLATION_CUE_RE.search(request):
        return False
    if translation_language(prompt) is None:
        return False
    if _has_cross_format_target(request, deliverables):
        return False
    if re.search(r'(?:仅|只)(?:翻译|处理)|第\s*[\d一二三四五六七八九十]+.{0,12}(?:页|张)', request):
        return False
    if re.search(r'摘要|总结|对比|比较|检索|联网|发送|邮件|重写|重绘|改写内容|扩写|删除|合并', request):
        return False
    if len(deliverables or []) > 1:
        return False
    return True


def normalize_pptx_translation_route(prompt: str, files: Optional[List[str]], routed: Any, telemetry: Any) -> Any:
    """Ensures attached single-PPTX translation/preservation tasks retain .pptx execution intent across admission."""
    from .skill_router import is_text_only_request

    request = _strip_prompt_header(prompt)
    admission = getattr(routed, 'admission', {}) or {}
    if (
        not files
        or len(files) != 1
        or Path(files[0]).suffix.lower() != '.pptx'
        or is_text_only_request(prompt)
        or getattr(routed, 'is_guide_intent', False)
        or admission.get('task_mode') == 'consult'
        or _has_cross_format_target(request)
        or not (PPTX_IN_PLACE_TRANSLATION_CUE_RE.search(request) or preserves_pptx_format(request))
    ):
        return routed

    previous = list(getattr(routed, 'deliverables', []) or [])
    if len(previous) > 1 or any(not str(item).lower().endswith(('.pptx', '.ppt')) for item in previous):
        return routed

    pptx_delivs = [item for item in previous if str(item).lower().endswith('.pptx')] or ['.pptx']
    routed.deliverables = pptx_delivs
    routed.is_generate_intent = True
    routed.requires_execution = True
    routed.is_inspect_intent = False
    routed.is_ppt_intent = False
    routed.is_office_intent = True
    routed.skill_id = 'pptx'
    if not getattr(routed, 'source_formats', None):
        routed.source_formats = ['.pptx']
    routed.admission = dict(admission, artifact_types=list(pptx_delivs), output_mode='artifact')
    if previous != pptx_delivs and telemetry is not None:
        telemetry.record_guard('pptx_translation_format', 'preserve_source', {
            'previous': previous,
            'deliverables': routed.deliverables,
        })
    return routed


def managed_pptx_export(telemetry: Any) -> bool:
    """Structured state owns final PPTX delivery; prevents HTML exporter from compiling reply into index.html."""
    return any(
        d.get('guard') in ('pptx_delivery', 'pptx_translation_workflow')
        for d in getattr(telemetry, 'guard_decisions', [])
    )


def _scan_pptx_ooxml_stats(pptx_path: Path) -> Dict[str, Any]:
    """Scans all slides (including nested p:grpSp shapes) for text, CJK content, and a:rPr styles."""
    with zipfile.ZipFile(pptx_path, 'r') as zf:
        slide_names = sorted(
            [n for n in zf.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)],
            key=lambda s: int(s.rsplit('slide', 1)[1].split('.')[0]),
        )
        if not slide_names:
            raise ValueError('No slide XML entries found in PPTX archive')

        non_empty_texts: List[str] = []
        cjk_samples: List[str] = []
        per_slide_cjk: Dict[str, int] = {}
        rpr_sz_count = 0
        rpr_fill_count = 0
        total_paragraphs = 0
        undeclared_prefixes: Dict[str, List[str]] = {}

        for name in slide_names:
            raw_bytes = zf.read(name)
            slide_text = raw_bytes.decode('utf-8', errors='replace')
            declared = set(re.findall(r'xmlns:([A-Za-z0-9_.-]+)=', slide_text))
            referenced = set()
            for attr_val in re.findall(r'(?:Requires|Ignorable|MustUnderstand)="([^"]+)"', slide_text):
                referenced.update(tok for tok in attr_val.split() if tok)
            missing_pref = sorted(referenced - declared)
            if missing_pref:
                undeclared_prefixes[name.rsplit('/', 1)[-1]] = missing_pref
            root = ET.fromstring(raw_bytes)
            slide_cjk = 0
            slide_label = f"Slide {name.rsplit('slide', 1)[1].split('.')[0]}"
            for p in root.findall('.//a:p', _NS):
                runs = p.findall('a:r', _NS)
                if not runs:
                    continue
                parts: List[str] = []
                for child in p:
                    tag = child.tag.split('}')[-1]
                    if tag == 'r':
                        t_el = child.find('a:t', _NS)
                        if t_el is not None and t_el.text:
                            parts.append(t_el.text)
                        r_pr = child.find('a:rPr', _NS)
                        if r_pr is not None:
                            if 'sz' in r_pr.attrib:
                                rpr_sz_count += 1
                            if any(rc.tag.split('}')[-1] in _FILL_TAGS for rc in r_pr):
                                rpr_fill_count += 1
                    elif tag == 'br':
                        parts.append('\n')
                text = ''.join(parts).strip()
                if not text:
                    continue
                total_paragraphs += 1
                non_empty_texts.append(text)
                if _CJK_RE.search(text):
                    slide_cjk += 1
                    if len(cjk_samples) < 5:
                        cjk_samples.append(f"{slide_label}: {text[:50]}")
            if slide_cjk:
                per_slide_cjk[slide_label] = slide_cjk

    return {
        'slides': len(slide_names),
        'total_paragraphs': total_paragraphs,
        'non_empty_texts': non_empty_texts,
        'cjk_paragraphs': sum(per_slide_cjk.values()),
        'per_slide_cjk': per_slide_cjk,
        'cjk_samples': cjk_samples,
        'rpr_sz_count': rpr_sz_count,
        'rpr_fill_count': rpr_fill_count,
        'undeclared_prefixes': undeclared_prefixes,
    }


def validate_pptx_translation_delivery(
    source_path: Optional[Path],
    output_path: Path,
    target_lang: Optional[str] = None,
) -> Dict[str, Any]:
    """Validates OOXML integrity, translation coverage across all shapes/grpSp, and a:rPr fidelity."""
    try:
        out_stats = _scan_pptx_ooxml_stats(Path(output_path))
    except (OSError, zipfile.BadZipFile, ET.ParseError, ValueError) as exc:
        return {'ok': False, 'issues': [f'invalid_pptx_archive: {exc}'], 'warnings': [], 'stats': {}}

    issues: List[str] = []
    warnings: List[str] = []
    stats: Dict[str, Any] = {
        'slides': out_stats['slides'],
        'total_paragraphs': out_stats['total_paragraphs'],
        'output_cjk_paragraphs': out_stats['cjk_paragraphs'],
        'output_per_slide_cjk': out_stats['per_slide_cjk'],
        'output_rpr_sz': out_stats['rpr_sz_count'],
        'output_rpr_fill': out_stats['rpr_fill_count'],
        'cjk_samples': out_stats['cjk_samples'],
    }

    src_stats: Optional[Dict[str, Any]] = None
    if source_path and Path(source_path).is_file():
        try:
            src_stats = _scan_pptx_ooxml_stats(Path(source_path))
            stats['source_cjk_paragraphs'] = src_stats['cjk_paragraphs']
            stats['source_rpr_sz'] = src_stats['rpr_sz_count']
            stats['source_rpr_fill'] = src_stats['rpr_fill_count']
        except Exception:
            src_stats = None

    lang_lower = (target_lang or '').lower()
    is_non_cjk_target = bool(lang_lower and not lang_lower.startswith(('zh', 'ja', 'ko')))

    if out_stats.get('undeclared_prefixes'):
        bad_slides = ','.join(f"{k}({'/'.join(v)})" for k, v in list(out_stats['undeclared_prefixes'].items())[:3])
        issues.append(f"undeclared_xml_prefix:{bad_slides}")

    if src_stats and src_stats['slides'] != out_stats['slides']:
        issues.append(f"slide_count_mismatch:{src_stats['slides']}->{out_stats['slides']}")

    if is_non_cjk_target and out_stats['cjk_paragraphs'] > 0:
        src_cjk = src_stats['cjk_paragraphs'] if src_stats else max(out_stats['cjk_paragraphs'], 1)
        ratio = out_stats['cjk_paragraphs'] / max(1, src_cjk)
        if out_stats['cjk_paragraphs'] >= 3 and ratio > 0.05:
            issues.append(
                f"residual_cjk_paragraphs:{out_stats['cjk_paragraphs']}/{src_cjk}({ratio:.0%})"
            )
        else:
            warnings.append(f"minor_cjk_retained:{out_stats['cjk_paragraphs']}")

    if lang_lower.startswith('ja'):
        simp_out = [t for t in out_stats['non_empty_texts'] if _ZH_SIMPLIFIED_RESIDUAL_RE.search(t)]
        stats['residual_simplified_chinese'] = len(simp_out)
        if simp_out:
            stats['simplified_samples'] = simp_out[:5]
        if len(simp_out) >= 3:
            issues.append(f"residual_simplified_chinese:{len(simp_out)}")
        elif simp_out:
            warnings.append(f"minor_simplified_chinese_retained:{len(simp_out)}")

    if src_stats and src_stats['non_empty_texts']:
        src_cjk_texts = {t for t in src_stats['non_empty_texts'] if _CJK_RE.search(t)}
        if len(src_cjk_texts) >= 3:
            unchanged = sum(1 for t in out_stats['non_empty_texts'] if t in src_cjk_texts)
            if unchanged >= len(out_stats['non_empty_texts']) and unchanged >= 3:
                issues.append('no_translation_applied')

    if src_stats:
        if src_stats['rpr_sz_count'] >= 5 and out_stats['rpr_sz_count'] < src_stats['rpr_sz_count'] * 0.5:
            issues.append(f"font_size_loss:{src_stats['rpr_sz_count']}->{out_stats['rpr_sz_count']}")
        if src_stats['rpr_fill_count'] >= 5 and out_stats['rpr_fill_count'] < src_stats['rpr_fill_count'] * 0.5:
            issues.append(f"color_fill_loss:{src_stats['rpr_fill_count']}->{out_stats['rpr_fill_count']}")

    return {
        'ok': len(issues) == 0,
        'issues': issues,
        'warnings': warnings,
        'stats': stats,
    }


def _load_pptx_engine(skill_dir: str):
    scripts_dir = Path(skill_dir) / 'pptx/scripts'
    if str(scripts_dir) not in os.sys.path:
        os.sys.path.insert(0, str(scripts_dir))
    spec = importlib.util.spec_from_file_location('pptx_owned_engine', scripts_dir / 'ooxml_translate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _resolve_pptx_output_name(source: Path, prompt: str, deliverables: Optional[List[str]], language: str) -> str:
    named = [Path(str(item)).name for item in (deliverables or [])
             if str(item).lower().endswith('.pptx') and str(item).lower() != '.pptx']
    if len(named) == 1 and named[0] != source.name:
        return named[0]
    request = _strip_prompt_header(prompt)
    explicit = [name for name in re.findall(r'([\w\u4e00-\u9fff.-]+\.pptx)\b', request, re.I) if name != source.name]
    if explicit:
        return Path(explicit[-1]).name
    suffix = 'EN' if language.startswith('en') else 'JP' if language.startswith('ja') else 'ZH' if language.startswith('zh') else language.replace('-', '_')
    return f"{source.stem}_{suffix}.pptx"


def run_fixed_pptx_translation(prompt: str, files: List[str], deliverables: Optional[List[str]],
                               workspace: str, skill_dir: str, start: float, deadline: Any,
                               telemetry: Any) -> Any:
    """Runs bounded single-PPTX whole-deck translation deterministically with OOXML QA verification."""
    root = Path(workspace).resolve()
    source = (root / files[0]).resolve()
    if not source.is_relative_to(root) or not source.is_file():
        raise ValueError(f'Invalid source PPTX path: {files[0]}')

    language = translation_language(prompt) or 'en-US'
    output_name = _resolve_pptx_output_name(source, prompt, deliverables, language)
    target = (root / output_name).resolve()
    if not target.is_relative_to(root) or target == source:
        target = root / f"{source.stem}_{language.replace('-', '_')}.pptx"

    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    run_id = uuid.uuid4().hex[:12]
    job_dir = root / '.dsh/pptx-jobs' / run_id
    pkg_dir = job_dir / 'package'
    pkg_dir.mkdir(parents=True, exist_ok=True)
    candidate = job_dir / target.name

    telemetry.record_guard('pptx_translation_workflow', 'direct_execution', {
        'source': source.name,
        'target': target.name,
        'language': language,
    })
    telemetry.record_tool_call('translate_pptx', {'source': source.name, 'target': target.name, 'language': language})

    try:
        engine = _load_pptx_engine(skill_dir)
        in_json = pkg_dir / 'translation_input.json'
        out_json = pkg_dir / 'translation_output.json'
        engine.unpack_pptx(str(source), str(pkg_dir), str(in_json))
        engine.translate_texts(str(in_json), str(out_json), target_lang=language, batch_size=70, concurrency=4)
        engine.pack_pptx(str(pkg_dir), str(out_json), str(candidate), lang=language, auto_fit=True, shrink_font=True)

        qa = validate_pptx_translation_delivery(source, candidate, target_lang=language)
        if not qa['ok']:
            telemetry.record_guard('pptx_delivery', 'reject', qa)
            raise ValueError(f"PPTX 翻译质量校验未通过: {', '.join(qa['issues'])}")

        target.parent.mkdir(parents=True, exist_ok=True)
        os.replace(candidate, target)
        qa['output_sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
        telemetry.record_guard('pptx_delivery', 'accept', {'fileName': target.name, **qa['stats']})
        receipt = ToolResult.success(
            data={'kind': 'pptx_translation', 'filePath': str(target), 'fileName': target.name,
                  'sourceSha256': source_hash, 'quality': qa},
            provenance={'tool': 'translate_pptx', 'execution_origin': 'runtime_workflow'},
        )
        telemetry.record_execution_result(receipt)
        telemetry.finish_reason = 'verified_pptx_translation'

        lang_label = '英文' if language.startswith('en') else '日文' if language.startswith('ja') else '中文' if language.startswith('zh') else language
        slides = qa['stats'].get('slides', 0)
        final_text = (
            f"## ✅ 演示文稿{lang_label}本地化完成\n\n"
            f"演示文稿「{target.name}」已按原版式完成全量{lang_label}翻译与排版适配。\n\n"
            "### 📋 主要处理内容\n"
            f"- **全页全要素覆盖**：完整译出全部 {slides} 页幻灯片的正文、列表、图表标签及组合图形内容；\n"
            "- **原版式高保真**：保留原始背景、层级结构、配色方案与字体排版样式。\n\n"
            "### 📦 交付成果物\n"
            f"- **交付文件**：「{target.name}」\n\n"
            "### 💡 提示与使用建议\n"
            "请点击下方文件卡片下载查看；如个别专有名词需按企业口径微调，可直接在 PowerPoint / WPS 中编辑。"
        )
        outbound = [json.dumps({'filePath': str(target), 'fileName': target.name}, ensure_ascii=False)]
        return SimpleNamespace(final_text=final_text, outbound_files=outbound, execution_evidence=[receipt])
    except (OSError, ValueError, RuntimeError, TimeoutError, zipfile.BadZipFile) as exc:
        telemetry.record_guard('pptx_translation_workflow', 'reject', {'error': str(exc)[:300]})
        telemetry.finish_reason = 'pptx_translation_failed'
        receipt = ToolResult.error(
            'pptx_translation_failed',
            str(exc),
            data={'kind': 'pptx_translation_failure', 'source': source.name, 'target': target.name},
            provenance={'tool': 'translate_pptx', 'execution_origin': 'runtime_workflow'},
        )
        telemetry.record_execution_result(receipt)
        failure_text = (
            f"## ⚠️ 演示文稿翻译未通过交付校验\n\n"
            f"### 🔍 原因说明\n"
            f"本次基于「{source.name}」执行高保真本地化时未生成可发布的交付文件（{str(exc)[:180]}）。\n\n"
            f"### 💡 下一步建议\n"
            f"请检查源文件格式完整性或稍后重试发起整份翻译。"
        )
        return SimpleNamespace(final_text=failure_text, outbound_files=[], execution_evidence=[receipt])
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)


def audit_pptx_workspace_deliverables(
    workspace_dir: str,
    start_ts: float,
    user_prompt: str,
    outbound_files: List[str],
    telemetry: Any,
) -> Optional[str]:
    """Post-loop quality gate inspecting generated PPTX deliverables for CJK residue and style loss."""
    request = _strip_prompt_header(user_prompt)
    if not (PPTX_IN_PLACE_TRANSLATION_CUE_RE.search(request) or preserves_pptx_format(request)):
        return None
    target_lang = translation_language(user_prompt)
    ws_root = Path(workspace_dir).resolve()
    candidates: List[Path] = []
    seen = set()

    for raw in (outbound_files or []):
        name = ''
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                name = obj.get('filePath') or obj.get('fileName') or ''
        except Exception:
            name = str(raw)
        if name.lower().endswith('.pptx'):
            p = Path(name) if Path(name).is_absolute() else (ws_root / name)
            if p.is_file() and p not in seen:
                seen.add(p)
                candidates.append(p)

    if not candidates and ws_root.is_dir():
        for p in sorted(ws_root.iterdir()):
            if p.is_file() and p.suffix.lower() == '.pptx' and not p.name.startswith('.'):
                if p.stat().st_mtime >= start_ts - 2.0 and p not in seen:
                    seen.add(p)
                    candidates.append(p)

    if not candidates:
        return None

    attachments = [a for a in os.getenv('DSH_SESSION_ATTACHMENTS', '').split(',') if a.strip()]
    source_path: Optional[Path] = None
    for att in attachments:
        if att.lower().endswith('.pptx'):
            sp = ws_root / att
            if sp.is_file() and sp != candidates[-1]:
                source_path = sp
                break

    verdict = validate_pptx_translation_delivery(source_path, candidates[-1], target_lang=target_lang)
    if verdict['ok']:
        telemetry.record_guard('pptx_delivery', 'accept', {'fileName': candidates[-1].name, **verdict['stats']})
        return None

    telemetry.record_guard('pptx_delivery', 'warn', {'fileName': candidates[-1].name, **verdict})
    per_slide = verdict['stats'].get('output_per_slide_cjk') or {}
    slide_summary = '、'.join(f"{k}({v}处)" for k, v in list(per_slide.items())[:5])
    return (
        f"> ⚠️ **【PPTX 交付质量门禁提示】**\n"
        f"> 系统在交付前对「{candidates[-1].name}」执行了全量质量核验，发现以下异常：`{', '.join(verdict['issues'])}`"
        + (f"（残余原文位置：{slide_summary}）" if slide_summary else "")
        + "。\n> 建议重新发起整份翻译以保持完整版式。\n\n---\n\n"
    )
