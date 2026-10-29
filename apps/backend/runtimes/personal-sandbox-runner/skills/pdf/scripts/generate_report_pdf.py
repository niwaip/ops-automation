#!/usr/bin/env python3
"""Compatible PDF CLI backed by local HTML/CSS templates and WeasyPrint."""

import argparse
import sys

from pdf_design import render_report
from pdf_design.themes import LAYOUTS, PALETTES


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--input', '-i', help='Markdown, text or structured JSON source')
    source.add_argument('--text', '-t', help='Inline Markdown')
    parser.add_argument('--output', '-o', default='/workspace/report.pdf')
    parser.add_argument('--title', default='')
    parser.add_argument('--subtitle', default='')
    parser.add_argument('--author', default='')
    parser.add_argument('--date', default='')
    parser.add_argument('--theme', choices=PALETTES)
    parser.add_argument('--template', choices=LAYOUTS, default='report')
    parser.add_argument('--accent', help='Accent color in #RRGGBB format')
    parser.add_argument('--cover', action='store_true', help='Add a separate title page')
    parser.add_argument('--min-pages', type=int)
    parser.add_argument('--max-pages', type=int)
    parser.add_argument('--preview-dir', help='Directory for QA report and page PNGs')
    args = parser.parse_args()
    text = args.text
    if not args.input and text is None:
        if sys.stdin.isatty():
            parser.error('Provide --input, --text or stdin')
        text = sys.stdin.read()
    try:
        render_report(content_lines=text.splitlines(keepends=True) if text is not None else None,
                      input_path=args.input, output_path=args.output, title=args.title,
                      subtitle=args.subtitle, author=args.author, date_str=args.date,
                      theme=args.theme, template=args.template, accent=args.accent,
                      cover=args.cover, min_pages=args.min_pages, max_pages=args.max_pages,
                      preview_dir=args.preview_dir)
    except Exception as error:
        print(f'ERROR: Failed to generate PDF: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
