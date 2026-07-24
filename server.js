"use strict";

const { createServer } = require("http");
const { readFile } = require("fs/promises");
const { extname, join, normalize } = require("path");

const PORT = Number(process.env.PORT || 3000);
const SOURCE_ORIGIN = process.env.SOURCE_ORIGIN || "http://112.217.206.107:8788";
const PUBLIC_DIR = join(process.cwd(), "public");
const REPORT_TTL_MS = 2 * 60 * 1000;
const EVENT_LIMIT = 300;

let latestReport = null;
const reportEvents = [];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function json(res, statusCode, payload) {
  send(res, statusCode, JSON.stringify(payload), {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
}

function cors(res) {
  send(res, 204, "", {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function rowKey(row) {
  return [
    row.date || row.target_date || "",
    row.facility || row.category || "",
    row.roomCode || row.room_code || row.room || row.roomName || row.room_name || ""
  ].join("|");
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    const now = new Date().toISOString();
    const room = row.room || row.roomName || row.room_name || row.roomCode || "";
    const facility = row.facility || row.category || "";
    const date = row.date || row.target_date || "";
    return {
      ...row,
      date,
      target_date: row.target_date || date,
      facility,
      category: row.category || facility,
      room,
      roomName: row.roomName || row.room_name || room,
      room_name: row.room_name || row.roomName || room,
      capacity: row.capacity ? String(row.capacity) : "",
      canclYn: row.canclYn || "N",
      eventType: row.eventType || row.event_type || "canceling",
      event_type: row.event_type || row.eventType || "canceling",
      statusName: row.statusName || row.statusText || "취소 진행중",
      statusText: row.statusText || row.statusName || "취소 진행중",
      statusCode: row.statusCode || "cancelBlocked",
      state: row.state || "발생",
      receivedAt: row.receivedAt || row.received_at || row.detectedAt || now,
      detectedAt: row.detectedAt || row.receivedAt || row.received_at || now
    };
  });
}

function rememberEvents(events) {
  const seen = new Set(reportEvents.map(rowKey));
  for (const event of normalizeRows(events)) {
    const key = rowKey(event);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    reportEvents.unshift(event);
  }
  reportEvents.splice(EVENT_LIMIT);
}

function splitRange(value) {
  const [start = "", end = ""] = String(value || "").split("~").map(item => item.trim());
  return { start, end };
}

function reportPayload() {
  if (!latestReport) return null;

  const range = splitRange(latestReport.range);
  const isFresh = Date.now() - latestReport.receivedAtMs <= REPORT_TTL_MS;
  const active = isFresh ? latestReport.active : [];
  const start = latestReport.start || range.start;
  const end = latestReport.end || range.end;

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: latestReport.source || "reservation-console",
    start,
    end,
    facilities: latestReport.facilities || "",
    intervalSec: latestReport.intervalSec || 5,
    heartbeat: {
      status: "running",
      receivedAt: latestReport.receivedAt,
      client: latestReport.source || "reservation-console",
      start,
      end,
      facilities: latestReport.facilities || "",
      message: isFresh ? "감시 진행" : "최근 감시 신호 대기"
    },
    rows: active,
    visibleRows: active,
    currentCanceling: active,
    currentAvailable: [],
    events: reportEvents,
    report: {
      count: latestReport.count || 0,
      totalRequests: latestReport.totalRequests || 0,
      failures: latestReport.failures || 0,
      stale: !isFresh
    }
  };
}

function mergeStatus(upstreamPayload) {
  const report = reportPayload();
  if (!report) return upstreamPayload;

  if (report.currentCanceling.length || !upstreamPayload || upstreamPayload.ok === false) {
    return {
      ...(upstreamPayload || {}),
      ...report
    };
  }

  return {
    ...upstreamPayload,
    heartbeat: report.heartbeat,
    events: report.events.length ? report.events : upstreamPayload.events,
    report: report.report
  };
}

async function acceptReport(req, res) {
  const payload = await readJsonBody(req);
  const active = normalizeRows(payload.active || payload.currentCanceling || []);
  const events = normalizeRows(payload.events || []);
  rememberEvents([...active, ...events]);

  latestReport = {
    ...payload,
    active,
    events,
    receivedAt: new Date().toISOString(),
    receivedAtMs: Date.now()
  };

  json(res, 200, { ok: true, currentCanceling: active.length, events: reportEvents.length });
}

async function proxyStatus(res) {
  try {
    const upstream = await fetch(new URL("/api/status", SOURCE_ORIGIN), { cache: "no-store" });
    const payload = await upstream.json();
    json(res, upstream.status, mergeStatus(payload));
  } catch (error) {
    const report = reportPayload();
    if (report) {
      json(res, 200, report);
      return;
    }
    throw error;
  }
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
      "cache-control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=300"
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
      cors(res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      await proxyStatus(res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/report") {
      await acceptReport(req, res);
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
      message: error instanceof Error ? error.message : "참조 서버 연결 실패"
    });
  }
}).listen(PORT, () => {
  console.log(`go-mangsang dashboard listening on ${PORT}`);
});
