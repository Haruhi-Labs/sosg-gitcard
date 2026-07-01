// Cloudflare Pages Function —— 与静态站同源，代理 GitHub 贡献日历。
// 路由：GET /api/contributions?user={login}
// 在边缘服务端抓取 github.com（无跨域限制），解析成 JSON 返回给浏览器。
import { fetchAndParseContributions } from "../../src/contrib";

function json(body: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url);
  const user = url.searchParams.get("user")?.trim() ?? "";
  // GitHub 用户名规则：字母数字与连字符，最长 39
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(user)) {
    return json({ error: "invalid user" }, 400);
  }
  try {
    const data = await fetchAndParseContributions(user);
    // 边缘缓存 30 分钟，进一步降低对 github.com 的回源与延迟
    return json(data, 200, 1800);
  } catch {
    return json({ error: "upstream failed" }, 502);
  }
}
