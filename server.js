"use strict";

const { createServer } = require("http");
const { readFile, mkdir, writeFile } = require("fs/promises");
const { existsSync, readFileSync } = require("fs");
const { extname, join, normalize } = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = join(process.cwd(), "public");
const DATA_DIR = join(process.cwd(), ".data");
const STATE_FILE = join(DATA_DIR, "watch-interval-state.json");
const STATE_VERSION = "watch-interval-20260805";
const FACILITIES = ["든바다", "난바다", "허허바다", "자동차캠핑장"];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const defaultState = {
  version: STATE_VERSION,
  heartbeat: null,
  events: []
};

let state = loadState();

function loadState() {
  try {
    if (!existsSync(STATE_FILE)) return { ...defaultState };
    const loaded = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (loaded.version !== STATE_VERSION) return { ...defaultState };
    return {
      ...defaultState,
      ...loaded,
      events: Array.isArray(loaded.events) ? loaded.events : []
    };
  } catch (error) {
    console.warn("state load failed:", error.message);
    return { ...defaultState };
  }
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
  res.writeHead(statusCode, { ...corsHeaders(), ...headers });
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

function normalizeFacilityName(value) {
  const text = String(value || "")
    .replace(/[★☆▶▷▣■●○▲△🚗]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (text.includes("든바다")) return "든바다";
  if (text.includes("난바다")) return "난바다";
  if (text.includes("허허바다")) return "허허바다";
  if (text.includes("자동차") || text.includes("차캠핑")) return "자동차캠핑장";
  return text || String(value || "").trim();
}

function listFromPayload(payload, keys) {
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function itemKey(item) {
  return [
    item.target_date || item.date || "",
    normalizeFacilityName(item.facility || item.category || ""),
    String(item.room || item.roomName || ""),
    item.fcltyCode || item.fclty_code || ""
  ].join("|");
}

function signalKey(item) {
  return [
    item.target_date || "",
    normalizeFacilityName(item.facility || ""),
    String(item.room || "").replace(/\(\d+인\)/g, "").trim()
  ].join("|");
}

function normalizeItem(item) {
  const normalized = {
    id: item.id || itemKey(item),
    target_date: item.target_date || item.date || "",
    facility: normalizeFacilityName(item.facility || item.category || ""),
    room: item.room || item.roomName || "",
    fclty_code: item.fclty_code || item.fcltyCode || "",
    fclty_type_code: item.fclty_type_code || item.fcltyTyCode || "",
    resve_no_code: item.resve_no_code || item.resveNoCode || "",
    detected_at: item.detected_at || item.detectedAt || new Date().toISOString()
  };
  normalized.id = normalized.id || signalKey(normalized);
  return normalized;
}

function preserveFirstDetectedAt(currentItems, previousItems) {
  const byId = new Map(previousItems.map(item => [item.id, item]));
  const bySignal = new Map(previousItems.map(item => [signalKey(item), item]));

  return currentItems.map(item => {
    const previous = byId.get(item.id) || bySignal.get(signalKey(item));
    return previous?.detected_at ? { ...item, detected_at: previous.detected_at } : item;
  });
}

function makeEvents(previousItems, currentItems, eventType, now, endedState) {
  const previousMap = new Map(previousItems.map(item => [signalKey(item), item]));
  const currentMap = new Map(currentItems.map(item => [signalKey(item), item]));
  const events = [];

  for (const item of currentItems) {
    if (!previousMap.has(signalKey(item))) {
      events.push(toEvent(item, eventType, "발생", now));
    }
  }

  for (const item of previousItems) {
    if (!currentMap.has(signalKey(item))) {
      events.push(toEvent(item, eventType, endedState(item), now));
    }
  }

  return events;
}

function toEvent(item, eventType, status, now) {
  return {
    received_at: now,
    event_type: eventType,
    state: status,
    target_date: item.target_date,
    facility: item.facility,
    room: item.room
  };
}

function sourceLabel(payload) {
  return payload.source || "campingkorea-console";
}

async function applyReportPayload(payload) {
  const now = payload.refreshedAt || new Date().toISOString();
  const incomingActive = listFromPayload(payload, [
    "active",
    "canceling",
    "cancelingItems",
    "canceling_items",
    "currentCanceling"
  ]).map(normalizeItem);
  const incomingAvailable = listFromPayload(payload, [
    "available",
    "availableItems",
    "available_items",
    "currentAvailable"
  ]).map(normalizeItem);

  const previousActive = state.heartbeat?.canceling_items || [];
  const previousAvailable = state.heartbeat?.available_items || [];
  const failures = Number(payload.failures || 0);
  const isFinished = ["finished", "complete"].includes(payload.phase);
  const shouldReplace = isFinished || incomingActive.length > 0 || incomingAvailable.length > 0;

  const active = shouldReplace
    ? preserveFirstDetectedAt(incomingActive, previousActive)
    : previousActive;
  const available = shouldReplace
    ? preserveFirstDetectedAt(incomingAvailable, previousAvailable)
    : previousAvailable;

  const activeKeys = new Set(active.map(signalKey));
  const availableKeys = new Set(available.map(signalKey));
  const events = shouldReplace
    ? [
        ...makeEvents(previousActive, active, "canceling", now, item =>
          availableKeys.has(signalKey(item)) ? "가능종료" : "마감종료"
        ),
        ...makeEvents(previousAvailable, available, "available", now, item =>
          activeKeys.has(signalKey(item)) ? "진행중" : "마감종료"
        )
      ]
    : [];

  state = {
    version: STATE_VERSION,
    heartbeat: {
      status: payload.phase === "stopped" ? "stopped" : "running",
      received_at: now,
      source: sourceLabel(payload),
      count: payload.count || 0,
      total_requests: payload.totalRequests || 0,
      completed_requests: payload.completedRequests || 0,
      failures,
      interval_sec: payload.intervalSec || 5,
      range: payload.range || "",
      facilities: Array.isArray(payload.facilities) && payload.facilities.length
        ? payload.facilities.map(normalizeFacilityName)
        : FACILITIES,
      target_dates: Array.isArray(payload.targetDates) ? payload.targetDates : [],
      canceling_items: active,
      available_items: available,
      message: payload.monitorError || ""
    },
    events: [...state.events, ...events].slice(-500)
  };

  await saveState();
  return state;
}

async function report(req, res) {
  const payload = JSON.parse(await readBody(req) || "{}");
  await applyReportPayload(payload);
  json(res, 200, { ok: true, state });
}

async function resetState(res) {
  state = { ...defaultState, events: [] };
  await saveState();
  json(res, 200, { ok: true, state });
}

function statePayload() {
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    state,
    source: state.heartbeat?.source || "watch-interval"
  };
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

    if (req.method === "POST" && url.pathname === "/api/reset") {
      await resetState(res);
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/state" || url.pathname === "/api/reference")) {
      json(res, 200, statePayload());
      return;
    }

    if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/z" || url.pathname === "/api/monitor")) {
      json(res, 200, {
        ok: true,
        mode: "watch-interval",
        source: state.heartbeat?.source || "-",
        received_at: state.heartbeat?.received_at || null,
        total_requests: state.heartbeat?.total_requests || 0,
        failures: state.heartbeat?.failures || 0,
        canceling: state.heartbeat?.canceling_items?.length || 0,
        available: state.heartbeat?.available_items?.length || 0,
        message: state.heartbeat?.message || ""
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/collector-console.js") {
      const body = await readFile(join(process.cwd(), "collector-console.js"));
      send(res, 200, body, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store"
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
  console.log(`go-mangsang watch-interval dashboard listening on ${PORT}`);
});
