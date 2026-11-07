#!/usr/bin/env python3
"""Compatible PDF translation CLI. Produces private candidates, never publishes."""
import json
import os
from pathlib import Path
import sys

# Immutable sandbox package; explicit repository fallback for development/tests.
package_root = Path('/usr/local/bin')
if not (package_root / 'dsh_modules').is_dir():
    package_root = Path(__file__).resolve().parents[3] / 'src'
sys.path.insert(0, str(package_root))


def main():
    try:
        from dsh_modules.pdf_translation_command import build_parser
        args = build_parser().parse_args()
        from pdf_translation.contracts import TranslationError
        if os.getenv('DSH_PDF_TRANSLATION_ENGINE', 'layout-html-v1') != 'layout-html-v1':
            raise TranslationError('engine_not_enabled',
                '布局翻译引擎尚未完成真实样本验收；需由运行环境启用layout-html-v1，不得改用原文或通用PDF冒充译文')
        from pdf_translation.pipeline import run_job
        if args.command == 'pack':
            source = json.loads((Path(args.work_dir) / 'source.ir.json').read_text())['source']['path']
        else:
            source = args.input_pdf
        result = run_job(source, getattr(args, 'output_pdf', None), lang=args.lang,
                         layout=args.layout, mode=args.command, work_dir=getattr(args, 'work_dir', None),
                         resume=getattr(args, 'resume', None))
        print(json.dumps({'manifest_path': str(result), 'published': False}, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({'error_code': getattr(error, 'code', 'pdf_translation_failed'),
                          'message': str(error)[:1600], 'published': False}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
