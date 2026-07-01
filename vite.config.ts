import { defineConfig, type Plugin } from "vite";
import { fetchAndParseContributions } from "./src/contrib";

// 本地开发中间件：复刻生产环境的 Pages Function /api/contributions，
// 让 `npm run dev` 也能端到端拿到贡献热力图（Node 端抓取 github.com，无跨域问题）。
function contribDevApi(): Plugin {
  return {
    name: "contrib-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/contributions")) return next();
        const user = new URL(req.url, "http://localhost").searchParams.get("user")?.trim() ?? "";
        const send = (body: unknown, status: number) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        };
        if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(user)) return send({ error: "invalid user" }, 400);
        fetchAndParseContributions(user)
          .then((data) => send(data, 200))
          .catch(() => send({ error: "upstream failed" }, 502));
      });
    },
  };
}

// 纯静态站点：把 GitHub 数据获取全部交给浏览器，服务器零负载。
// 部署时任意路径都回落到 index.html（SPA 式路由），以支持 /用户名 直接访问。
export default defineConfig({
  base: "./",
  plugins: [contribDevApi()],
  build: {
    target: "es2019",
    // 单页展示，无需拆包，减少请求数
    cssCodeSplit: false,
  },
});
