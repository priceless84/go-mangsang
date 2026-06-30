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
const MAX_EVENTS = 1000;

const MONITOR_ENABLED = String(process.env.MONITOR_ENABLED || "true") !== "false";
const MONITOR_INTERVAL_SEC = Math.max(5, Number(process.env.MONITOR_INTERVAL_SEC || 10));
const MONITOR_MAX_DAYS = Math.max(2, Number(process.env.MONITOR_MAX_DAYS || 40));
const CAMPING_ENDPOINT = "https://www.campingkorea.or.kr/user/reservation/ND_selectChildFcltyList.do";

const CATEGORIES = [
  { code: "1300", name: "든바다", resveNoCodes: ["ME", "MC", "MA", "MG", "MD", "MB"] },
  { code: "1400", name: "난바다", resveNoCodes: ["MH", "MB", "MD", "MG", "MI"] },
  { code: "1500", name: "허허바다", resveNoCodes: ["MI", "MF", "MC", "MD", "MB"] },
  { code: "1600", name: "자동차", resveNoCodes: ["RR"] }
];

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
    intervalSec: MONITOR_INTERVAL_SEC,
    source: "server"
  },
  active: [],
  events: []
};

let monitorTimer = null;
let monitorRunning = false;
let monitorError = "";

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
    id: String(item.id || `${item.date || ""}|${item.category || item.name || ""}|${item.roomName || item.room || ""}|${item.fcltyCode || ""}|${item.fcltyTyCode || ""}|${item.resveNoCode || ""}`),
    date: String(item.date || "-"),
    category: normalizeCategoryName(item.category || item.name),
    roomName: String(item.roomName || item.room || "-"),
    fcltyCode: String(item.fcltyCode || ""),
    fcltyTyCode: String(item.fcltyTyCode || ""),
    resveNoCode: String(item.resveNoCode || ""),
    detectedAt: item.detectedAt || item.time || new Date().toISOString()
  };
}

function upsertEvents(items) {
  const map = new Map(state.events.map(item => [item.id, item]));
  items.forEach(item => {
    if (!map.has(item.id)) map.set(item.id, item);
  });
  state.events = Array.from(map.values()).slice(-MAX_EVENTS);
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

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateByOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function normalizeCategoryName(value) {
  const name = String(value || "-");
  if (name === "자동차" || name === "자동차캠핑장") return "자동차";
  return name;
}

function normalizeRoomName(site, categoryName) {
  const raw = String(site?.fcltyNm || "이름없음").trim();
  if (categoryName === "자동차") {
    const number = raw.match(/\d+/)?.[0] || String(site?.fcltyCode || "").replace(/^16/, "");
    return number ? `${Number(number)}번` : raw;
  }
  if (/호$/.test(raw)) return raw;
  return `${raw}호`.replace(/호호$/, "호");
}

function isCanceling(site) {
  return site && site.canclYn === "N";
}

async function fetchFacilityList(category, resveNoCode, beginDate, endDate) {
  const body = new URLSearchParams({
    trrsrtCode: "1000",
    fcltyCode: category.code,
    resveNoCode,
    resveBeginDe: beginDate,
    resveEndDe: endDate
  });

  const response = await fetch(CAMPING_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": "https://www.campingkorea.or.kr/user/reservation/BD_reservationReq.do"
    },
    body
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON 파싱 실패: ${text.slice(0, 80)}`);
  }
}

async function runServerMonitorOnce() {
  if (monitorRunning) return;
  monitorRunning = true;

  const active = [];
  const jobs = [];

  for (let day = 1; day < MONITOR_MAX_DAYS; day++) {
    const beginDate = dateByOffset(day);
    const endDate = dateByOffset(day + 1);
    CATEGORIES.forEach(category => {
      category.resveNoCodes.forEach(resveNoCode => {
        jobs.push({ category, resveNoCode, beginDate, endDate });
      });
    });
  }

  state.monitor.count += 1;
  state.monitor.totalRequests = jobs.length;
  state.monitor.range = `${dateByOffset(1)} ~ ${dateByOffset(MONITOR_MAX_DAYS)}`;
  state.monitor.intervalSec = MONITOR_INTERVAL_SEC;
  state.monitor.source = "server";

  try {
    const results = await Promise.allSettled(jobs.map(async job => {
      const res = await fetchFacilityList(job.category, job.resveNoCode, job.beginDate, job.endDate);
      const list = res?.value?.childFcltyList;
      if (!Array.isArray(list)) return;

      list.forEach(site => {
        if (!isCanceling(site)) return;

        const categoryName = normalizeCategoryName(job.category.name);
        const item = normalizeItem({
          date: job.beginDate,
          category: categoryName,
          roomName: normalizeRoomName(site, categoryName),
          fcltyCode: site.fcltyCode,
          fcltyTyCode: site.fcltyTyCode,
          resveNoCode: site.resveNoCode || job.resveNoCode,
          detectedAt: new Date().toISOString()
        });

        active.push(item);
      });
    }));

    const failures = results.filter(result => result.status === "rejected");
    monitorError = failures.length ? `${failures.length}개 조회 실패` : "";
    state.previousRefreshAt = state.lastRefreshAt;
    state.lastRefreshAt = new Date().toISOString();
    state.lastReportAt = state.lastRefreshAt;
    state.active = active.sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category, "ko"));
    state.monitor.activeCount = state.active.length;
    state.monitor.lastError = monitorError;
    upsertEvents(state.active);
  } catch (error) {
    monitorError = error.message || String(error);
    state.monitor.lastError = monitorError;
  } finally {
    monitorRunning = false;
  }
}

function startServerMonitor() {
  if (!MONITOR_ENABLED) return;
  if (monitorTimer) clearInterval(monitorTimer);
  runServerMonitorOnce();
  monitorTimer = setInterval(runServerMonitorOnce, MONITOR_INTERVAL_SEC * 1000);
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
      sendJson(res, 200, { ok: true, ...state, eventCount: state.events.length, monitorError, monitorRunning });
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
        intervalSec: payload.intervalSec ?? null,
        source: "console"
      };
      upsertEvents(active);
      sendJson(res, 200, { ok: true, activeCount: active.length, eventCount: state.events.length });
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

    if (req.method === "POST" && url.pathname === "/api/monitor/run") {
      await runServerMonitorOnce();
      sendJson(res, 200, { ok: true, activeCount: state.active.length, error: monitorError });
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
  console.log(`server monitor: ${MONITOR_ENABLED ? `ON / ${MONITOR_INTERVAL_SEC}s` : "OFF"}`);
  startServerMonitor();
});
