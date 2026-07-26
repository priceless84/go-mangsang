"use strict";

const { createServer } = require("http");
const { readFile } = require("fs/promises");
const { extname, join, normalize } = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = join(process.cwd(), "public");
const REFERENCE_URL = process.env.REFERENCE_URL || "https://mangsang-alarm-dashboard.onrender.com/";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function json(res, statusCode, payload) {
  send(res, statusCode, JSON.stringify(payload), {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function htmlToText(html) {
  return decodeEntities(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|main|h1|h2|h3|summary|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

async function referenceStatus(res) {
  const upstream = await fetch(`${REFERENCE_URL}?proxy=${Date.now()}`, { cache: "no-store" });
  const html = await upstream.text();
  json(res, upstream.ok ? 200 : upstream.status, {
    ok: upstream.ok,
    fetchedAt: new Date().toISOString(),
    source: REFERENCE_URL,
    text: htmlToText(html)
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden", { "content-type": "text/plain; charset=utf-8" });
    return;
  }

  try {
    const body = await readFile(filePath);
    send(res, 200, body, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=120"
    });
  } catch {
    const body = await readFile(join(PUBLIC_DIR, "index.html"));
    send(res, 200, body, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/reference") {
      await referenceStatus(res);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      json(res, 404, { ok: false, message: "지원하지 않는 API입니다." });
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    json(res, 502, {
      ok: false,
      message: error instanceof Error ? error.message : "참조 대시보드 연결 실패"
    });
  }
}).listen(PORT, () => {
  console.log(`go-mangsang dashboard listening on ${PORT}`);
});
