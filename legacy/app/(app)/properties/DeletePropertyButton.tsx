"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteProperty } from "./actions";

export default function DeletePropertyButton({ propertyId, name, redirectAfterDelete = false }: { propertyId: number; name: string; redirectAfterDelete?: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (deleting || !window.confirm(`「${name}」を削除しますか？\n分析結果と写真も削除されます。この操作は元に戻せません。`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProperty(propertyId);
      if (redirectAfterDelete) router.replace("/strategy");
      else router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "削除に失敗しました");
      setDeleting(false);
    }
  }

  return (
    <div className="relative z-10">
      <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-md border border-[#d9a5a5] px-2.5 py-1.5 text-xs font-bold text-[#a72d2d] hover:bg-[#fff0f0] disabled:opacity-60">
        {deleting ? "削除中…" : "削除"}
      </button>
      {error && <div role="alert" className="mt-1 text-xs text-[#b91c1c]">{error}</div>}
    </div>
  );
}
