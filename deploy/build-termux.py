#!/usr/bin/env python3
"""
يولّد deploy/termux.sh من deploy/termux.sh.in

ليش؟ طرفية Termux ما تدعم الاتجاه ثنائي الاتجاه (bidi) ولا وصل الحروف،
فالنص العربي يطلع مقلوبًا ومقطّعًا. الحل نكتبه مُشكَّلًا ومرتّبًا بصريًا
قبل التنفيذ، فتطبعه الطرفية من اليسار لليمين ويظهر صحيحًا.

المصدر (.in) يبقى بعربي منطقي مقروء للتعديل، والمولّد يحوّله.

التشغيل:
    pip install arabic-reshaper python-bidi
    python3 deploy/build-termux.py
"""

import re
import sys
from pathlib import Path

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
except ImportError:
    sys.exit("ينقصك: pip install arabic-reshaper python-bidi")

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "termux.sh.in"
OUT = ROOT / "termux.sh"

ARABIC = re.compile(r"[؀-ۿݐ-ݿ]")
# متغيرات الصدفة: ${X} أو $(X) أو $X
VAR = re.compile(r"\$\{[^}]*\}|\$\([^)]*\)|\$[A-Za-z_][A-Za-z0-9_]*|\$[0-9?@*#]")
DQ_STRING = re.compile(r'"(?:[^"\\]|\\.)*"')


def shape(text: str) -> str:
    """
    يحوّل العربي لأشكاله المتصلة ويرتّبه بصريًا.

    نفرض اتجاه الفقرة RTL: الرسائل عربية، فلو تركنا الاكتشاف التلقائي
    تنقلب الكلمات اللاتينية للجهة الغلط في أي سطر يبدأ بلاتيني.
    """
    return get_display(arabic_reshaper.reshape(text), base_dir="R")


def shape_string(literal: str, lineno: int) -> str:
    """يشكّل العربي داخل نص مقتبس، ويترك متغيرات الصدفة كما هي."""
    body = literal[1:-1]

    # نقسّم على المتغيرات عشان ما نلمسها
    parts, last = [], 0
    for m in VAR.finditer(body):
        parts.append(("text", body[last:m.start()]))
        parts.append(("var", m.group()))
        last = m.end()
    parts.append(("text", body[last:]))

    # متغيّر محشور بين مقطعين عربيين ما نقدر نرتّبه — قيمته تظهر وقت التشغيل
    arabic_idx = [i for i, (k, v) in enumerate(parts) if k == "text" and ARABIC.search(v)]
    if arabic_idx:
        for i, (kind, _) in enumerate(parts):
            if kind == "var" and arabic_idx[0] < i < arabic_idx[-1]:
                sys.exit(
                    f"سطر {lineno}: متغيّر داخل نص عربي — ما نقدر نرتّبه.\n"
                    f"  {literal}\n"
                    f"  الحل: حط القيمة في سطر مستقل بعد النص العربي."
                )

    out = "".join(shape(v) if kind == "text" and ARABIC.search(v) else v
                  for kind, v in parts)
    return f'"{out}"'


def main() -> None:
    if not SRC.exists():
        sys.exit(f"ما لقينا {SRC}")

    lines_in = SRC.read_text(encoding="utf-8").split("\n")
    lines_out, shaped_count = [], 0

    for lineno, line in enumerate(lines_in, 1):
        stripped = line.lstrip()
        # التعليقات تبقى بعربي منطقي — تنقرى في المحرر لا في الطرفية
        if stripped.startswith("#") or not ARABIC.search(line):
            lines_out.append(line)
            continue

        def repl(m: "re.Match[str]") -> str:
            nonlocal shaped_count
            if not ARABIC.search(m.group()):
                return m.group()
            shaped_count += 1
            return shape_string(m.group(), lineno)

        lines_out.append(DQ_STRING.sub(repl, line))

    header = (
        "# ⚠ مولّد آليًا من termux.sh.in — لا تعدّله مباشرة.\n"
        "# النص العربي هنا مُشكَّل ومرتّب بصريًا عشان طرفية Termux\n"
        "# (ما تدعم bidi) تعرضه صحيحًا. عدّل termux.sh.in ثم:\n"
        "#     python3 deploy/build-termux.py\n"
    )
    body = "\n".join(lines_out)
    # نحط التنبيه بعد سطر الشيبانغ
    first, rest = body.split("\n", 1)
    OUT.write_text(f"{first}\n{header}{rest}", encoding="utf-8")
    OUT.chmod(0o755)

    print(f"✓ ولّدنا {OUT.name} — شكّلنا {shaped_count} نصًا")


if __name__ == "__main__":
    main()
