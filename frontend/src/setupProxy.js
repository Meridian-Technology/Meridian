const { createProxyMiddleware } = require("http-proxy-middleware");

function proxyApiRequest(pathname, req) {
  if (pathname.startsWith("/static/") || pathname.startsWith("/sockjs-node") || pathname === "/ws") {
    return false;
  }
  const accept = req.headers.accept || "";
  if (req.method === "GET" && accept.includes("text/html")) return false;
  return true;
}

module.exports = function setupProxy(app) {
  const port = process.env.MERIDIAN_API_PORT || "5001";
  app.use(createProxyMiddleware(proxyApiRequest, {
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    ws: true,
  }));
};
