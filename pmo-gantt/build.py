"""Assemble the self-publishing Gantt page from app.css, app.js and a data file.

Usage: python3 build.py data.json out.html
The data file holds project data and must never be committed (see .gitignore).
"""
import json, re, sys

here = __file__.rsplit("/", 1)[0] if "/" in __file__ else "."
js = open(f"{here}/app.js", encoding="utf8").read()
css = open(f"{here}/app.css", encoding="utf8").read()
assert "</script" not in js.lower()
data = json.load(open(sys.argv[1], encoding="utf8"))
head = re.search(r"var HEAD = '(.*?)';", js).group(1)
payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
open(sys.argv[2], "w", encoding="utf8").write(
    head + '<style id="app-style">' + css + '</style><div id="app"></div>'
    '<script id="pmo-data" type="application/json">' + payload + "</script>"
    '<script id="app-src">' + js + "</script>")
