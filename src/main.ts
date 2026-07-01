import "./style.css";
import { fetchProfile } from "./github";
import { renderLanding, renderLoading, renderError, renderDossier } from "./render";

// ————————————————————————————————————————————————
// 入口：解析 URL 里的用户名 → 拉数据 → 渲染档案
// 路由完全在客户端完成，服务器只需把任意路径回落到 index.html
// ————————————————————————————————————————————————

const app = document.getElementById("app")!;

// 档案卡的设计宽度。移动端不重排，而是把整张卡按可用宽度等比缩放（CSS zoom），
// 保持与桌面完全一致的布局与比例——正因为这是竖长条设计，缩放即可完美适配。
const DESIGN_WIDTH = 560;
const SIDE_GAP = 12; // 卡片两侧预留的最小边距
function fitDossier() {
  const card = app.querySelector<HTMLElement>(".dossier");
  if (!card) return;
  // 用视口宽度（clientWidth 已排除滚动条）减去两侧边距，算等比缩放系数
  const vw = document.documentElement.clientWidth;
  const scale = Math.min(1, (vw - SIDE_GAP * 2) / DESIGN_WIDTH);
  card.style.zoom = String(scale);
  // 底部检索区同步缩放，保持与卡片一致的比例
  const restage = app.querySelector<HTMLElement>(".restage");
  if (restage) restage.style.zoom = String(scale);
}
window.addEventListener("resize", fitDossier);

/** 从地址栏解析用户名：优先路径 /用户名，其次 ?u=用户名 */
function parseUsername(): string {
  const path = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, "");
  if (path && !path.includes(".")) return path.split("/")[0];
  const q = new URLSearchParams(location.search).get("u");
  return q?.trim() ?? "";
}

/** 跳转到某位团员（空字符串 = 回落地页），并压入历史记录 */
function navigate(username: string) {
  const clean = username.trim().replace(/^@/, "");
  const url = clean ? `${import.meta.env.BASE_URL}${encodeURIComponent(clean)}` : import.meta.env.BASE_URL;
  history.pushState({ username: clean }, "", url);
  route();
}

async function route() {
  const username = parseUsername();
  window.scrollTo(0, 0);

  if (!username) {
    document.title = "SOS団 団員ファイル — GitHub 档案认定";
    renderLanding(app, navigate);
    return;
  }

  document.title = `${username} · SOS団 団員ファイル`;
  renderLoading(app, username);

  try {
    const snap = await fetchProfile(username);
    renderDossier(app, snap, navigate);
    fitDossier(); // 渲染后立即等比缩放，避免窄屏出现横向溢出闪烁
    document.title = `${snap.user.name ?? snap.user.login} · SOS団 団員ファイル`;
  } catch (err) {
    renderError(app, err, username, navigate);
  }
}

// 浏览器前进/后退
window.addEventListener("popstate", route);

route();
