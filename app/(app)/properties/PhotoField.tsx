"use client";

import { useState } from "react";
import { fieldLabel } from "../../_lib/ui";

// 物件の写真の欄。選んだ写真はブラウザで縮めて（長辺1600px・JPEG）からフォームと一緒に送る
// 縮めた写真は onChange で親（PropertyForm）に渡し、送信のときに FormData の photo に入れる

const MAX_SIDE = 1600;
const QUALITY = 0.85;

async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("写真を読み込めませんでした");
  return { blob, width, height };
}

export interface PhotoChange {
  /** 縮めた写真（新しく選んだとき） */
  blob: Blob | null;
  width: number | null;
  height: number | null;
  /** 今の写真を消して仮画像に戻す */
  remove: boolean;
}

export default function PhotoField({ currentUrl, onChange }: { currentUrl: string | null; onChange: (change: PhotoChange) => void }) {
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [hasCurrent, setHasCurrent] = useState(currentUrl !== null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const { blob, width, height } = await shrink(file);
      setPreview(URL.createObjectURL(blob));
      onChange({ blob, width, height, remove: false });
    } catch {
      setError("写真を読み込めませんでした（JPEG・PNG・WebP などの画像を選んでください）");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    setPreview(null);
    setHasCurrent(false);
    onChange({ blob: null, width: null, height: null, remove: true });
  }

  return (
    <div className={fieldLabel}>
      物件の写真
      <span className="ml-1 text-[11px] text-muted">（任意。なければ共通の仮画像を出します。保存すると一覧と販売戦略に表示されます）</span>
      <div className="mt-1.5 flex items-center gap-4">
        <div className="w-40 h-28 rounded-md overflow-hidden border border-line bg-subtle flex items-center justify-center text-[11px] text-muted shrink-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- 選んだ直後の写真（blob: の URL）を出すため
            <img src={preview} alt="物件の写真" className="w-full h-full object-cover" />
          ) : (
            "写真なし（仮画像）"
          )}
        </div>
        <div className="grid gap-2">
          <label className="inline-block px-4 py-2 rounded-md border border-field bg-white text-[13px] text-body cursor-pointer">
            {busy ? "読み込み中…" : preview ? "写真を変える" : "写真を選ぶ"}
            <input type="file" accept="image/*" onChange={pick} className="hidden" disabled={busy} />
          </label>
          {(preview || hasCurrent) && (
            <button type="button" onClick={remove} className="text-xs text-[#b91c1c] underline text-left cursor-pointer">
              写真を外す（仮画像に戻す）
            </button>
          )}
        </div>
      </div>
      {error && <div className="text-xs text-[#b91c1c] mt-1">{error}</div>}
    </div>
  );
}
