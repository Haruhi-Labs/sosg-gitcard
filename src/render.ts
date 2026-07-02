import type { ProfileSnapshot } from "./types";
import { computeMetrics } from "./metrics";
import { diagnose, MEMBERS } from "./members";
import { radarSVG } from "./radar";
import { heatmapSVG } from "./heatmap";
import { RateLimitError, NotFoundError } from "./github";
import { saveDossierImage } from "./export";

// ————————————————————————————————————————————————
// 视图渲染层：所有界面都在这里生成
// navigate(username) 由 main.ts 注入，负责改地址栏并重新路由
// ————————————————————————————————————————————————

type Navigate = (username: string) => void;

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** 大数字缩写：1234 → 1.2k（用于 star/关注者等可能极大的量） */
function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "k";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

/** 精确数字，带千分位：3226 → 3,226（用于贡献等需要看清具体值的量） */
function fmtExact(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 由用户名派生稳定的 4 位档案编号 */
function fileNo(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) & 0xffff;
  return String(h % 10000).padStart(4, "0");
}

/** 复用的检索框：输入用户名 → navigate */
function searchForm(placeholder: string, autofocus = false): string {
  return `
    <form class="search" role="search">
      <span class="search-prefix">harufan/</span>
      <input class="search-input" name="u" type="text" autocomplete="off"
             spellcheck="false" placeholder="${placeholder}" ${autofocus ? "autofocus" : ""} />
      <button class="search-go" type="submit" aria-label="检索团员">認定 →</button>
    </form>`;
}

function bindSearch(root: HTMLElement, navigate: Navigate) {
  const form = root.querySelector<HTMLFormElement>(".search");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = form.querySelector<HTMLInputElement>(".search-input");
    const v = input?.value.trim().replace(/^@/, "").replace(/^.*github\.com\//, "").split(/[/?#]/)[0];
    if (v) navigate(v);
  });
}

/** 绑定「保存为长图」按钮：把当前档案卡导出成 PNG 下载 */
function bindSaveImage(root: HTMLElement, login: string) {
  const btn = root.querySelector<HTMLButtonElement>(".save-img");
  const dossier = root.querySelector<HTMLElement>(".dossier");
  if (!btn || !dossier) return;
  const label = btn.textContent ?? "保存为长图 ↓";
  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = "生成中…";
    try {
      await saveDossierImage(dossier, login);
      btn.textContent = "已保存 ✓";
      setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, 1600);
    } catch {
      btn.textContent = "生成失败，重试";
      btn.disabled = false;
    }
  });
}

// ——————————————————— 落地页 ———————————————————

export function renderLanding(root: HTMLElement, navigate: Navigate) {
  root.innerHTML = `
    <main class="landing">
      <div class="landing-emblem">SOS<span>団</span></div>
      <h1 class="landing-title">団員ファイル</h1>
      <p class="landing-lead">
        把 GitHub 域名改成 <b>harufan</b>，<br class="only-mobile" />
        查看你在 SOS団 中的身份。
      </p>
      <p class="landing-hint">输入 GitHub 用户名，接受团员认定 ——</p>
      ${searchForm("torvalds", true)}
      <p class="landing-note">
        世界を大いに盛り上げるための涼宮ハルヒの団 ·
        数据实时取自 GitHub 公开接口，仅供娱乐
      </p>
    </main>`;
  bindSearch(root, navigate);
}

// ——————————————————— 加载中 ———————————————————

export function renderLoading(root: HTMLElement, username: string) {
  root.innerHTML = `
    <main class="status">
      <div class="status-emblem spin">団</div>
      <p class="status-text">正在调阅「${esc(username)}」的档案…</p>
    </main>`;
}

// ——————————————————— 错误页 ———————————————————

export function renderError(root: HTMLElement, err: unknown, username: string, navigate: Navigate) {
  let glyph = "？";
  let title = "档案调阅失败";
  let detail = "发生了未知的封锁事项，稍后再试试看。";

  if (err instanceof NotFoundError) {
    glyph = "?";
    title = "查无此团员";
    detail = `SOS団 名册里没有叫「${esc(username)}」的人。是不是拼错了？`;
  } else if (err instanceof RateLimitError) {
    glyph = "!";
    title = "情报接口暂时超载";
    const t = err.resetAt
      ? err.resetAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
      : "稍后";
    detail = `GitHub 每小时的免费额度用完了，${t} 左右恢复。这是禁则事项です！`;
  }

  root.innerHTML = `
    <main class="status">
      <div class="status-emblem err">${glyph}</div>
      <h2 class="status-title">${title}</h2>
      <p class="status-text">${detail}</p>
      ${searchForm("换一个用户名")}
      <button class="link-back" type="button">← 回到立案窗口</button>
    </main>`;
  bindSearch(root, navigate);
  root.querySelector(".link-back")?.addEventListener("click", () => navigate(""));
}

// ——————————————————— 档案卡（主视图） ———————————————————

