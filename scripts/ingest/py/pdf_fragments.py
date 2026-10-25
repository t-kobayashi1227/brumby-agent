# PDF の文字の断片を、ページ・位置（x, y）つきの JSON で標準出力に書き出す
# 表の列は x、行は y で分けられるので、表の組み立ては呼び出す側（TypeScript）で行う
# 使い方：python scripts/ingest/py/pdf_fragments.py <PDFのパス>
# pypdf が要る（pip install pypdf）
import json
import sys

from pypdf import PdfReader


def main(path: str) -> None:
    reader = PdfReader(path)
    pages = []
    for page in reader.pages:
        frags = []

        def visit(text, cm, tm, font_dict, font_size):
            if text.strip():
                # tm（文字の位置）に cm（ページの変換）を掛けて、ページ上の位置にする
                x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
                y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
                frags.append({"x": round(x, 1), "y": round(y, 1), "text": text.replace("\n", "")})

        page.extract_text(visitor_text=visit)
        pages.append(frags)
    sys.stdout.reconfigure(encoding="utf-8")
    json.dump(pages, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1])
