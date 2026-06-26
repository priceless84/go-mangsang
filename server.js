"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "events.json");
const MAX_EVENTS = 1000;

const state = {
  startedAt: new Date().toISOString(),
  lastReportAt: null,
  lastRefreshAt: null,
  previousRefreshAt: null,
  monitor: {
    count: 0,
    totalRequests: 0,
    activeCount: 0,
    range: "-",
    intervalSec: null
  },
  active: [],
  events: []
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

function loadEvents() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (Array.isArray(parsed)) state.events = parsed.slice(-MAX_EVENTS);
  } catch {
    state.events = [];
  }
}

function saveEvents() {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state.events.slice(-MAX_EVENTS), null, 2), "utf8");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeItem(item) {
  return {
    id: String(item.id || `${item.date || ""}|${item.category || ""}|${item.roomName || ""}|${item.fcltyCode || ""}|${item.resveNoCode || ""}`),
    date: String(item.date || "-"),
    category: String(item.category || "-"),
    roomName: String(item.roomName || "-"),
    fcltyCode: String(item.fcltyCode || "-"),
    fcltyTyCode: String(item.fcltyTyCode || "-"),
    resveNoCode: String(item.resveNoCode || "-"),
    detectedAt: item.detectedAt || new Date().toISOString()
  };
}

function upsertEvents(items) {
  const known = new Map(state.events.map(event => [event.id, event]));

  for (const raw of items) {
    const item = normalizeItem(raw);
    if (!known.has(item.id)) {
      known.set(item.id, item);
      state.events.push(item);
    }
  }

  state.events = state.events.slice(-MAX_EVENTS);
  saveEvents();
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const requestedPath = pathname === "/collector-console.js"
    ? path.join(__dirname, "collector-console.js")
    : path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!requestedPath.startsWith(PUBLIC_DIR) && requestedPath !== path.join(__dirname, "collector-console.js")) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(requestedPath, (err, data) => {
    if (err) {
      sendText(res, 404, "Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": getContentType(requestedPath),
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(data);
  });
}

async function handleApi(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/api/status") {
    sendJson(res, 200, {
      ok: true,
      ...state,
      eventCount: state.events.length
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    sendJson(res, 200, {
      ok: true,
      active: state.active,
      events: state.events.slice().reverse(),
      status: {
        startedAt: state.startedAt,
        lastReportAt: state.lastReportAt,
        lastRefreshAt: state.lastRefreshAt,
        previousRefreshAt: state.previousRefreshAt,
        monitor: state.monitor
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/report") {
    try {
      const payload = JSON.parse(await readBody(req) || "{}");
      const now = new Date().toISOString();
      const active = Array.isArray(payload.active) ? payload.active.map(normalizeItem) : [];

      state.previousRefreshAt = state.lastRefreshAt;
      state.lastRefreshAt = payload.refreshedAt || now;
      state.lastReportAt = now;
      state.active = active;
      state.monitor = {
        count: Number(payload.count || 0),
        totalRequests: Number(payload.totalRequests || 0),
        activeCount: active.length,
        range: String(payload.range || "-"),
        intervalSec: payload.intervalSec ?? null
      };

      upsertEvents(active);

      sendJson(res, 200, { ok: true, activeCount: active.length, eventCount: state.events.length });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    state.active = [];
    state.events = [];
    saveEvents();
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { ok: false, error: "API not found" });
}

loadEvents();

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Mangsang alarm dashboard running at http://localhost:${PORT}`);
});
