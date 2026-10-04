// 狙う層の候補と媒体の一覧（設計書 6.1「あらかじめ用意したリスト」）
// 出発点はプロトタイプ（app/_lib/data.ts の targetList・mediaDefs）。BRUMBY様との打ち合わせで直していく

export interface TargetDef {
  id: string;
  label: string;
  description: string;
}

export interface MediaDef {
  id: string;
  label: string;
  role: string;
}

/** 順位が同点のときは、この並び順で上にする */
export const TARGETS: TargetDef[] = [
  { id: "family", label: "30〜40代の子育てファミリー", description: "賃貸からの住み替え層。学校・駐車場・広さに関心" },
  { id: "dinks", label: "20代後半〜30代前半の共働き夫婦", description: "利便性の高いエリアでの新築を検討。駅までの距離・通勤を重視" },
  { id: "relocation", label: "周辺エリアの住み替え層", description: "今の住まいが手狭になったファミリー層。築10年以上の戸建・マンションから" },
];

export const MEDIA: MediaDef[] = [
  { id: "sns", label: "Instagram・Facebook広告", role: "30〜40代ファミリーへの認知拡大・見学予約への誘導" },
  { id: "posting", label: "ポスティング（エリア配布）", role: "周辺1〜2kmの住み替え層への地域での認知" },
  { id: "flyer", label: "チラシ制作・印刷", role: "現地周辺・見学会の告知" },
  { id: "lp", label: "物件専用LP", role: "検討層全般への詳細情報の提供・見学予約の獲得" },
];
