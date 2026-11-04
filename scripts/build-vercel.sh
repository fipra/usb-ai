#!/bin/sh
set -eu
npm ci --prefix web
USB_AI_WEB_BASE=/app/ npm run build --prefix web
mkdir -p .vercel-static/app
cp index.html landing-i18n.js landing-mobile-gate.js landing-visitor-count.js landing-video-gallery.js landing-demo.js robots.txt sitemap.xml .vercel-static/
cp -R web/dist/. .vercel-static/app/
mkdir -p .vercel-static/guida-semplice
cp guida-semplice/index.html .vercel-static/guida-semplice/index.html
python3 scripts/build-prism-web.py
LLAMA_PRISM_DUAL_BASE=/prism-gpu/ python3 scripts/build-prism-dual.py
python3 scripts/build-prism-dual.py
LLAMA_PRISM_DUAL_BASE=/prism-fast/ python3 scripts/build-prism-dual.py
LLAMA_PRISM_DUAL_BASE=/prism-dflash/ python3 scripts/build-prism-dual.py
LLAMA_PRISM_DUAL_BASE=/nuovo-web/ python3 scripts/build-prism-dual.py
LLAMA_PRISM_DUAL_BASE=/web-veloce/ python3 scripts/build-prism-dual.py
LLAMA_PRISM_DUAL_BASE=/intel-prova/ python3 scripts/build-prism-dual.py
LLAMA_PRISM_DUAL_BASE=/dory-web/ python3 scripts/build-prism-dual.py
