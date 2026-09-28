import Link from "next/link";
import { card } from "../../_lib/ui";

export default function ResearchConditionsPage() {
  return (
    <>
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <div className={`${card} p-4.5`}>
          <div className="text-sm font-bold text-ink mb-3">検索条件（直接競合）</div>
          <div className="grid gap-2 text-[13px] text-body">
            <div className="flex justify-between border-b border-divider pb-2">
              <span className="text-muted">エリア</span>
              <span>新潟市中央区（+隣接エリア）</span>
            </div>
            <div className="flex justify-between border-b border-divider pb-2">
              <span className="text-muted">物件種別</span>
              <span>新築戸建</span>
            </div>
            <div className="flex justify-between border-b border-divider pb-2">
              <span className="text-muted">価格</span>
              <span>3,300〜4,200万円</span>
            </div>
            <div className="flex justify-between border-b border-divider pb-2">
              <span className="text-muted">間取り</span>
              <span>3LDK〜4LDK</span>
            </div>
            <div className="flex justify-between border-b border-divider pb-2">
              <span className="text-muted">土地面積</span>
              <span>130〜180㎡</span>
            </div>
            <div className="flex justify-between border-b border-divider pb-2">
              <span className="text-muted">建物面積</span>
              <span>95〜120㎡</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">駅徒歩</span>
              <span>15分以内</span>
            </div>
          </div>
        </div>
        <div className={`${card} p-4.5 flex flex-col`}>
          <div className="text-sm font-bold text-ink mb-3">調査サイトへ移動</div>
          <div className="flex-1 flex flex-col justify-center">
            <button className="w-full p-[11px] bg-[#00a651] rounded-md text-white font-bold text-[13px] mb-2.5 cursor-pointer">SUUMOで検索</button>
            <button className="w-full p-[11px] bg-[#e6303e] rounded-md text-white font-bold text-[13px] cursor-pointer">アットホームで検索</button>
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-5">
        <Link href="/research/input" className="py-2.5 px-5.5 bg-brand rounded-md text-white text-[13px] font-bold">
          次へ
        </Link>
      </div>
    </>
  );
}
