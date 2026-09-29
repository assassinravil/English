#!/usr/bin/env python3
"""
Сборка сайта в один файл.

    python3 build.py

Берёт части из src/ и подставляет их в src/template.html,
результат кладёт в index.html. Внешних зависимостей нет.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "index.html"

# что куда подставляется
PARTS = {
    "@@STYLES@@":     SRC / "styles" / "app.css",
    "@@APP_PAGES@@":  SRC / "content" / "app-pages.html",
    "@@GRAMMAR@@":    SRC / "content" / "grammar.html",
    "@@VOCABULARY@@": SRC / "data" / "vocabulary.js",
    "@@EXERCISES@@":  SRC / "data" / "exercises.js",
    "@@CORE@@":       SRC / "scripts" / "core.js",
    "@@PROGRESS@@":   SRC / "scripts" / "progress.js",
    "@@PAGES@@":      SRC / "scripts" / "pages.js",
    "@@TRAINER@@":    SRC / "scripts" / "trainer.js",
}

# метки в шаблоне обёрнуты в комментарии, чтобы шаблон оставался валидным
MARKERS = {
    "@@STYLES@@":     "/* @@STYLES@@ */",
    "@@APP_PAGES@@":  "<!-- @@APP_PAGES@@ -->",
    "@@GRAMMAR@@":    "<!-- @@GRAMMAR@@ -->",
    "@@VOCABULARY@@": "/* @@VOCABULARY@@ */",
    "@@EXERCISES@@":  "/* @@EXERCISES@@ */",
    "@@CORE@@":       "/* @@CORE@@ */",
    "@@PROGRESS@@":   "/* @@PROGRESS@@ */",
    "@@PAGES@@":      "/* @@PAGES@@ */",
    "@@TRAINER@@":    "/* @@TRAINER@@ */",
}


def main():
    template_path = SRC / "template.html"
    if not template_path.exists():
        sys.exit("Не найден src/template.html")

    html = template_path.read_text(encoding="utf-8")

    for key, path in PARTS.items():
        if not path.exists():
            sys.exit(f"Не найден {path.relative_to(ROOT)}")
        marker = MARKERS[key]
        if marker not in html:
            sys.exit(f"В шаблоне нет метки {marker}")
        html = html.replace(marker, path.read_text(encoding="utf-8"))

    OUT.write_text(html, encoding="utf-8")

    size = len(html.encode("utf-8")) / 1024
    print(f"Собрано: {OUT.name}, {size:.0f} КБ")

    # короткая сводка по содержимому
    vocab = (SRC / "data" / "vocabulary.js").read_text(encoding="utf-8")
    ex = (SRC / "data" / "exercises.js").read_text(encoding="utf-8")
    grammar = (SRC / "content" / "grammar.html").read_text(encoding="utf-8")
    print(f"  слов в словаре:      ~{vocab.count('{en:')}")
    print(f"  заданий на скобки:   {ex.count('{q:')}")
    print(f"  предложений перевода:{ex.count('{ru:')}")
    print(f"  разделов справочника:{grammar.count('class=\"page\"')}")


if __name__ == "__main__":
    main()
