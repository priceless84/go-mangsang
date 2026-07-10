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
const ACTIVE_FILE = path.join(DATA_DIR, "active.json");
const MAX_EVENTS = 2000;
const CONFIG_PASSWORD = process.env.CONFIG_PASSWORD || "6185";
const STATE_SIGNAL_URL = process.env.STATE_SIGNAL_URL || "https://mangsang-alarm-dashboard.onrender.com/api/state";

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
  heartbeat: null,
  active: [],
  events: []
};

let monitorError = "";
let lastStateSyncAt = 0;

function normalizeIntervalSec(value) {
  const sec = Number(value);
  return [10, 30, 60, 300].includes(sec) ? sec : 60;
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
  if (!fs.existsSync(ACTIVE_FILE)) fs.writeFileSync(ACTIVE_FILE, "[]", "utf8");
}

function loadEvents() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (Array.isArray(parsed)) state.events = parsed.slice(-MAX_EVENTS);
  } catch {
    state.events = [];
  }
  try {
    const parsedActive = JSON.parse(fs.readFileSync(ACTIVE_FILE, "utf8"));
    if (Array.isArray(parsedActive)) state.active = parsedActive.map(normalizeItem);
  } catch {
    state.active = [];
  }
}

function saveEvents() {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state.events.slice(-MAX_EVENTS), null, 2), "utf8");
}

function saveActive() {
  ensureDataFile();
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify(state.active, null, 2), "utf8");
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
  const category = normalizeCategoryName(item.category || item.name || item.catName || item.fcltyCategory || item.facility);
  const roomName = normalizeRoomName(item.roomName || item.room_name || item.room || item.fcltyNm || item.nameCol, category);
  const id = String(
    item.id ||
    `${item.date || item.target_date || item.beginDate || item.resveBeginDe || ""}|${category}|${roomName}|${item.fcltyCode || ""}|${item.fcltyTyCode || ""}|${item.resveNoCode || ""}`
  );

  const detectedAt = item.detectedAt || item.detected_at || item.time || item.detected || item.detectedTime || item.received_at || new Date().toISOString();

  return {
    id,
    date: String(item.date || item.target_date || item.beginDate || item.resveBeginDe || "-"),
    category,
    roomName,
    fcltyCode: String(item.fcltyCode || ""),
    fcltyTyCode: String(item.fcltyTyCode || ""),
    resveNoCode: String(item.resveNoCode || ""),
    status: String(item.status || item.canclYn || (item.event_type === "canceling" ? "N" : "") || item.state || ""),
    detectedAt
  };
}

function parseDetailText(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+(\S+)$/);
  if (!match) return { raw };
  return {
    target_date: match[1],
    facility: match[2],
    room: match[3],
    room_name: match[3]
  };
}

function heartbeatCancelingItems(heartbeat) {
  if (!heartbeat || typeof heartbeat !== "object") return [];
  if (Array.isArray(heartbeat.canceling_items)) return heartbeat.canceling_items;
  if (Array.isArray(heartbeat.canceling)) return heartbeat.canceling;
  if (Array.isArray(heartbeat.active)) return heartbeat.active;
  if (Array.isArray(heartbeat.canceling_details)) {
    return heartbeat.canceling_details.map(parseDetailText);
  }
  return [];
}

function normalizeHeartbeat(payload) {
  const heartbeat = payload.heartbeat && typeof payload.heartbeat === "object"
    ? payload.heartbeat
    : payload;
  const now = new Date().toISOString();
  return {
    ...heartbeat,
    received_at: heartbeat.received_at || heartbeat.receivedAt || payload.received_at || now,
    client: heartbeat.client || payload.client || heartbeat.source || payload.source || "state-signal"
  };
}

function eventForState(item) {
  return {
    client: item.source || state.monitor.source || "go-mangsang",
    event_type: item.status === "N" ? "canceling" : "available",
    state: item.status === "N" ? "발생" : item.status,
    target_date: item.date,
    facility: item.category,
    room: item.roomName,
    room_name: item.roomName,
    detected_at: item.detectedAt,
    received_at: item.detectedAt,
    message: `${item.date} ${item.category} ${item.roomName}`.trim()
  };
}

