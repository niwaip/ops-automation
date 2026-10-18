"""Export PDFs and page PNGs using the documents skill's bundled renderer.
Run with the bundled Python: render.py --renderer /absolute/path/render_docx.py
"""
import argparse,os,subprocess,shutil,tempfile
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--renderer',required=True);parser.add_argument('--qa-dir',required=True)
args=parser.parse_args();root=Path(__file__).resolve().parent;qa=Path(args.qa_dir).resolve();qa.mkdir(parents=True,exist_ok=True)
env=os.environ.copy()
# macOS bundled headless LibreOffice needs explicit CJK font discovery.
if Path('/System/Library/Fonts/Hiragino Sans GB.ttc').exists():
 conf=qa/'fonts.conf';conf.write_text('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/System/Library/Fonts</dir><cachedir>'+str(qa/'font-cache')+'</cachedir></fontconfig>')
 env['FONTCONFIG_FILE']=str(conf);env['SAL_FONTPATH']='/System/Library/Fonts'
for p in sorted(root.glob('contracts/*/*.docx')):
 out=qa/p.stem
 subprocess.run([__import__('sys').executable,args.renderer,str(p),'--output_dir',str(out),'--emit_pdf'],env=env,check=True)
 pdfs=list(out.glob('*.pdf'));assert len(pdfs)==1,(p,pdfs)
 shutil.copy2(pdfs[0],p.with_suffix('.pdf'));print(p.stem,flush=True)
print('Inspect every page PNG before running finalize.py.')
