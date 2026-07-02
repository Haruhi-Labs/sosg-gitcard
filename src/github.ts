import type { GitHubUser, GitHubRepo, ProfileSnapshot, ContribStats } from "./types";
import type { Contributions } from "./contrib";

// ————————————————————————————————————————————————
// GitHub API 客户端
// 全部在浏览器端直连 api.github.com，服务器零负载。
// 未登录额度为每 IP 60 次/小时，因此：
//   1. 每份档案只发 2 个核心请求（user + repos 单页 100 条），
//      另有 2 次 Search（独立额度）与 1 次同源贡献代理（不占核心额度）
//   2. localStorage 缓存 30 分钟，命中即不发请求
//   3. 触发限流时优先回退到过期缓存，再不行才友好报错
// ————————————————————————————————————————————————

const API = "https://api.github.com";
// v8：移除直推他人仓库统计，升版以让旧缓存自然失效
const CACHE_PREFIX = "sos-profile-v8:";
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟

/** 限流错误：携带额度重置时间，供 UI 提示 */
export class RateLimitError extends Error {
  constructor(public resetAt: Date | null) {
    super("GitHub API 额度暂时用尽");
    this.name = "RateLimitError";
  }
}

/** 用户不存在 */
export class NotFoundError extends Error {
  constructor(public username: string) {
    super(`找不到叫「${username}」的团员`);
    this.name = "NotFoundError";
  }
}

function cacheKey(username: string) {
  return CACHE_PREFIX + username.toLowerCase();
}

/** 读取缓存；allowStale=true 时忽略过期时间（限流兜底用） */
function readCache(username: string, allowStale = false): ProfileSnapshot | null {
  try {
    const raw = localStorage.getItem(cacheKey(username));
    if (!raw) return null;
    const snap = JSON.parse(raw) as ProfileSnapshot;
    if (!allowStale && Date.now() - snap.fetchedAt > CACHE_TTL) return null;
    return snap;
  } catch {
    return null;
  }
}

function writeCache(username: string, snap: ProfileSnapshot) {
  try {
    localStorage.setItem(cacheKey(username), JSON.stringify(snap));
  } catch {
    // localStorage 写满或被禁用时静默降级，不影响主流程
  }
}

/** 统一的请求封装：区分 404 / 限流 / 其它错误 */
async function ghFetch(path: string): Promise<Response> {
  const res = await fetch(API + path, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (res.status === 404) {
    throw new NotFoundError(path);
  }

  // 403/429 且剩余额度为 0 → 限流
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || res.status === 429) {
      const resetHeader = res.headers.get("x-ratelimit-reset");
      const resetAt = resetHeader ? new Date(Number(resetHeader) * 1000) : null;
      throw new RateLimitError(resetAt);
    }
  }

  if (!res.ok) {
    throw new Error(`GitHub API 返回 ${res.status}`);
  }
  return res;
}

/**
 * 用 issue 搜索数一类结果的总数（per_page=1 只为拿 total_count，尽量省流量）。
 * Search 有独立的限流额度（未登录约 10 次/分钟），不占用核心 60 次/小时。
 */
async function searchIssuesCount(query: string): Promise<number> {
  const res = await fetch(
    `${API}/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = (await res.json()) as { total_count?: number };
  return data.total_count ?? 0;
}

/**
 * 拉取跨仓库的协作贡献统计（PR 总数、对他人项目的合并 PR）。
 * 两项各自独立获取：任一失败仅该项为 null；全失败才整体返回 null。
 * 这是「自己项目不多、却活跃投入开源社区」这类开发者的关键信号。
 */
export async function fetchContrib(login: string): Promise<ContribStats | null> {
  const settled = await Promise.allSettled([
    searchIssuesCount(`type:pr author:${login}`),
    // 已合并、且不在自己名下的仓库 = 对他人项目的实打实贡献
    searchIssuesCount(`type:pr author:${login} is:merged -user:${login}`),
  ]);
  if (settled.every((r) => r.status === "rejected")) return null;
  const val = (r: PromiseSettledResult<number>) => (r.status === "fulfilled" ? r.value : null);
  return { totalPRs: val(settled[0]), externalMergedPRs: val(settled[1]) };
}

/**
 * 拉取近一年贡献日历。走同源代理 /api/contributions（生产为 Cloudflare Pages
 * Function，本地为 Vite 中间件），绕开 github.com 的浏览器跨域限制。
 * 代理不可用或失败时返回 null，档案照常展示、仅省略热力图。
 */
export async function fetchContributions(login: string): Promise<Contributions | null> {
  try {
    const res = await fetch(`/api/contributions?user=${encodeURIComponent(login)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Contributions;
    return Array.isArray(data.days) ? data : null;
  } catch {
    return null;
  }
}

/**
 * 拉取一位用户的完整档案快照。
 * 优先命中新鲜缓存；网络出错或限流时回退到过期缓存（若有）。
 */
export async function fetchProfile(username: string): Promise<ProfileSnapshot> {
  const fresh = readCache(username);
  if (fresh) return fresh;

  try {
    const userRes = await ghFetch(`/users/${encodeURIComponent(username)}`);
    const user = (await userRes.json()) as GitHubUser;

    // 先取仓库列表；提交统计依赖它，故与贡献统计一道并行拉取
    const repos = (await ghFetch(
      `/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`,
    ).then((r) => r.json())) as GitHubRepo[];

    // 用 API 返回的规范化 login 查询，避免大小写偏差
    const [contrib, contributions] = await Promise.all([
      fetchContrib(user.login),
      fetchContributions(user.login),
    ]);

    const snap: ProfileSnapshot = {
      user,
      repos,
      contrib,
      contributions,
      fetchedAt: Date.now(),
    };
    writeCache(username, snap);
    return snap;
  } catch (err) {
    // 限流或网络异常时，若有旧缓存则降级返回，保证还能看到档案
    if (err instanceof RateLimitError || err instanceof TypeError) {
      const stale = readCache(username, true);
      if (stale) return stale;
    }
    throw err;
  }
}
