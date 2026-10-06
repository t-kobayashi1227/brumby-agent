"use client";

import { btnPrimary } from "../../_lib/ui";

/** ブラウザの印刷（PDFに保存もここから。設計書 1.3・D27） */
export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={btnPrimary}>
      印刷する（PDFに保存）
    </button>
  );
}
