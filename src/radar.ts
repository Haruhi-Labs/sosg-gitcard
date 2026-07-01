import type { Abilities } from "./types";

// ————————————————————————————————————————————————
// 五维能力雷达图（纯 SVG，无依赖）
// ————————————————————————————————————————————————

const AXES: Array<{ key: keyof Abilities; label: string; sub: string }> = [
  { key: "act", label: "行動", sub: "ACT" },
  { key: "star", label: "影響", sub: "STAR" },
  { key: "sync", label: "協調", sub: "SYNC" },
  { key: "heat", label: "熱量", sub: "HEAT" },
  { key: "time", label: "継続", sub: "TIME" },
];

const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 92;

/** 第 i 个顶点在半径比例 t 处的坐标（顶点在正上方，顺时针） */
function point(i: number, t: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
  return [CX + Math.cos(angle) * R * t, CY + Math.sin(angle) * R * t];
}

function polygon(t: number): string {
  return AXES.map((_, i) => point(i, t).join(",")).join(" ");
}

export function radarSVG(ab: Abilities): string {
  // 背景同心网格
  const rings = [0.25, 0.5, 0.75, 1]
    .map((t) => `<polygon class="radar-ring" points="${polygon(t)}" />`)
    .join("");

  // 轴线
  const spokes = AXES.map((_, i) => {
    const [x, y] = point(i, 1);
    return `<line class="radar-spoke" x1="${CX}" y1="${CY}" x2="${x}" y2="${y}" />`;
  }).join("");

  // 数据多边形顶点
  const dataPts = AXES.map((ax, i) => point(i, ab[ax.key] / 100));
  const dataPoly = dataPts.map((p) => p.join(",")).join(" ");
  const dots = dataPts
    .map(([x, y]) => `<circle class="radar-dot" cx="${x}" cy="${y}" r="3.5" />`)
    .join("");

  // 轴标签（略微外扩）
  const labels = AXES.map((ax, i) => {
    const [x, y] = point(i, 1.22);
    return `
      <g class="radar-label" transform="translate(${x},${y})">
        <text class="radar-label-jp" text-anchor="middle">${ax.label}</text>
        <text class="radar-label-sub" text-anchor="middle" dy="12">${ax.sub}</text>
      </g>`;
  }).join("");

  // 顶点数值
  const values = AXES.map((ax, i) => {
    const [x, y] = point(i, ab[ax.key] / 100);
    const [lx, ly] = point(i, ab[ax.key] / 100 + 0.14);
    void x;
    void y;
    return `<text class="radar-value" x="${lx}" y="${ly}" text-anchor="middle">${ab[ax.key]}</text>`;
  }).join("");

  return `
    <svg class="radar" viewBox="0 0 ${SIZE} ${SIZE}" role="img"
         aria-label="五维能力雷达图">
      <g class="radar-grid">${rings}${spokes}</g>
      <polygon class="radar-area" points="${dataPoly}" />
      ${dots}
      ${values}
      ${labels}
    </svg>`;
}
