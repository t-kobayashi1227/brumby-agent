"use client";

import { useTransition } from "react";
import { TrashIcon } from "../../_components/icons";
import { deleteProperty } from "./actions";

// 物件一覧の行にある削除ボタン。行全体が物件画面へのリンクになっているため、クリックの伝播を止めて確認ダイアログを出す

export default function DeletePropertyButton({ propertyId, code }: { propertyId: number; code: string }) {
  const [pending, startDelete] = useTransition();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`物件 ${code} を削除しますか。事実シート・販売戦略・販売の記録もすべて削除され、元に戻せません。`)) return;
    startDelete(async () => {
      const res = await deleteProperty(propertyId);
      if (res.error) window.alert(res.error);
    });
  };

  return (
    <span className="relative z-10 flex items-center justify-end">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label={`物件 ${code} を削除`}
        className="cursor-pointer text-muted hover:text-[#b91c1c] disabled:opacity-50"
      >
        <TrashIcon className="size-4" />
      </button>
    </span>
  );
}
