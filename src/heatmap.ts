import type { Contributions, ContribDay } from "./contrib";

// ————————————————————————————————————————————————
// 贡献热力图（GitHub 绿瓷砖）—— 纯 SVG，整幅按卡片宽度自适应缩放。
// 色阶 hm-l0..4 由 CSS 用团员属性色调成「浅→深」渐变（见 style.css）。
// ————————————————————————————————————————————————

const CELL = 13; // 单元格间距
const SIZE = 11; // 方块边长
const RX = 2.5; // 圆角
const LEFT = 20; // 左侧留给星期标签
const TOP = 16; // 顶部留给月份标签

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
// 星期标签：仅标周一/三/五（对应行 1/3/5，行 0 为周日）
const WEEKDAYS: Record<number, string> = { 1: "月", 3: "水", 5: "金" };

/** 把按日升序的天数切成周列（每列 7 行，周日=0 起新列） */
function toWeeks(days: ContribDay[]): Array<Array<ContribDay | null>> {
  const weeks: Array<Array<ContribDay | null>> = [];
  let cur: Array<ContribDay | null> | null = null;
  for (const d of days) {
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    if (!cur || dow === 0) {
      cur = new Array<ContribDay | null>(7).fill(null);
      weeks.push(cur);
    }
    cur[dow] = d;
  }
  return weeks;
}

export function heatmapSVG(c: Contributions): string {
  const weeks = toWeeks(c.days);
  const width = LEFT + weeks.length * CELL;
  const height = TOP + 7 * CELL;

  const cells: string[] = [];
  const months: string[] = [];
  let lastMonth = -1;
  let lastLabelCol = -3;

  weeks.forEach((week, col) => {
    // 月份标签：该周首个有效日所属月份变化、且与上一标签间隔够宽时才打
    const rep = week.find((d): d is ContribDay => d !== null);
    if (rep) {
      const month = new Date(`${rep.date}T00:00:00Z`).getUTCMonth();
      if (month !== lastMonth && col - lastLabelCol >= 3) {
        lastMonth = month;
        lastLabelCol = col;
        months.push(
          `<text class="hm-month" x="${LEFT + col * CELL}" y="11">${MONTHS[month]}月</text>`,
        );
      } else if (month !== lastMonth) {
        lastMonth = month;
      }
    }
    week.forEach((day, row) => {
      if (!day) return;
      cells.push(
        `<rect class="hm-cell hm-l${day.level}" x="${LEFT + col * CELL}" y="${TOP + row * CELL}" ` +
          `width="${SIZE}" height="${SIZE}" rx="${RX}">` +
          `<title>${day.date}：${day.count} 贡献</title></rect>`,
      );
    });
  });

  // 星期标签（周一/三/五）
  const weekdays = Object.entries(WEEKDAYS)
    .map(
      ([row, label]) =>
        `<text class="hm-weekday" x="${LEFT - 6}" y="${TOP + Number(row) * CELL + SIZE - 2}">${label}</text>`,
    )
    .join("");

  return (
    `<svg class="heatmap" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMid meet" ` +
    `role="img" aria-label="近一年贡献热力图，共 ${c.total} 次贡献">` +
    months.join("") +
    weekdays +
    cells.join("") +
    `</svg>`
  );
}
