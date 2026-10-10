#!/usr/bin/env python3
"""
One-click helper to add a Word margin comment to a specific target text span.
Automates unpacking, run merging, comment satellite registration, marker insertion, and rezipping.

Usage:
  python add_comment.py input.docx --target "目标文字" --comment "批注内容" --author "审阅人" -o output.docx
"""

import os
import sys
import re
import argparse
import tempfile
import zipfile
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MERGE_RUNS_SCRIPT = SCRIPT_DIR / "merge_runs.py"
COMMENT_SCRIPT = SCRIPT_DIR / "comment.py"


def add_comment_to_docx(
    docx_path: str,
    target_text: str,
    comment_text: str,
    author: str = "AI Reviewer",
    output_path: str = None
) -> str:
    src = Path(docx_path).resolve()
    if not src.exists():
        raise FileNotFoundError(f"Input file not found: {src}")

    dst = Path(output_path).resolve() if output_path else src

    with tempfile.TemporaryDirectory() as td:
        unpacked_dir = Path(td) / "unpacked"
        with zipfile.ZipFile(src, "r") as zf:
            zf.extractall(unpacked_dir)

        # 1. Merge fragmented runs
        subprocess.run(
            [sys.executable, str(MERGE_RUNS_SCRIPT), str(unpacked_dir)],
            check=True,
            capture_output=True,
            text=True
        )

        # 2. Add comment definition via comment.py
        cmd = [
            sys.executable, str(COMMENT_SCRIPT),
            str(unpacked_dir), comment_text,
            "--author", author
        ]
        res = subprocess.run(cmd, check=True, capture_output=True, text=True)
        
        # Parse comment ID
        m = re.search(r"Added comment id=(\d+)", res.stdout)
        if not m:
            raise RuntimeError(f"Failed to parse comment ID from comment.py output:\n{res.stdout}")
        cid = m.group(1)

        # 3. Locate target_text in word/document.xml and place markers
        doc_xml_path = unpacked_dir / "word" / "document.xml"
        if not doc_xml_path.exists():
            raise FileNotFoundError("word/document.xml not found in unpacked docx")

        xml_content = doc_xml_path.read_text(encoding="utf-8")
        if target_text not in xml_content:
            # If exact match not in xml_content directly, strip and try
            clean_target = target_text.strip()
            if clean_target not in xml_content:
                raise ValueError(f"Target text '{target_text}' not found in document.xml")
            target_text = clean_target

        marker_start = f'<w:commentRangeStart w:id="{cid}"/>'
        marker_end = f'<w:commentRangeEnd w:id="{cid}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="{cid}"/></w:r>'

        # Locate target_text position and enclosing <w:t> and <w:r> tags without catastrophic regex backtracking
        idx = xml_content.find(target_text)
        if idx != -1:
            t_open = xml_content.rfind("<w:t", 0, idx)
            t_tag_end = xml_content.find(">", t_open) + 1 if t_open != -1 else -1
            t_close = xml_content.find("</w:t>", idx + len(target_text))
            r_open = xml_content.rfind("<w:r", 0, t_open) if t_open != -1 else -1
            r_close = xml_content.find("</w:r>", t_close) + len("</w:r>") if t_close != -1 else -1

            if -1 not in (t_open, t_tag_end, t_close, r_open, r_close) and r_open < t_open < t_close < r_close:
                full_t = xml_content[t_tag_end:t_close]
                parts = full_t.split(target_text, 1)
                r_prefix = xml_content[r_open:t_tag_end]
                r_suffix = xml_content[t_close:r_close]

                new_block = (
                    f"{r_prefix}{parts[0]}</w:t></w:r>"
                    f"{marker_start}"
                    f"<w:r><w:t>{target_text}</w:t></w:r>"
                    f"{marker_end}"
                    f"<w:r><w:t>{parts[1]}{r_suffix}"
                )
                new_xml = xml_content[:r_open] + new_block + xml_content[r_close:]
            else:
                new_xml = xml_content.replace(target_text, f"{marker_start}{target_text}{marker_end}", 1)
        else:
            new_xml = xml_content.replace(target_text, f"{marker_start}{target_text}{marker_end}", 1)

        doc_xml_path.write_text(new_xml, encoding="utf-8")

        # 4. Rezip into target docx
        with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in unpacked_dir.rglob("*"):
                if f.is_file():
                    zf.write(f, f.relative_to(unpacked_dir))

    return str(dst)


def main():
    parser = argparse.ArgumentParser(description="Add a Word comment to a target text span in a .docx file")
    parser.add_argument("input", help="Path to input .docx file")
    parser.add_argument("--target", "-t", required=True, help="Target text to attach comment to")
    parser.add_argument("--comment", "-c", required=True, help="Comment body text")
    parser.add_argument("--author", "-a", default="AI Reviewer", help="Comment author name")
    parser.add_argument("-o", "--output", help="Output .docx file path (default: overwrite input)")

    args = parser.parse_args()
    try:
        out = add_comment_to_docx(
            docx_path=args.input,
            target_text=args.target,
            comment_text=args.comment,
            author=args.author,
            output_path=args.output
        )
        print(f"SUCCESS: Comment added to '{args.target}' in {out}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
