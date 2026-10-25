// 媒体の配分の円グラフ（ドーナツ）。3〜6件の部分と全体を見るためだけに使い、数字は横の表で読む（色だけに頼らない）
// 色は分類の色を決まった順で当てる（dataviz の検証済みの並び。薄い3色は表と凡例で補う）。部分の間に2pxのすき間

export const MEDIA_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

export default function MediaDonut({ items }: { items: { label: string; share: number }[] }) {
  const size = 180;
  const r = 70;
  const stroke = 26;
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
      <text x="50%" y="48%" textAnchor="middle" className="fill-ink text-[13px] font-bold">
        配分
      </text>
      <text x="50%" y="60%" textAnchor="middle" className="fill-muted text-[11px]">
        合計 {items.reduce((s, i) => s + i.share, 0)}%
      </text>
    </svg>
  );
}
