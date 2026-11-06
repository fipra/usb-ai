#!/usr/bin/env python3
"""Build the isolated Web RAG v4 experiment (/ricerca-v4/) from the browser app.

The model in the browser plans queries, Purili and Wikipedia are searched,
pages are read through /api/read-article, the best passages are ranked by
web-rag.js and the model writes a cited answer that is then checked.
"""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import web_rag_patch  # noqa: E402

root = Path(__file__).resolve().parents[1]
web = root / 'web'


def replace(path, old, new):
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f'Expected text missing in {path}: {old[:80]}')
    path.write_text(text.replace(old, new, 1))


with tempfile.TemporaryDirectory(prefix='llamanest-rag-') as tmp:
    work = Path(tmp) / 'web'
    shutil.copytree(web, work, ignore=shutil.ignore_patterns('node_modules', 'dist'))
    (work / 'node_modules').symlink_to(web / 'node_modules', target_is_directory=True)
    app = work / 'usb-ai-web'
    web_rag_patch.apply(app, root, replace)
    replace(app / 'storage.js', "const DB = 'usb-ai-web-v1'", "const DB = 'usb-ai-web-rag-v4-experiment-v1'")
    replace(app / 'public' / 'sw.js', 'usb-ai-web-shell-', 'usb-ai-rag-v4-experiment-shell-')
    env = dict(os.environ, USB_AI_WEB_BASE='/ricerca-v4/')
    subprocess.run(['npm', 'run', 'build'], cwd=work, env=env, check=True)
    shutil.copytree(work / 'dist', root / '.vercel-static' / 'ricerca-v4', dirs_exist_ok=True)
