// 医療機関（XKT010＝国土数値情報「医療機関（令和2年度）」）の診療科目の判定
// 診療科目（medical_subject_ja）は、病院は略称（例：「内　整　リハ」）、診療所は正式名（例：「内科　循環器内科」）で書かれている
// 採点の「病院_m」は、内科のある病院・診療所の最寄り（2026-10-12に決定。皮膚科・眼科などだけの診療所は数えない）

/** 内科系に数えない科（内科と付くが、日常の通院先としての内科ではない） */
const NOT_INTERNAL = new Set(["心療内科", "美容内科"]);

/** 診療科目を1つずつに分ける（全角・半角の空白区切り） */
export const subjectsOf = (subjects: unknown): string[] =>
  String(subjects ?? "")
    .split(/[\s　]+/)
    .filter(Boolean);

/** 内科がある（「内」「内科」、消化器内科・循内などの内科系も含む。心療内科・美容内科は除く） */
export function hasInternalMedicine(subjects: unknown): boolean {
  return subjectsOf(subjects).some((s) => !NOT_INTERNAL.has(s) && (s === "内" || s.endsWith("内科") || /^.{1,4}内$/.test(s)));
}
