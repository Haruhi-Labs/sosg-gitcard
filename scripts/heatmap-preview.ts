// 离线预览：用 mock 数据渲染 5 种团员属性色下的热力图，检验对比度（不碰 GitHub）
import { heatmapSVG } from "../src/heatmap";
import { MEMBERS } from "../src/members";
import type { Contributions } from "../src/contrib";
import { writeFileSync } from "node:fs";

function mock(seed: number): Contributions {
  const days: Contributions["days"] = [];
  const start = Date.UTC(2025, 5, 30);
  let total = 0;
  for (let i = 0; i < 371; i++) {
    const d = new Date(start + i * 864e5);
    const r = Math.abs(Math.sin(seed * 13.7 + i * 0.7)) * Math.abs(Math.cos(i * 0.11 + seed));
    let level = 0;
    let count = 0;
    if (r > 0.32) { level = 1; count = 2; }
    if (r > 0.5) { level = 2; count = 9; }
    if (r > 0.66) { level = 3; count = 17; }
    if (r > 0.8) { level = 4; count = 33; }
    total += count;
    days.push({ date: d.toISOString().slice(0, 10), count, level });
  }
  return { total, days };
}

const css = `
  :root{--ink:#23201c;--ink-soft:#736c61;--card:#fffefb;--f-mono:"Space Mono",monospace;--f-jp:"Zen Kaku Gothic New",sans-serif;--f-display:"Anton",sans-serif;}
  body{background:#f0f0ea;margin:0;padding:24px;font-family:var(--f-jp);}
  .block{max-width:560px;margin:0 auto 22px;background:var(--card);border:2px solid var(--ink);box-shadow:5px 5px 0 rgba(0,0,0,.12);padding:16px 20px;}
  .name{font-family:var(--f-jp);font-weight:900;font-size:15px;margin-bottom:8px;}
  .activity-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;}
  .section-eyebrow{font-family:var(--f-mono);font-size:10px;letter-spacing:.28em;color:var(--ink-soft);}
  .activity-total{font-family:var(--f-mono);font-size:12px;color:var(--ink-soft);}
  .activity-total b{font-family:var(--f-display);font-size:22px;margin-right:4px;}
  .heatmap-wrap{width:100%;}
  .heatmap{display:block;width:100%;height:auto;}
  .hm-cell{stroke:rgba(27,23,20,.07);stroke-width:.6;}
  .hm-l0{fill:#e7e9ec;}
  .hm-l1{fill:color-mix(in srgb,var(--accent) 32%,#fff);}
  .hm-l2{fill:color-mix(in srgb,var(--accent) 64%,#fff);}
  .hm-l3{fill:var(--accent);}
  .hm-l4{fill:color-mix(in srgb,var(--accent) 58%,var(--ink));}
  .hm-month{font-family:var(--f-mono);font-size:9px;fill:var(--ink-soft);}
  .hm-weekday{font-family:var(--f-jp);font-size:8px;fill:var(--ink-soft);text-anchor:end;}
  .legend{display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:10px;font-family:var(--f-mono);font-size:10px;color:var(--ink-soft);}
  .legend i{width:11px;height:11px;border-radius:2.5px;display:inline-block;box-shadow:inset 0 0 0 .6px rgba(27,23,20,.07);}
  .legend .hm-l0{background:#e7e9ec;}.legend .hm-l1{background:color-mix(in srgb,var(--accent) 32%,#fff);}
  .legend .hm-l2{background:color-mix(in srgb,var(--accent) 64%,#fff);}.legend .hm-l3{background:var(--accent);}
  .legend .hm-l4{background:color-mix(in srgb,var(--accent) 58%,var(--ink));}
`;

const blocks = Object.values(MEMBERS)
  .map((m, i) => {
    const c = mock(i + 1);
    return `<div class="block" style="--accent:${m.accent}">
      <div class="name" style="color:${m.accent}">${m.jpName} · ${m.typeName}（${m.accent}）</div>
      <div class="activity-head"><span class="section-eyebrow">活動記録 · ACTIVITY</span>
        <span class="activity-total"><b style="color:${m.accent}">${(c.total / 1000).toFixed(1)}k</b> 近一年贡献</span></div>
      <div class="heatmap-wrap">${heatmapSVG(c)}</div>
      <div class="legend"><span>少</span><i class="hm-l0"></i><i class="hm-l1"></i><i class="hm-l2"></i><i class="hm-l3"></i><i class="hm-l4"></i><span>多</span></div>
    </div>`;
  })
  .join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Space+Mono:wght@400;700&family=Zen+Kaku+Gothic+New:wght@400;700;900&display=swap" rel="stylesheet">
<style>${css}</style></head><body>${blocks}</body></html>`;

const out = process.argv[2] || "/tmp/heatmap-preview.html";
writeFileSync(out, html);
console.log("written", out);
