// Static, offline SVG map of the area around the sample property (no map API / tiles).
// Town blocks (町丁目) are shaded by the share of child-rearing households in four levels of blue.

const W = 480;
const H = 360;
const CX = W / 2;
const CY = H / 2;
/** Pixels per km at zoom 1 (so the 3km circle fits the frame). */
const PX_PER_KM = 55;

const COLS = 8;
const ROWS = 6;
const CELL_W = W / COLS;
const CELL_H = H / ROWS;

const LEVEL_COLORS = ["#dbe8f7", "#a9c8ec", "#6b9fd8", "#2f6db5"];

/** Deterministic pseudo-random value in [0, 1) so the map renders identically on server and client. */
function noise(i: number, j: number, salt = 0): number {
  const x = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

function vertex(i: number, j: number): [number, number] {
  const edgeX = i === 0 || i === COLS;
  const edgeY = j === 0 || j === ROWS;
  const jx = edgeX ? 0 : (noise(i, j, 1) - 0.5) * CELL_W * 0.5;
  const jy = edgeY ? 0 : (noise(i, j, 2) - 0.5) * CELL_H * 0.5;
  return [i * CELL_W + jx, j * CELL_H + jy];
}

/** Share level 0–3: higher toward the south-east residential side, with some block-to-block variation. */
function level(i: number, j: number): number {
  const trend = (i / COLS) * 0.9 + (j / ROWS) * 0.9;
  return Math.min(3, Math.floor((trend + noise(i, j, 3) * 0.9) * 1.6));
}

const blocks = Array.from({ length: COLS * ROWS }, (_, k) => {
  const i = k % COLS;
  const j = Math.floor(k / COLS);
  const pts = [vertex(i, j), vertex(i + 1, j), vertex(i + 1, j + 1), vertex(i, j + 1)];
  return { key: k, points: pts.map((p) => p.join(",")).join(" "), fill: LEVEL_COLORS[level(i, j)] };
});

type FacilityKind = "nursery" | "school" | "medical" | "station";

const FACILITY_STYLE: Record<FacilityKind, { color: string; label: string }> = {
  nursery: { color: "#e8920c", label: "保育園" },
  school: { color: "#1a8a4a", label: "小・中学校" },
  medical: { color: "#e6303e", label: "医療機関" },
  station: { color: "#16233f", label: "駅" },
};

/** Facilities within ~1km. `num` matches the numbered list on the 周辺環境 tab. Offsets are in km (east, south). */
const FACILITIES: { kind: FacilityKind; dx: number; dy: number; num?: number }[] = [
  { kind: "nursery", dx: 0.17, dy: -0.17, num: 1 },
  { kind: "school", dx: -0.45, dy: 0.45, num: 2 },
  { kind: "school", dx: 0.62, dy: 0.74, num: 3 },
  { kind: "station", dx: -0.75, dy: -0.6 },
  { kind: "nursery", dx: -0.5, dy: -0.2 },
  { kind: "nursery", dx: 0.7, dy: 0.3 },
  { kind: "school", dx: 0.35, dy: -0.82 },
  { kind: "medical", dx: 0.3, dy: 0.1 },
  { kind: "medical", dx: -0.2, dy: 0.3 },
  { kind: "medical", dx: -0.62, dy: -0.4 },
  { kind: "medical", dx: 0.5, dy: -0.4 },
  { kind: "medical", dx: 0.1, dy: 0.6 },
  { kind: "medical", dx: -0.8, dy: 0.2 },
  { kind: "medical", dx: 0.82, dy: -0.1 },
  { kind: "medical", dx: -0.3, dy: -0.75 },
  { kind: "medical", dx: 0.2, dy: -0.5 },
  { kind: "medical", dx: -0.1, dy: 0.88 },
];

interface Props {
  /** Overlay facility pins and zoom to the 1km radius (used on the 周辺環境 tab). */
  facilities?: boolean;
  className?: string;
}

export default function AreaMap({ facilities = false, className = "" }: Props) {
  const zoom = facilities ? 2.6 : 1;
  const km = PX_PER_KM * zoom;
  const scaleAroundCenter = `translate(${CX} ${CY}) scale(${zoom}) translate(${-CX} ${-CY})`;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto rounded-lg border border-line bg-[#eef3f9]" role="img" aria-label="子育て世帯の割合（町丁目別）の地図">
        <g transform={scaleAroundCenter}>
          {blocks.map((b) => (
            <polygon key={b.key} points={b.points} fill={b.fill} stroke="#ffffff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          ))}
          {/* River and main roads, for orientation only */}
          <path d="M-10 60 C 90 40, 150 110, 250 70 S 420 20, 490 45" fill="none" stroke="#b9d3ea" strokeWidth={14} strokeLinecap="round" />
          <path d="M0 250 L 480 205" fill="none" stroke="#ffffff" strokeWidth={3} vectorEffect="non-scaling-stroke" opacity={0.9} />
          <path d="M300 0 L 270 360" fill="none" stroke="#ffffff" strokeWidth={3} vectorEffect="non-scaling-stroke" opacity={0.9} />
        </g>

        {/* Radius circles (the 3km circle falls outside the frame when zoomed in) */}
        <circle cx={CX} cy={CY} r={km} fill="none" stroke="#16233f" strokeWidth={1.5} strokeDasharray="5 4" />
        <text x={CX + km * 0.71 + 4} y={CY - km * 0.71 - 4} fontSize={11} fontWeight={700} fill="#16233f">1km</text>
        {!facilities && (
          <>
            <circle cx={CX} cy={CY} r={km * 3} fill="none" stroke="#16233f" strokeWidth={1.5} strokeDasharray="8 5" />
            <text x={CX + km * 3 * 0.71 + 4} y={CY - km * 3 * 0.71 + 12} fontSize={11} fontWeight={700} fill="#16233f">3km</text>
          </>
        )}

        {facilities &&
          FACILITIES.map((f, idx) => {
            const x = CX + f.dx * km;
            const y = CY + f.dy * km;
            const { color } = FACILITY_STYLE[f.kind];
            if (f.num) {
              return (
                <g key={idx}>
                  <circle cx={x} cy={y} r={10} fill="#1f3a63" stroke="#ffffff" strokeWidth={2} />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff">{f.num}</text>
                </g>
              );
            }
            if (f.kind === "station") {
              return <rect key={idx} x={x - 7} y={y - 7} width={14} height={14} rx={2} fill={color} stroke="#ffffff" strokeWidth={2} />;
            }
            return <circle key={idx} cx={x} cy={y} r={5.5} fill={color} stroke="#ffffff" strokeWidth={1.5} />;
          })}

        {/* Target property pin */}
        <g transform={`translate(${CX} ${CY})`}>
          <path d="M0 0 C -4 -8, -11 -12, -11 -20 A 11 11 0 1 1 11 -20 C 11 -12, 4 -8, 0 0 Z" fill="#c14b1f" stroke="#ffffff" strokeWidth={2} />
          <circle cx={0} cy={-20} r={4} fill="#ffffff" />
        </g>

        {/* Scale bar */}
        <g transform={`translate(${W - 16 - (facilities ? km / 2 : km)} ${H - 16})`}>
          <rect x={-6} y={-16} width={(facilities ? km / 2 : km) + 12} height={22} rx={3} fill="#ffffff" opacity={0.85} />
          <line x1={0} y1={0} x2={facilities ? km / 2 : km} y2={0} stroke="#16233f" strokeWidth={2} />
          <text x={(facilities ? km / 2 : km) / 2} y={-4} textAnchor="middle" fontSize={10} fill="#16233f">{facilities ? "500m" : "1km"}</text>
        </g>
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-[11px] text-body">
        <div className="flex items-center gap-1.5">
          <span>子育て世帯の割合（町丁目別）</span>
          <span className="text-muted">少</span>
          {LEVEL_COLORS.map((c) => (
            <span key={c} className="inline-block w-4 h-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
          <span className="text-muted">多</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent" />
          対象物件
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-ink" />
          {facilities ? "半径1km" : "半径1km・3km"}
        </div>
        {facilities &&
          (Object.keys(FACILITY_STYLE) as FacilityKind[]).map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <span
                className={`inline-block w-2.5 h-2.5 ${k === "station" ? "rounded-[2px]" : "rounded-full"}`}
                style={{ backgroundColor: FACILITY_STYLE[k].color }}
              />
              {FACILITY_STYLE[k].label}
            </div>
          ))}
      </div>
    </div>
  );
}
