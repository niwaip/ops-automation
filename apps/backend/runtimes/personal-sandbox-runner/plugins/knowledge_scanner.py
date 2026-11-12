#!/usr/bin/env python3
"""Compatibility entry point for the canonical personal-workspace knowledge client."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, '/usr/local/bin')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from dsh_modules.personal_knowledge_search import scan_personal_knowledge, get_last_scanned_knowledge_files


def scan_knowledge(query=''):
    context = scan_personal_knowledge(prompt=query)
    files = get_last_scanned_knowledge_files()
    return {'source': 'personal_workspace', 'total': len(files), 'files': files, 'context': context}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Read personal workspace originals; local directories are not knowledge sources.')
    parser.add_argument('--query', default='')
    args = parser.parse_args()
    print(json.dumps(scan_knowledge(args.query), ensure_ascii=False, indent=2))
