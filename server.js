"use strict";

const { createServer } = require("http");
const { readFile, mkdir, writeFile } = require("fs/promises");
const { existsSync, readFileSync } = require("fs");
const { extname, join, normalize } = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = join(process.cwd(), "public");
const DATA_DIR = join(process.cwd(), ".data");
const STATE_FILE = join(DATA_DIR, "state.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const defaultState = {
  heartbeat: null,
  events: []
};

let state = loadState();

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return { ...defaultState, ...JSON.parse(readFileSync(STATE_FILE, "utf8")) };
    }
  } catch (error) {
    console.warn("state load failed:", error.message);
  }
  return { ...defaultState };
}

async function saveState() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.warn("state save failed:", error.message);
  }
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    ...corsHeaders(),
    ...headers
  });
  res.end(body);
}

function json(res, statusCode, payload) {
  send(res, statusCode, JSON.stringify(payload), {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function itemKey(item) {
  return [
    item.date || item.target_date || "",
    item.category || item.facility || "",
    item.roomName || item.room || "",
    item.fcltyCode || ""
  ].join("|");
}

function normalizeFacilityName(value) {
  const text = String(value || "")
    .replace(/[★☆▶▷▣■●○▲△🚗]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (text.includes("든바다")) return "든바다";
  if (text.includes("난바다")) return "난바다";
  if (text.includes("허허바다")) return "허허바다";
  if (text.includes("자동차")) return "자동차캠핑장";
  return text || String(value || "").trim();
}

function normalizeItem(item) {
  const facility = normalizeFacilityName(item.category || item.facility || "");

  return {
    id: item.id || itemKey(item),
    target_date: item.date || item.target_date || "",
    facility,
    room: item.roomName || item.room || "",
    fclty_code: item.fcltyCode || item.fclty_code || "",
    fclty_type_code: item.fcltyTyCode || item.fclty_type_code || "",
    resve_no_code: item.resveNoCode || item.resve_no_code || "",
    detected_at: item.detectedAt || item.detected_at || new Date().toISOString()
  };
}

function eventStatus(previousMap, currentMap, item) {
  const previous = previousMap.has(item.id);
  const current = currentMap.has(item.id);
  if (!previous && current) return "발생";
  if (previous && !current) return "종료 → 목록없음";
  return null;
}

function itemSignalKey(item) {
  return [
    item.target_date || "",
    normalizeFacilityName(item.facility || ""),
    String(item.room || "").replace(/\(\d+인\)/g, "").trim()
  ].join("|");
}

function buildEvents(previousItems, currentItems, eventType, now, endedState) {
  const previousMap = new Map(previousItems.map(item => [item.id || itemKey(item), item]));
  const currentMap = new Map(currentItems.map(item => [item.id || itemKey(item), item]));
  const events = [];

  for (const item of currentItems) {
    const status = eventStatus(previousMap, currentMap, item);
    if (status) {
      events.push({
        received_at: now,
        event_type: eventType,
        state: status,
        target_date: item.target_date,
        facility: item.facility,
        room: item.room
      });
    }
  }

  for (const item of previousItems) {
    const id = item.id || itemKey(item);
    if (!currentMap.has(id)) {
      events.push({
        received_at: now,
        event_type: eventType,
        state: endedState(item),
        target_date: item.target_date,
        facility: item.facility,
        room: item.room
      });
    }
  }

  return events;
}

async function report(req, res) {
  const payload = JSON.parse(await readBody(req) || "{}");
  const now = payload.refreshedAt || new Date().toISOString();
  const incomingActive = Array.isArray(payload.active) ? payload.active.map(normalizeItem) : [];
  const incomingAvailable = Array.isArray(payload.available) ? payload.available.map(normalizeItem) : [];
  const previousItems = state.heartbeat?.canceling_items || [];
  const previousAvailable = state.heartbeat?.available_items || [];
  const shouldReplaceActive =
    payload.phase === "finished" ||
    incomingActive.length > 0 ||
    !state.heartbeat;
  const shouldReplaceAvailable =
    payload.phase === "finished" ||
    incomingAvailable.length > 0 ||
    !state.heartbeat;
  const active = shouldReplaceActive ? incomingActive : previousItems;
  const available = shouldReplaceAvailable ? incomingAvailable : previousAvailable;
  const events = [];
  const activeKeys = new Set(active.map(itemSignalKey));
  const availableKeys = new Set(available.map(itemSignalKey));

  if (shouldReplaceActive) {
    events.push(...buildEvents(previousItems, active, "canceling", now, item =>
      availableKeys.has(itemSignalKey(item)) ? "종료 → 예약가능" : "종료 → 목록없음"
    ));
  }

  if (shouldReplaceAvailable) {
    events.push(...buildEvents(previousAvailable, available, "available", now, item =>
      activeKeys.has(itemSignalKey(item)) ? "종료 → 취소진행중" : "종료 → 예약중"
    ));
  }

  state = {
    heartbeat: {
      status: payload.phase === "stopped" ? "stopped" : "running",
      received_at: now,
      source: payload.source || "pc-local",
      count: payload.count || 0,
      total_requests: payload.totalRequests || 0,
      completed_requests: payload.completedRequests || 0,
      failures: payload.failures || 0,
      interval_sec: payload.intervalSec || 0,
      range: payload.range || "",
      facilities: ["든바다", "난바다", "허허바다", "자동차캠핑장"],
      target_dates: [],
      canceling_items: active,
      available_items: available,
      message: payload.monitorError || ""
    },
    events: [...state.events, ...events].slice(-300)
  };

  await saveState();
  json(res, 200, { ok: true, state });
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

    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/report") {
      await report(req, res);
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/state" || url.pathname === "/api/reference")) {
      json(res, 200, {
        ok: true,
        fetchedAt: new Date().toISOString(),
        state
      });
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
      message: error instanceof Error ? error.message : "요청 처리 실패"
    });
  }
}).listen(PORT, () => {
  console.log(`go-mangsang dashboard listening on ${PORT}`);
});
