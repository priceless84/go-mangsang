"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, "public"))
  ? path.join(__dirname, "public")
  : __dirname;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "events.json");
const MAX_EVENTS = 2000;
const CONFIG_PASSWORD = process.env.CONFIG_PASSWORD || "6185";

const state = {
  startedAt: new Date().toISOString(),
  lastReportAt: null,
  lastRefreshAt: null,
  previousRefreshAt: null,
  config: {
    intervalSec: 60
  },
  monitor: {
    count: 0,
    totalRequests: 0,
    activeCount: 0,
    range: "-",
    intervalSec: 60,
    source: "pc-local"
  },
  active: [],
  events: []
};

let monitorError = "";

function normalizeIntervalSec(value) {
  const sec = Number(value);
  return [10, 30, 60, 300].includes(sec) ? sec : 60;
}

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
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeCategoryName(value) {
  const name = String(value || "-").trim();
  if (name === "\uc790\ub3d9\ucc28" || name === "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5") {
    return "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5";
  }
  return name;
}

function normalizeRoomName(value, category) {
  const text = String(value || "-").trim();
  if (category === "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5") {
    return text.replace(/^\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5\s*/, "");
  }
  return text;
}

function normalizeItem(item) {
  const category = normalizeCategoryName(item.category || item.name);
  const roomName = normalizeRoomName(item.roomName || item.room, category);
  const id = String(
    item.id ||
    `${item.date || ""}|${category}|${roomName}|${item.fcltyCode || ""}|${item.fcltyTyCode || ""}|${item.resveNoCode || ""}`
  );

  return {
    id,
    date: String(item.date || "-"),
    category,
    roomName,
    fcltyCode: String(item.fcltyCode || ""),
    fcltyTyCode: String(item.fcltyTyCode || ""),
    resveNoCode: String(item.resveNoCode || ""),
    status: String(item.status || item.state || ""),
    detectedAt: item.detectedAt || item.time || new Date().toISOString()
  };
}

function upsertEvents(items) {
  const map = new Map(state.events.map(item => [item.id, item]));
  for (const item of items) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  state.events = Array.from(map.values())
    .sort((a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime())
    .slice(-MAX_EVENTS);
  saveEvents();
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml; charset=utf-8",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";
}

function safeJoinPublic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const target = path.join(PUBLIC_DIR, normalized === "/" ? "index.html" : normalized);
  if (!target.startsWith(PUBLIC_DIR)) return null;
  return target;
}

function sendStatic(req, res) {
  const filePath = safeJoinPublic(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(res, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not Found" : "Server Error");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

function activeForView() {
  return state.active.slice().sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.category.localeCompare(b.category, "ko") ||
    a.roomName.localeCompare(b.roomName, "ko")
  );
}

loadEvents();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, { ok: true, ...state, eventCount: state.events.length, monitorError, monitorRunning: false });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      sendJson(res, 200, {
        ok: true,
        active: activeForView(),
        events: state.events.slice().reverse(),
        config: state.config,
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

    if (req.method === "GET" && url.pathname === "/api/config") {
      sendJson(res, 200, { ok: true, config: state.config });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/config") {
      const payload = JSON.parse((await readBody(req)) || "{}");
      if (String(payload.password || "") !== CONFIG_PASSWORD) {
        sendJson(res, 403, { ok: false, error: "bad password" });
        return;
      }
      state.config.intervalSec = normalizeIntervalSec(payload.intervalSec);
      state.monitor.intervalSec = state.config.intervalSec;
      sendJson(res, 200, { ok: true, config: state.config });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/report") {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const now = new Date().toISOString();
      const rawActive = Array.isArray(payload.active) ? payload.active.map(normalizeItem) : [];
      const active = Array.from(new Map(rawActive.map(item => [item.id, item])).values());

      state.previousRefreshAt = state.lastRefreshAt;
      state.lastRefreshAt = payload.refreshedAt || now;
      state.lastReportAt = now;
      state.active = active;
      state.monitor = {
        count: Number(payload.count || 0),
        totalRequests: Number(payload.totalRequests || 0),
        activeCount: active.length,
        range: String(payload.range || "-"),
        intervalSec: Number(payload.intervalSec || state.config.intervalSec),
        source: String(payload.source || "pc-local"),
        failures: Number(payload.failures || 0)
      };
      monitorError = "";
      if (active.length > 0) upsertEvents(active);

      sendJson(res, 200, { ok: true, activeCount: state.active.length, eventCount: state.events.length });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      state.active = [];
      state.events = [];
      state.monitor.activeCount = 0;
      saveEvents();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/presence") {
      sendJson(res, 200, { ok: true, online: 1 });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/presence") {
      sendJson(res, 200, { ok: true, online: 1 });
      return;
    }

    if (req.method === "GET") {
      sendStatic(req, res);
      return;
    }

    sendText(res, 405, "Method Not Allowed");
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`go-mangsang dashboard listening on http://${HOST}:${PORT}`);
});
