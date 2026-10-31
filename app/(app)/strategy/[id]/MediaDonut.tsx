// 媒体の配分の円グラフ（ドーナツ）。3〜6件の部分と全体を見るためだけに使い、数字は横の表で読む（色だけに頼らない）
// 色は分類の色を決まった順で当てる（dataviz の検証済みの並び。薄い3色は表と凡例で補う）。部分の間に2pxのすき間

export const MEDIA_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

/** totalManYen があれば中央に総予算、なければ配分の合計を出す */
export default function MediaDonut({ items, totalManYen = null }: { items: { label: string; share: number }[]; totalManYen?: number | null }) {
  const size = 128;
  const r = 50;
  const stroke = 18;
  const c = 2 * Math.PI * r;
  const total = items.reduce((s, i) => s + i.share, 0) || 1;
  const gap = 2;
  // 各部分の長さと、始まる位置（それまでの部分の長さの合計）
  const lengths = items.map((it) => (it.share / total) * c);
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="媒体の配分の円グラフ">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {items.map((it, i) => {
          const dash = Math.max(0, lengths[i] - gap);
          return (
            <circle
              key={it.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={MEDIA_COLORS[i % MEDIA_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offsets[i]}
              className="cursor-default hover:opacity-80"
            >
              <title>{`${it.label}：${it.share}%`}</title>
            </circle>
          );
        })}
      </g>
      <text x="50%" y="44%" textAnchor="middle" className="fill-muted text-[10px]">
        {totalManYen !== null ? "総予算" : "配分"}
      </text>
      <text x="50%" y="60%" textAnchor="middle" className="fill-ink text-[15px] font-bold">
        {totalManYen !== null ? `${totalManYen}万円` : `${items.reduce((s, i) => s + i.share, 0)}%`}
      </text>
    </svg>
  );
}
