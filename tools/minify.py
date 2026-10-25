#!/usr/bin/env python3
"""Minify the inline <script> and <style> blocks of the built page with esbuild.

build.py calls minify_html(bytes) after joining the pieces. Needs esbuild (one-time: `npm install -g esbuild`).
If esbuild is not found the page is left as it is and a warning is printed, so the build never breaks.
Not touched: JSON / text data blocks (type="application/json", "text/plain"), and top-level names (the app's globals).
"""
import os, re, shutil, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def find_esbuild():
    for c in (shutil.which("esbuild"), os.path.join(ROOT, "node_modules", ".bin", "esbuild"), "/opt/npm-tools/node_modules/.bin/esbuild"):
        if c and os.path.exists(c):
            return c
    return None

BLOCK = re.compile(rb"<(script|style)((?:\s[^>]*)?)>(.*?)</\1>", re.S)

def minify_html(data):
    exe = find_esbuild()
    if not exe:
        print("WARNING: esbuild not found, page NOT minified (install it with: npm install -g esbuild)")
        return data
    def run(code, loader):
        r = subprocess.run([exe, "--minify", "--loader=" + loader, "--target=es2020", "--log-level=error", "--legal-comments=none"],
                           input=code, capture_output=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.decode("utf-8", "replace")[:600])
        return r.stdout.rstrip(b"\n")
    def sub(m):
        tag, attrs, body = m.group(1), m.group(2), m.group(3)
        if not body.strip():
            return m.group(0)
        if tag == b"script":
            t = re.search(rb'type\s*=\s*["\']?([^"\'\s>]+)', attrs)
            if t and t.group(1).lower() not in (b"text/javascript", b"application/javascript"):
                return m.group(0)          # JSON / text data blocks stay as they are
            out = run(body, "js").replace(b"</script", b"<\\/script")
        else:
            out = run(body, "css").replace(b"</style", b"<\\/style")
        return b"<" + tag + attrs + b">" + out + b"</" + tag + b">"
    return BLOCK.sub(sub, data)