export function renderDossier(root: HTMLElement, snap: ProfileSnapshot, navigate: Navigate) {
  const { user } = snap;
  const m = computeMetrics(snap);
  const { member, scores } = diagnose(m);
  const ab = m.abilities;

  const displayName = user.name ?? user.login;
  const no = fileNo(user.login);

  // 能力条
  const bars = (
    [
      ["行動力", "ACT", ab.act],
      ["影響力", "STAR", ab.star],
      ["協調力", "SYNC", ab.sync],
      ["熱量", "HEAT", ab.heat],
      ["継続力", "TIME", ab.time],
    ] as const
  )
    .map(
      ([label, sub, val], i) => `
      <div class="bar-row" style="--i:${i}">
        <span class="bar-label">${label}<i>${sub}</i></span>
        <span class="bar-track"><span class="bar-fill" style="--w:${val}%"></span></span>
        <span class="bar-num">${val}</span>
      </div>`,
    )
    .join("");

  // 数据档案格
  const stats = (
    [
      ["REPOS", fmt(m.originalRepos), "原创仓库"],
      ["STARS", fmt(m.totalStars), "累计星标"],
      ["FORKS", fmt(m.totalForks), "被 fork"],
      ["FOLLOWERS", fmt(user.followers), "关注者"],
      ["FOLLOWING", fmt(user.following), "关注中"],
      ["SINCE", m.since, "入团年月"],
    ] as const
  )
    .map(
      ([k, v, cn]) => `
      <li class="stat">
        <span class="stat-k">${k}</span>
        <span class="stat-v">${esc(v)}</span>
        <span class="stat-cn">${cn}</span>
      </li>`,
    )
    .join("");

  // 代表作
  const works = m.topRepos.length
    ? m.topRepos
        .map(
          (r, i) => `
        <li class="work">
          <span class="work-rank">${i + 1}</span>
          <div class="work-main">
            <a class="work-name" href="${esc(r.html_url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
            ${r.description ? `<p class="work-desc">${esc(r.description)}</p>` : ""}
          </div>
          <div class="work-meta">
            ${r.language ? `<span class="work-lang">${esc(r.language)}</span>` : ""}
            <span class="work-star">★ ${fmt(r.stargazers_count)}</span>
          </div>
        </li>`,
        )
        .join("")
    : `<li class="empty">还没有拿得出手的代表作，未来可期。</li>`;

  // 活動記録：近一年贡献热力图（绿瓷砖）。代理拿不到时整块省略。
  const contributions = snap.contributions;
  const activityBlock = contributions
    ? `
    <section class="activity">
      <div class="activity-head">
        <span class="section-eyebrow">活動記録 · ACTIVITY</span>
        <span class="activity-total"><b>${fmtExact(contributions.total)}</b> 近一年贡献</span>
      </div>
      <div class="heatmap-wrap">${heatmapSVG(contributions)}</div>
      <div class="heatmap-legend">
        <span>少</span>
        <i class="hm-l0"></i><i class="hm-l1"></i><i class="hm-l2"></i><i class="hm-l3"></i><i class="hm-l4"></i>
        <span>多</span>
      </div>
    </section>`
    : "";

  // 協力実績：跨仓库的社区贡献。三路并列——发起的 PR、合并进他人仓库的 PR、
  // 直推他人仓库的推送。各字段可能因限流/接口缺失而为 null，缺则显示占位。
  const pr = m.contrib?.totalPRs ?? null;
  const ext = m.contrib?.externalMergedPRs ?? null;
  const push = snap.externalPush;
  const pushes = push?.pushes ?? 0;

  // 说明文案：把「合并进他人 PR」与「直推他人仓库」拼成一句
  const parts: string[] = [];
  if (pr !== null && pr > 0) {
    const merged = ext !== null && ext > 0 ? `，其中 ${fmtExact(ext)} 个合并进他人仓库` : "";
    parts.push(`累计发起 ${fmtExact(pr)} 个 PR${merged}`);
  } else if (ext !== null && ext > 0) {
    parts.push(`有 ${fmtExact(ext)} 个 PR 合并进他人仓库`);
  }
  if (pushes > 0) {
    parts.push(`近期直接向他人的 ${push!.repos} 个仓库推送了 ${fmtExact(pushes)} 次`);
  }

  let contribNote: string;
  if (pr === null && ext === null && push === null) {
    contribNote = "情报接口繁忙，暂时调取不到协力记录，稍后刷新再试。";
  } else if ((ext !== null && ext > 0) || pushes > 0) {
    contribNote = `积极投身开源社区——${parts.join("；")}。`;
  } else if (pr !== null && pr > 0) {
    contribNote = `目前主要深耕自己的项目，累计发起 ${fmtExact(pr)} 个 PR。`;
  } else {
    contribNote = "档案里还没有对他人项目的贡献记录，社区的舞台正等着你。";
  }

  const contribBlock = `
    <section class="contrib">
      <div class="section-eyebrow">協力実績 · CONTRIBUTION</div>
      <div class="contrib-grid">
        <div class="contrib-cell">
          <span class="contrib-num">${pr !== null ? fmtExact(pr) : "—"}</span>
          <span class="contrib-label">累计 PR<i>PULL REQUESTS</i></span>
        </div>
        <div class="contrib-cell hl">
          <span class="contrib-num">${ext !== null ? fmtExact(ext) : "—"}</span>
          <span class="contrib-label">合并进他人<i>MERGED PR</i></span>
        </div>
        <div class="contrib-cell">
          <span class="contrib-num">${push ? fmtExact(push.pushes) : "—"}</span>
          <span class="contrib-label">直推他人<i>DIRECT PUSH</i></span>
        </div>
      </div>
      <p class="contrib-note">${contribNote}</p>
    </section>`;

  // 全员契合度（把诊断的透明度也展示出来，做成小标尺）
  const affinity = (Object.keys(scores) as Array<keyof typeof scores>)
    .map((id) => ({ id, mem: MEMBERS[id], score: scores[id] }))
    .sort((a, b) => b.score - a.score);
  const maxScore = affinity[0].score || 1;
  const affinityBars = affinity
    .map(
      (x) => `
      <div class="aff ${x.id === member.id ? "aff-win" : ""}">
        <span class="aff-glyph" style="--c:${x.mem.accent}">${x.mem.glyph}</span>
        <span class="aff-name">${x.mem.jpName}</span>
        <span class="aff-track"><span class="aff-fill"
          style="--w:${Math.max(4, Math.round((x.score / maxScore) * 100))}%;--c:${x.mem.accent}"></span></span>
        <span class="aff-mark">${x.id === member.id ? "認定" : ""}</span>
      </div>`,
    )
    .join("");

  root.innerHTML = `
    <div class="stage">
      <article class="dossier" data-member="${member.id}"
        style="--accent:${member.accent};--accent-soft:${member.accentSoft}">

        <header class="band">
          <div class="band-emblem">SOS<span>団</span></div>
          <div class="band-meta">
            <span class="band-file">団員ファイル</span>
            <span class="band-no">No.<b>${no}</b></span>
          </div>
          <div class="band-sub">SOSG · MEMBER DOSSIER</div>
        </header>

        <div class="idrow">
          <div class="portrait">
            <img class="portrait-img" src="${esc(user.avatar_url)}&s=240" alt="${esc(displayName)} 的头像"
                 loading="eager" width="120" height="120" />
            <span class="portrait-corner tl"></span><span class="portrait-corner tr"></span>
            <span class="portrait-corner bl"></span><span class="portrait-corner br"></span>
          </div>

          <div class="diag">
            <span class="eyebrow">診断結果 · DIAGNOSIS</span>
            <h1 class="diag-type">
              <span class="diag-glyph">${member.glyph}</span>
              <span class="diag-name">${member.jpName}<b class="diag-kata">型</b></span>
            </h1>
            <div class="diag-code">${member.codename} · ${member.typeName}</div>
            <p class="diag-quote">「${esc(member.quote)}」</p>
            <p class="diag-blurb">${esc(member.blurb)}</p>
          </div>

          <div class="stamp" aria-hidden="true">
            <span class="stamp-main">認定</span>
            <span class="stamp-sub">SOS団</span>
          </div>
        </div>

        <div class="who">
          <span class="who-name">${esc(displayName)}</span>
          <a class="who-login" href="${esc(user.html_url)}" target="_blank" rel="noopener">@${esc(user.login)} ↗</a>
          ${user.bio ? `<p class="who-bio">${esc(user.bio)}</p>` : ""}
        </div>

        <section class="abilities">
          <div class="ability-radar">${radarSVG(ab)}</div>
          <div class="ability-bars">
            <div class="section-eyebrow">能力評定 · ABILITY</div>
            ${bars}
          </div>
        </section>

        ${activityBlock}

        <section class="datafile">
          <div class="datafile-head"><span>DATA FILE</span><span class="datafile-dots">· · ·</span></div>
          <ul class="stat-grid">${stats}</ul>
        </section>

        ${contribBlock}

        <section class="works">
          <div class="section-eyebrow">代表作 · TOP REPOS</div>
          <ol class="work-list">${works}</ol>
        </section>

        <section class="affinity">
          <div class="section-eyebrow">全員契合度 · AFFINITY</div>
          <div class="aff-list">${affinityBars}</div>
        </section>

        <footer class="foot">
          <span class="foot-text">本档案由 SOS団 依据 GitHub 公开数据自动签发 · 仅供娱乐</span>
          <span class="foot-seal">団</span>
        </footer>
      </article>

      <div class="restage">
        <button class="save-img" type="button">保存为长图 ↓</button>
        <span class="restage-hint">立案下一位团员：</span>
        ${searchForm("换个用户名")}
        <button class="link-back" type="button">← 立案窗口</button>
      </div>
    </div>`;

  bindSearch(root, navigate);
  root.querySelector(".link-back")?.addEventListener("click", () => navigate(""));
  bindSaveImage(root, snap.user.login);

  // 头像加载失败兜底
  const img = root.querySelector<HTMLImageElement>(".portrait-img");
  img?.addEventListener("error", () => {
    img.replaceWith(
      Object.assign(document.createElement("div"), {
        className: "portrait-fallback",
        textContent: displayName.slice(0, 1).toUpperCase(),
      }),
    );
  });
}
