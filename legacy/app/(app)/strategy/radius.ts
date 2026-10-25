/** 分析の条件で選べる半径（m）。null は物件の区分による初期値（中心部1km、郊外・周辺3km。設計書 5.3） */
export const RADIUS_CHOICES = [null, 500, 1000, 2000, 3000] as const;
