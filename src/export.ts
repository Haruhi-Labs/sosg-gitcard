import { toPng } from "html-to-image";

// ————————————————————————————————————————————————
// 把整张档案卡渲染成高清长图并下载。全程浏览器端完成，服务器零负载。
// 用 html-to-image（基于 SVG <foreignObject>，由浏览器自身绘制，能忠实还原
// SVG 雷达/热力图、box-shadow、color-mix 与自定义字体）。
// ————————————————————————————————————————————————

const PAD = 24; // 卡片四周留白，成图更像一张海报

/** 导出档案卡为 PNG 长图并触发下载 */
export async function saveDossierImage(dossier: HTMLElement, login: string): Promise<void> {
  // 头像来自 GitHub 跨域 CDN，先内联成 data URI，避免画布被污染导致导出失败
  const img = dossier.querySelector<HTMLImageElement>(".portrait-img");
  const originalSrc = img?.getAttribute("src") ?? null;
  if (img && originalSrc && !originalSrc.startsWith("data:")) {
    try {
      img.setAttribute("src", await urlToDataUrl(originalSrc));
      // 等浏览器解码内联后的图，避免抓到空白
      if (img.decode) await img.decode().catch(() => {});
    } catch {
      /* 内联失败则退回原图，交给 html-to-image 兜底 */
    }
  }

  // html-to-image 会丢失「由 CSS class 指定的 SVG fill/stroke」（雷达面、热力图瓷砖
  // 会退化成黑色填充），故先把计算样式就地烘焙成内联样式，导出后再还原。
  const restoreSvg = bakeSvgStyles(dossier);

  try {
    const RATIO = 2; // 2 倍分辨率，文字与瓷砖清晰
    const width = dossier.offsetWidth; // 布局宽度，不受移动端 zoom 影响
    const height = dossier.offsetHeight;
    // 先抓卡片本体（含投影），留白处保持透明，稍后自绘方格纸底
    const cardUrl = await toPng(dossier, {
      pixelRatio: RATIO,
      cacheBust: true,
      width: width + PAD * 2,
      height: height + PAD * 2,
      style: {
        // 只作用于克隆体：移动端也按满分辨率导出，且不触碰可见 DOM
        zoom: "1",
        margin: "0",
        transform: `translate(${PAD}px, ${PAD}px)`,
        transformOrigin: "top left",
      },
    });
    // 合成到与站点一致的方格纸底（纸色 + 24px 冷灰网格），颜色取自实时 CSS 变量
    const dataUrl = await compositeOnPaper(
      cardUrl,
      (width + PAD * 2) * RATIO,
      (height + PAD * 2) * RATIO,
      RATIO,
    );
    triggerDownload(dataUrl, `${login}-sosg-gitcard.png`);
  } finally {
    restoreSvg();
    // 还原头像 src，别把超长 data URI 留在 DOM 里
    if (img && originalSrc) img.setAttribute("src", originalSrc);
  }
}

/**
 * 把雷达图 / 热力图里各 SVG 图形的计算填充/描边就地写成内联样式，
 * 让 html-to-image 能正确捕获（它对来自 CSS class 的 SVG 呈现属性会丢失）。
 * 返回一个还原函数，导出后调用以恢复原状。
 */
function bakeSvgStyles(root: HTMLElement): () => void {
  const els = root.querySelectorAll<SVGElement>("svg.radar *, svg.heatmap *");
  // 除填充/描边外，还要烘焙字体相关属性——SVG <text> 的字体族/字号/字重同样
  // 来自 CSS class，导出时会丢失、退化成默认衬线字体与默认字号。
  const props = [
    "fill",
    "fillOpacity",
    "stroke",
    "strokeOpacity",
    "strokeWidth",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
  ] as const;
  const saved: Array<[SVGElement, string | null]> = [];
  els.forEach((el) => {
    saved.push([el, el.getAttribute("style")]);
    const cs = getComputedStyle(el);
    for (const p of props) {
      const v = cs[p];
      if (v) el.style[p] = v;
    }
  });
  return () => {
    for (const [el, s] of saved) {
      if (s === null) el.removeAttribute("style");
      else el.setAttribute("style", s);
    }
  };
}

/** 把卡片图合成到与站点一致的方格纸背景上（纸色底 + 24px 冷灰网格） */
async function compositeOnPaper(
  cardUrl: string,
  cw: number,
  ch: number,
  ratio: number,
): Promise<string> {
  const css = getComputedStyle(document.documentElement);
  const paper = css.getPropertyValue("--paper").trim() || "#fbfaf5";
  const grid = css.getPropertyValue("--grid").trim() || "#dde6e3";
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  const card = await loadImage(cardUrl);
  if (!ctx) return cardUrl; // 拿不到 2D 上下文则退回无底图版本
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, cw, ch);
  // 24px 方格（与 body 背景同参数），线宽随分辨率放大
  ctx.strokeStyle = grid;
  ctx.lineWidth = ratio;
  const cell = 24 * ratio;
  ctx.beginPath();
  for (let x = cell; x < cw; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ch);
  }
  for (let y = cell; y < ch; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(cw, y);
  }
  ctx.stroke();
  // 不透明的卡片盖在网格上，仅四周留白露出方格纸——与网页观感一致
  ctx.drawImage(card, 0, 0);
  return canvas.toDataURL("image/png");
}

/** 加载图片（data URL）为 Image 元素 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

/** 跨域拉取资源并转成 data URI */
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 用临时 <a> 触发下载 */
function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
