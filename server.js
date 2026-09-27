// Digital Justice Hub: stakeholder demonstration server.
// Serves the single-page prototype. Fictional training material only; no learner data is stored server-side.
const http = require("http");
const fs = require("fs");
const path = require("path");
const PAGE = fs.readFileSync(path.join(__dirname, "index.html"));
const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "SAMEORIGIN",
  "cache-control": "no-cache"
};
http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  if (url === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("User-agent: *\nDisallow: /\n"); }
  res.writeHead(200, HEADERS); res.end(PAGE);
}).listen(Number(process.env.PORT) || 3000, () => console.log("DJH demo listening"));
