import type { ProfileSnapshot, Metrics, Abilities } from "./types";

// ————————————————————————————————————————————————
// 指标计算：把原始快照换算成五维能力值与展示指标
// 用对数缩放，让小号和大神账号都落在合理区间、雷达图好看。
// ————————————————————————————————————————————————

/** 对数缩放到 0–100：x=cap 时约为 100，小值也不至于贴地 */
function scale(x: number, cap: number): number {
  const v = (100 * Math.log1p(Math.max(0, x))) / Math.log1p(cap);
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function computeMetrics(snap: ProfileSnapshot): Metrics {
  const { user, repos } = snap;

  const original = repos.filter((r) => !r.fork);
  const forked = repos.filter((r) => r.fork);
  const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0);
  const totalForks = repos.reduce((s, r) => s + r.forks_count, 0);

  // 代表作：非 fork、按 star 降序取前 3
  const topRepos = [...original]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 3);

  const created = new Date(user.created_at);
  const ageMonths = Math.max(0, (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const accountAgeYears = ageMonths / 12;
  const since = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;

  const contrib = snap.contrib;
  const prTotal = contrib?.totalPRs ?? null;
  const extMerged = contrib?.externalMergedPRs ?? null;
  const extPushes = snap.externalPush?.pushes ?? 0;

  // 行動力：原创仓库产出（60 个封顶）
  const act = scale(original.length, 60);

  // 協調力：真实社区贡献。三路并列——合并进他人仓库的 PR、直推他人仓库的
  // 推送、以及关注/fork。这样「自己仓库不多却活跃投入开源」、以及「有写权限
  // 直接 push 进他人项目」的开发者都能被正确识别；无 PR/推送数据时退回旧口径。
  const hasContrib = prTotal !== null || extMerged !== null || extPushes > 0;
  const sync = hasContrib
    ? scale(
        (extMerged ?? 0) * 5 + (prTotal ?? 0) + extPushes * 4 + user.following * 0.5 + forked.length * 2,
        450,
      )
    : scale(user.following + forked.length * 4, 150);

  // 熱量：近一年贡献总量（2800 封顶）。拿不到贡献数据时用原创仓库数做粗略兜底。
  const heat = snap.contributions
    ? scale(snap.contributions.total, 2800)
    : scale(original.length * 3, 80);

  const abilities: Abilities = {
    act,
    // 影響力：star + 关注者 + 被 fork（都是「被他人认可」的量）
    star: scale(totalStars + user.followers * 2 + totalForks, 2200),
    sync,
    heat,
    // 継続力：账号年龄（144 个月 ≈ 12 年封顶）
    time: scale(ageMonths, 144),
  };

  return {
    abilities,
    contrib,
    originalRepos: original.length,
    forkedRepos: forked.length,
    totalStars,
    totalForks,
    topRepos,
    accountAgeYears,
    since,
  };
}
