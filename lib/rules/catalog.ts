// 狙う層の候補・訴求の素材の型と、媒体の一覧
// 候補と素材はコードに書かず、DB の target_candidates・appeal_items の行にする（設計書 D22・D23、狙う層の設計.md）
// 媒体の出発点はプロトタイプ（app/_lib/data.ts の mediaDefs）。BRUMBY様との打ち合わせで直していく

/** 狙う層の候補（target_candidates の1行） */
export interface CandidateDef {
  id: string;
  label: string;
  description: string;
  /** 対象の物件種別。null か空なら全部 */
  property_types: string[] | null;
  /** 同点のときは小さいほうを上にする */
  sort_order: number;
  enabled: boolean;
  /** low：公開データでは根拠が弱い（「仮説」のラベルを付ける） */
  confidence: "normal" | "low";
}

/** 訴求の素材（appeal_items の1行） */
export interface AppealDef {
  id: string;
  label: string;
  description: string;
  /** 必要な事実カードの key（property.xxx は物件の入力）。1つでも取れていなければ選ばない */
  needs_facts: string[];
  property_types: string[] | null;
  sort_order: number;
  enabled: boolean;
}

export interface MediaDef {
  id: string;
  label: string;
  role: string;
}

/** 物件種別が対象に入るか（null・空は全部） */
export function matchesPropertyType(types: string[] | null | undefined, propertyType: string) {
  return !types || types.length === 0 || types.includes(propertyType);
}

export const MEDIA: MediaDef[] = [
  { id: "sns", label: "Instagram・Facebook広告", role: "30〜40代ファミリーへの認知拡大・見学予約への誘導" },
  { id: "posting", label: "ポスティング（エリア配布）", role: "周辺1〜2kmの住み替え層への地域での認知" },
  { id: "flyer", label: "チラシ制作・印刷", role: "現地周辺・見学会の告知" },
  { id: "lp", label: "物件専用LP", role: "検討層全般への詳細情報の提供・見学予約の獲得" },
];
