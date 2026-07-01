// ————————————————————————————————————————————————
// GitHub 贡献日历（绿瓷砖）解析器 —— 纯函数，无 DOM 依赖
// 供两处复用：Cloudflare Pages Function（生产）与 Vite 开发中间件（本地）
// 数据源为 github.com/users/{login}/contributions 的 HTML 片段。
// ————————————————————————————————————————————————

export interface ContribDay {
  /** yyyy-mm-dd */
  date: string;
  /** 当天贡献数 */
  count: number;
  /** GitHub 的 0–4 色阶 */
  level: number;
}

export interface Contributions {
  /** 近一年贡献总数 */
  total: number;
  /** 每日贡献，按日期升序 */
  days: ContribDay[];
}

/**
 * 从贡献 HTML 片段解析出每日贡献。
 * 日期格：<td data-date="…" id="…" data-level="…">
 * 数值在对应的：<tool-tip for="同一个 id">N contributions on …</tool-tip>
 */
export function parseContributions(html: string): Contributions {
  // 1) 先按 id 收集每格的贡献数
  const counts = new Map<string, number>();
  const ttRe = /<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;
  let m: RegExpExecArray | null;
  while ((m = ttRe.exec(html))) {
    const id = m[1];
    const cm = m[2].match(/^\s*(No|[\d,]+)\s+contribution/i);
    const count = cm && cm[1].toLowerCase() !== "no" ? parseInt(cm[1].replace(/,/g, ""), 10) : 0;
    counts.set(id, count);
  }

  // 2) 再遍历日期格，按 id 关联到贡献数
  const days: ContribDay[] = [];
  const cellRe = /<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g;
  while ((m = cellRe.exec(html))) {
    const tag = m[0];
    const id = tag.match(/\bid="([^"]+)"/)?.[1] ?? "";
    const level = Number(tag.match(/\bdata-level="(\d+)"/)?.[1] ?? 0);
    days.push({ date: m[1], count: counts.get(id) ?? 0, level });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  const total = days.reduce((s, d) => s + d.count, 0);
  return { total, days };
}

/** 拉取并解析某用户的贡献日历（在 Node/Worker 端调用，无跨域限制） */
export async function fetchAndParseContributions(login: string): Promise<Contributions> {
  const url = `https://github.com/users/${encodeURIComponent(login)}/contributions`;
  // 用接近浏览器的请求头，降低被 github.com 限流的概率；失败重试一次
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
  };
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return parseContributions(await res.text());
    lastStatus = res.status;
  }
  throw new Error(`contributions ${lastStatus}`);
}
