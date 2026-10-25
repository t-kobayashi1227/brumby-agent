import { redirect } from "next/navigation";

// 検索結果の件数・価格帯の入力（プロトタイプ）は、保存先がなく架空の数値だったため外した（設計書 7.1・D27）
// 競合物件の入力（/research/detail）へ移す
export default async function ResearchInputPage({ searchParams }: PageProps<"/research/input">) {
  const sp = await searchParams;
  const property = Number(sp.property) > 0 ? `?property=${Number(sp.property)}` : "";
  redirect(`/research/detail${property}`);
}
