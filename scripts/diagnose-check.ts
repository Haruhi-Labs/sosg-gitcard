// 用真实 GitHub 账号 + 合成样本验证诊断算法（node 环境，不经过浏览器缓存层）
import { computeMetrics } from "../src/metrics";
import { diagnose } from "../src/members";
import { fetchAndParseContributions } from "../src/contrib";
import type { GitHubUser, GitHubRepo, ProfileSnapshot, ContribStats } from "../src/types";

async function searchIssuesCount(q: string): Promise<number> {
  const r = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=1`);
  if (!r.ok) throw new Error(`search ${r.status}`);
  return ((await r.json()) as { total_count?: number }).total_count ?? 0;
}

async function load(username: string): Promise<ProfileSnapshot> {
  const u = await fetch(`https://api.github.com/users/${username}`);
  const user = (await u.json()) as GitHubUser;
  const r = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=pushed`);
  const repos = (await r.json()) as GitHubRepo[];
  let contrib: ContribStats | null = null;
  try {
    const [totalPRs, externalMergedPRs] = await Promise.all([
      searchIssuesCount(`type:pr author:${user.login}`),
      searchIssuesCount(`type:pr author:${user.login} is:merged -user:${user.login}`),
    ]);
    contrib = { totalPRs, externalMergedPRs };
  } catch {
    /* 搜索限流则 contrib=null */
  }
  const contributions = await fetchAndParseContributions(user.login).catch(() => null);
  return { user, repos, contrib, contributions, fetchedAt: Date.now() };
}

function line(name: string, snap: ProfileSnapshot) {
  const m = computeMetrics(snap);
  const d = diagnose(m);
  const ab = m.abilities;
  const cc = m.contrib ? `PR ${m.contrib.totalPRs}/外部合并 ${m.contrib.externalMergedPRs}` : "无PR";
  const ct = snap.contributions ? `贡献 ${snap.contributions.total}` : "无贡献";
  console.log(
    `${name.padEnd(18)} → ${d.member.typeName.padEnd(6)} ${d.member.jpName.padEnd(6)}` +
      ` | ACT ${String(ab.act).padStart(3)} STAR ${String(ab.star).padStart(3)}` +
      ` SYNC ${String(ab.sync).padStart(3)} HEAT ${String(ab.heat).padStart(3)}` +
      ` TIME ${String(ab.time).padStart(3)} | ${cc} ${ct}`,
  );
}

// ——— 合成样本 ———
function synth(
  u: Partial<GitHubUser>,
  repos: GitHubRepo[],
  contrib: ContribStats | null,
  contribTotal: number,
): ProfileSnapshot {
  const user: GitHubUser = {
    login: "x", name: "x", avatar_url: "", bio: null, html_url: "",
    public_repos: repos.length, followers: 0, following: 0,
    created_at: new Date().toISOString(), location: null, company: null, ...u,
  };
  return {
    user, repos, contrib,
    contributions: { total: contribTotal, days: [] }, fetchedAt: Date.now(),
  };
}
const repo = (language: string | null, stars = 0, fork = false): GitHubRepo => ({
  name: "r", html_url: "", fork, stargazers_count: stars, forks_count: 0, language, description: null,
});

console.log("── 合成样本 ──");
line("新人小号", synth(
  { created_at: new Date(Date.now() - 90 * 864e5).toISOString() },
  [repo("JS", 1), repo("HTML")], { totalPRs: 1, externalMergedPRs: 0 }, 120));
line("均衡中庸号", synth(
  { followers: 12, following: 15, created_at: new Date(Date.now() - 3.5 * 365 * 864e5).toISOString() },
  [repo("Go", 4), repo("Python", 3), repo("JS", 2, true), repo("Rust", 1)],
  { totalPRs: 18, externalMergedPRs: 4 }, 520));
line("社区贡献者", synth(
  { followers: 60, following: 40, created_at: new Date(Date.now() - 5 * 365 * 864e5).toISOString() },
  [repo("Go", 3), repo("Rust", 2)], { totalPRs: 190, externalMergedPRs: 72 }, 1800));
line("独狼高产号", synth(
  { followers: 300, following: 2, created_at: new Date(Date.now() - 8 * 365 * 864e5).toISOString() },
  Array.from({ length: 40 }, (_, i) => repo(["Go", "TS", "C", "Py"][i % 4], 500)),
  { totalPRs: 25, externalMergedPRs: 1 }, 2400));

console.log("── 真实账号 ──");
for (const name of ["torvalds", "gaearon", "sindresorhus"]) {
  try {
    const snap = await load(name);
    if (!snap.user.login) { console.log(`${name.padEnd(18)} → 拉取失败（可能限流）`); continue; }
    line(name, snap);
  } catch (e) {
    console.log(`${name.padEnd(18)} → 出错: ${(e as Error).message}`);
  }
}
