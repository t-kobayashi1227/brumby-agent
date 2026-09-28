import Image from "next/image";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex-1 flex min-h-[640px]">
      <div className="flex-[1_1_480px] bg-white flex items-center justify-center py-12 px-6">
        <div className="w-full max-w-[360px]">
          <div className="flex items-center justify-center gap-2.5 mb-7">
            <Image src="/brumby_ロゴのみ.png" alt="BRUMBY" width={132} height={88} className="h-28 w-auto" priority />
          </div>
          <div className="text-[22px] font-bold text-ink mb-6 text-center">BRUMBY AI物件販売戦略</div>

          <label className="block text-[13px] text-body mb-1.5">メールアドレス</label>
          <input type="email" defaultValue="info@sample.co.jp" className="w-full py-[11px] px-3.5 border border-field rounded-lg text-sm mb-4 outline-none" />

          <label className="block text-[13px] text-body mb-1.5">パスワード</label>
          <input type="password" defaultValue="password123" className="w-full py-[11px] px-3.5 border border-field rounded-lg text-sm mb-3.5 outline-none" />

          <label className="flex items-center gap-2 text-[13px] text-body mb-5.5">
            <input type="checkbox" defaultChecked /> ログイン状態を保持する
          </label>

          <Link href="/dashboard" className="block w-full p-[13px] bg-brand text-white text-center rounded-lg text-[15px] font-bold">
            ログイン
          </Link>
          <div className="text-center mt-4">
            <a href="#" className="text-[13px] text-brand hover:text-ink">パスワードをお忘れの方はこちら</a>
          </div>
        </div>
      </div>
      <div className="flex-[1_1_420px] bg-ink relative flex flex-col justify-center p-12 text-white overflow-hidden">
        <Image src="/niigata.jpg" alt="新潟市の街並み" fill sizes="50vw" className="object-cover" priority />
        <div className="absolute z-1 max-w-[400px] top-[20%] left-[10%]">
          <div className="text-[26px] font-black leading-normal mb-2">
            データ×AI×人の力で、
            <br />
            不動産の「売れる」を実現する。
          </div>
        </div>
      </div>
    </div>
  );
}