function handleHeartbeatPayload(payload) {
  const heartbeat = normalizeHeartbeat(payload || {});
  const rawCanceling = heartbeatCancelingItems(heartbeat);
  const active = rawCanceling
    .map(item => normalizeItem({
      ...item,
      status: "N",
      event_type: "canceling",
      detectedAt: item.detectedAt || item.detected_at || heartbeat.received_at
    }))
    .filter(item => item.date !== "-" && item.category !== "-" && item.roomName !== "-");

  state.heartbeat = {
    ...heartbeat,
    canceling_count: Number.isFinite(Number(heartbeat.canceling_count)) ? Number(heartbeat.canceling_count) : active.length,
    canceling_items: active.map(eventForState)
  };
  state.previousRefreshAt = state.lastRefreshAt;
  state.lastRefreshAt = heartbeat.received_at;
  state.lastReportAt = new Date().toISOString();
  state.monitor = {
    ...state.monitor,
    count: Number(heartbeat.count || state.monitor.count || 0),
    activeCount: active.length,
    source: String(heartbeat.client || "state-signal")
  };
  monitorError = String(heartbeat.error || heartbeat.monitorError || heartbeat.message || "");

  if (Array.isArray(heartbeat.canceling_items) || Array.isArray(heartbeat.canceling) || Array.isArray(heartbeat.active) || Array.isArray(heartbeat.canceling_details)) {
    state.active = active;
    saveActive();
  }
  if (active.length > 0) upsertEvents(active);
  return active;
}

function stateEventsForApi() {
  return state.events.map(eventForState);
}

function heartbeatForApi() {
  if (state.heartbeat) return state.heartbeat;
  const active = activeForView();
  return {
    received_at: state.lastRefreshAt || state.lastReportAt || state.startedAt,
    status: "running",
    client: state.monitor.source || "go-mangsang",
    canceling_count: active.length,
    canceling_items: active.map(eventForState),
    available_count: 0,
    available_items: []
  };
}

async function syncStateSignal() {
  if (!STATE_SIGNAL_URL || Date.now() - lastStateSyncAt < 5000) return;
  lastStateSyncAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(STATE_SIGNAL_URL, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "go-mangsang-state-sync/1.0" }
    });
    clearTimeout(timer);
    if (!response.ok) return;
    const payload = await response.json();
    if (payload && payload.heartbeat) {
      handleHeartbeatPayload(payload);
    }
  } catch (error) {}
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
  const recentCutoff = Date.now() - 2 * 60 * 60 * 1000;
  const fallbackActive = state.active.length > 0
    ? state.active
    : state.events.filter(item => {
      const detectedAt = new Date(item.detectedAt).getTime();
      return item.status === "N" && Number.isFinite(detectedAt) && detectedAt >= recentCutoff;
    });

  return fallbackActive.slice().sort((a, b) =>
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
      await syncStateSignal();
      sendJson(res, 200, { ok: true, ...state, eventCount: state.events.length, monitorError, monitorRunning: false });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      await syncStateSignal();
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

    if (req.method === "GET" && url.pathname === "/api/state") {
      await syncStateSignal();
      sendJson(res, 200, {
        ok: true,
        heartbeat: heartbeatForApi(),
        events: stateEventsForApi()
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

    if (req.method === "POST" && (url.pathname === "/api/heartbeat" || url.pathname === "/api/state")) {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const active = handleHeartbeatPayload(payload);
      sendJson(res, 200, {
        ok: true,
        activeCount: active.length,
        eventCount: state.events.length,
        heartbeat: state.heartbeat
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/report") {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const now = new Date().toISOString();
      const rawActive = Array.isArray(payload.active) ? payload.active.map(normalizeItem) : [];
      const rawEvents = Array.isArray(payload.events) ? payload.events.map(normalizeItem) : [];
      const active = Array.from(new Map(rawActive.map(item => [item.id, item])).values());
      const reportedEvents = Array.from(new Map(rawEvents.map(item => [item.id, item])).values());

      state.previousRefreshAt = state.lastRefreshAt;
      state.lastRefreshAt = payload.refreshedAt || now;
      state.lastReportAt = now;
      const allRequestsFailed = Number(payload.totalRequests || 0) > 0 && Number(payload.failures || 0) >= Number(payload.totalRequests || 0);
      if (active.length > 0 || !allRequestsFailed) {
        state.active = active;
        saveActive();
      }
      state.monitor = {
        count: Number(payload.count || 0),
        totalRequests: Number(payload.totalRequests || 0),
        activeCount: state.active.length,
        range: String(payload.range || "-"),
        intervalSec: Number(payload.intervalSec || state.config.intervalSec),
        source: String(payload.source || "pc-local"),
        failures: Number(payload.failures || 0)
      };
      monitorError = String(payload.monitorError || payload.error || "");
      if (!monitorError && state.monitor.totalRequests > 0 && state.monitor.failures >= state.monitor.totalRequests) {
        monitorError = "캠핑코리아 조회 실패";
      }
      if (active.length > 0) upsertEvents(active);
      if (reportedEvents.length > 0) upsertEvents(reportedEvents);

      sendJson(res, 200, { ok: true, activeCount: state.active.length, eventCount: state.events.length });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      state.active = [];
      state.events = [];
      state.monitor.activeCount = 0;
      saveActive();
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
