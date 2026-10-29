#!/usr/bin/env python3
"""Check an existing PDF and optionally render pages; never rewrites the original."""

import argparse
import json
from pathlib import Path

from pdf_design.quality import inspect_pdf, render_previews


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf')
    parser.add_argument('--min-pages', type=int)
    parser.add_argument('--max-pages', type=int)
    parser.add_argument('--preview-dir', required=True)
    args = parser.parse_args()
    folder = Path(args.preview_dir)
    folder.mkdir(parents=True, exist_ok=True)
    try:
        report = inspect_pdf(args.pdf, min_pages=args.min_pages, max_pages=args.max_pages)
        report['previews'] = [str(p) for p in render_previews(args.pdf, folder)]
    except Exception as error:
        report = {'valid': False, 'errors': [str(error)], 'visual_review': 'required'}
    (folder / 'qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'pages'}, ensure_ascii=False))
    return 0 if report['valid'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
