#!/usr/bin/env python3
"""Verify immutable office dependencies as the actual non-root sandbox user."""
import importlib
import json
from pathlib import Path
import tempfile
import zipfile


def main():
    modules = ('pptx', 'docx', 'openpyxl', 'xlsxwriter', 'PIL', 'pypdf')
    for module in modules:
        importlib.import_module(module)
    from pptx import Presentation
    with tempfile.TemporaryDirectory(prefix='sandbox-runtime-') as folder:
        target = Path(folder) / 'check.pptx'
        deck = Presentation()
        deck.slides.add_slide(deck.slide_layouts[5]).shapes.title.text = '运行时检查'
        deck.save(target)
        assert len(Presentation(target).slides) == 1
        with zipfile.ZipFile(target) as archive:
            assert archive.testzip() is None
    print(json.dumps({'runtime_contract': 'office-v1', 'modules': list(modules),
                      'pptx_roundtrip': True}, ensure_ascii=False))


if __name__ == '__main__':
    main()
