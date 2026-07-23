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
const REFERENCE_DASHBOARD_URLS = (process.env.REFERENCE_DASHBOARD_URLS || "https://mangsang-alarm-dashboard.onrender.com/,http://112.217.206.107:8788/").split(",").map(value => value.trim()).filter(Boolean);
const TARGET_FACILITIES = (process.env.TARGET_FACILITIES || "든바다,난바다,허허바다,자동차캠핑장").split(",").map(value => value.trim()).filter(Boolean);
const TARGET_FACILITIES_TEXT = TARGET_FACILITIES.join(",");
function targetFacilitiesFrom(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean).join(",");
  const text = String(value || "").trim();
  return text || TARGET_FACILITIES_TEXT;
}
function referenceDashboardUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const facilities = TARGET_FACILITIES_TEXT;
    url.searchParams.set("facilities", facilities);
    url.searchParams.set("facility", facilities);
    url.searchParams.set("targetFacilities", facilities);
    url.searchParams.set("includeAutoCamping", "1");
    url.searchParams.set("codexAuto", Date.now().toString());
    return url.toString();
  } catch (_) {
    return rawUrl;
  }
}
const LOCAL_REPORT_FRESH_MS = 180 * 1000;
const UI_FIX_CSS = String.raw`
<style id="codex-ui-fixes">
body .facility-status-box { display: none !important; }
body .panel.controls {
  gap: 6px !important;
  padding-top: 12px !important;
  padding-bottom: 12px !important;
}
body .panel.controls button,
body .panel.controls .chip,
body .panel.controls label,
body .panel.controls .segmented button,
body .panel.controls .date-mode button,
body .panel.controls input[type="button"] {
  min-height: 34px !important;
  height: 34px !important;
  padding-top: 5px !important;
  padding-bottom: 5px !important;
}
body .panel.controls input[type="date"],
body .panel.controls input:not([type]),
body .panel.controls select {
  min-height: 36px !important;
  height: 36px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}
body .codex-live-summary {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 0 !important;
  margin: 10px 0 2px !important;
  padding: 10px 8px !important;
  border: 1px solid #cfe0d7 !important;
  border-radius: 8px !important;
  background: #fff !important;
  box-shadow: 0 8px 22px rgba(25, 48, 38, .08) !important;
}
body .codex-live-summary .summary-cell {
  min-width: 0 !important;
  text-align: center !important;
  border-right: 1px solid #e0ebe5 !important;
  padding: 0 4px !important;
}
body .codex-live-summary .summary-cell:last-child { border-right: 0 !important; }
body .codex-live-summary .summary-label {
  display: block !important;
  margin-bottom: 4px !important;
  color: #52665c !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  line-height: 1.1 !important;
}
body .codex-live-summary .summary-value {
  display: block !important;
  color: #071a33 !important;
  font-size: 16px !important;
  font-weight: 950 !important;
  line-height: 1.15 !important;
  white-space: nowrap !important;
}
body #activeRows,
body #firstRows.history-grid {
  overflow-x: hidden !important;
  width: 100% !important;
}
body #activeRows .grid-head,
body #activeRows .grid-row,
body #firstRows.history-grid .grid-head,
body #firstRows.history-grid .grid-row {
  display: grid !important;
  grid-template-columns: 40px 51px 64px 42px 43px minmax(61px, 1fr) !important;
  min-width: 0 !important;
  width: 100% !important;
  gap: 2px !important;
  align-items: center !important;
}
body #activeRows .grid-head > *,
body #activeRows .grid-row > *,
body #firstRows.history-grid .grid-head > *,
body #firstRows.history-grid .grid-row > * {
  min-width: 0 !important;
  max-width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  overflow: hidden !important;
  text-overflow: clip !important;
  white-space: nowrap !important;
  text-align: center !important;
  font-size: 11.5px !important;
  font-weight: 900 !important;
  line-height: 1.18 !important;
  letter-spacing: 0 !important;
}
body #activeRows .grid-row .remaining-soon,
body #activeRows .grid-row span.remaining-soon,
body .grid-row .remaining-soon,
body .grid-row span.remaining-soon {
  display: inline !important;
  width: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: #df0000 !important;
  font-size: 12px !important;
  font-weight: 950 !important;
  text-shadow: 0 0 0 #df0000 !important;
  box-shadow: none !important;
}
body #firstRows.history-grid .grid-row .history-kind,
body #firstRows.history-grid .grid-row .history-status {
  display: block !important;
  min-height: 0 !important;
  height: auto !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  line-height: 1.18 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: clip !important;
  text-align: center !important;
  font-size: 11.5px !important;
  font-weight: 900 !important;
}
body #firstRows.history-grid .grid-row .history-kind.canceling { color: #a36300 !important; }
body #firstRows.history-grid .grid-row .history-kind.available { color: #08783f !important; }
body #firstRows.history-grid .grid-row .history-status { color: #17211b !important; }
body #firstRows.history-grid .grid-row .history-status.ended { color: #075985 !important; }
body #firstRows.history-grid .grid-row { min-height: 33px !important; }
@media (max-width: 390px) {
  body #activeRows .grid-head,
  body #activeRows .grid-row,
  body #firstRows.history-grid .grid-head,
  body #firstRows.history-grid .grid-row {
    grid-template-columns: 38px 48px 62px 40px 41px minmax(56px, 1fr) !important;
    gap: 1px !important;
  }
  body #activeRows .grid-head > *,
  body #activeRows .grid-row > *,
  body #firstRows.history-grid .grid-head > *,
  body #firstRows.history-grid .grid-row > *,
  body #firstRows.history-grid .grid-row .history-kind,
  body #firstRows.history-grid .grid-row .history-status { font-size: 11px !important; }
}
@media (min-width: 760px) {
  body .codex-live-summary .summary-value { font-size: 20px !important; }
  body #activeRows .grid-head,
  body #activeRows .grid-row,
  body #firstRows.history-grid .grid-head,
  body #firstRows.history-grid .grid-row {
    grid-template-columns: 96px 124px 120px 90px 104px minmax(160px, 1fr) !important;
    gap: 8px !important;
  }
  body #activeRows .grid-head > *,
  body #activeRows .grid-row > *,
  body #firstRows.history-grid .grid-head > *,
  body #firstRows.history-grid .grid-row > *,
  body #firstRows.history-grid .grid-row .history-kind,
  body #firstRows.history-grid .grid-row .history-status { font-size: 13px !important; }
}


/* history list reads by detection time first */
body #firstRows.history-grid .grid-head,
body #firstRows.history-grid .grid-row {
  grid-template-columns: 42px 48px minmax(70px, 1fr) 39px 50px 64px !important;
}
body #firstRows.history-grid .grid-row .history-status.active { color: #c45a00 !important; }
body #firstRows.history-grid .grid-row .history-status.available { color: #08783f !important; }
body #firstRows.history-grid .grid-row .history-status.closed { color: #075985 !important; }
@media (max-width: 390px) {
  body #firstRows.history-grid .grid-head,
  body #firstRows.history-grid .grid-row {
    grid-template-columns: 40px 44px minmax(62px, 1fr) 38px 48px 62px !important;
  }
}
@media (min-width: 760px) {
  body #firstRows.history-grid .grid-head,
  body #firstRows.history-grid .grid-row {
    grid-template-columns: 90px 104px minmax(170px, 1fr) 96px 124px 120px !important;
  }
}

</style>
<script id="codex-dashboard-refine" defer>
(() => {
  const HISTORY_STORE_KEY = "goMangsangFirstDetectedHistoryV2";
  const CAPACITY = {
    "든바다": {"101":"8","102":"4","103":"4","104":"2","105":"2","106":"10","107":"2","108":"2","109":"4","110":"8","111":"4","112":"6","113":"2","114":"2","115":"6","116":"4","117":"2","118":"2","119":"6","120":"4","121":"4","122":"4","123":"4"},
    "난바다": {"101":"8","102":"6","103":"4","104":"4","105":"6","106":"10","107":"4","108":"4","109":"8","110":"6","111":"4","112":"4","113":"8","114":"6","115":"10"},
    "허허바다": {"101":"10","102":"8","103":"4","104":"4","105":"6","106":"4","107":"4","108":"10"}
  };
  const state = { lastRefresh: "-", intervalSec: 60, lastRefreshMs: 0, cancelCount: 0, syncing: false, lastActiveHtml: "", lastActiveAt: 0 };
  const ACTIVE_EMPTY_GRACE_MS = 15000;
  const text = v => String(v == null ? "" : v).trim();
  const two = v => String(v).padStart(2, "0");
  const escapeHtml = v => text(v).replace(/[&<>\"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const facilityName = v => /허허/.test(text(v)) ? "허허바다" : /난바다/.test(text(v)) ? "난바다" : /든바다/.test(text(v)) ? "든바다" : /자동차|캠핑/.test(text(v)) ? "자동차캠핑장" : text(v);
  function roomNo(v) { const m = text(v).match(/(\d+)/); return m ? m[1] : ""; }
  function roomWithCapacity(room, item) {
    const base = text(room).replace(/\s*\(\d+\s*인\)\s*$/, "");
    const facility = facilityName(item && (item.facility || item.category || item.name));
    const no = roomNo(base);
    const mapped = CAPACITY[facility] && CAPACITY[facility][no];
    const direct = text(item && (item.capacity || item.people || item.person || item.persons || item.headcount || item.roomCapacity));
    const capacity = mapped || (/^\d+$/.test(direct) ? direct : ((direct.match(/(\d+)\s*(?:인|명|people|persons?)/i) || [])[1] || ""));
    return base && capacity ? base + "(" + capacity + "인)" : base;
  }
  function clock(v) {
    const d = v ? new Date(v) : new Date();
    if (!Number.isFinite(d.getTime())) return "-";
    return two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());
  }
  function shortClock(v) {
    const raw = text(v);
    const m = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (m) return two(m[1]) + ":" + m[2];
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return raw;
    return two(d.getHours()) + ":" + two(d.getMinutes());
  }
  function sortAt(dateValue, timeValue, rawValue) {
    const rawDate = text(dateValue);
    const rawTime = text(timeValue);
    const raw = text(rawValue);
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) return parsed.getTime();
    const y = new Date().getFullYear();
    const dm = rawDate.match(/(?:(\d{4})-)?(\d{1,2})-(\d{1,2})/);
    const tm = rawTime.match(/(\d{1,2}):(\d{2})/);
    if (dm && tm) return new Date(Number(dm[1] || y), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2])).getTime();
    if (tm) return Number(tm[1]) * 60 + Number(tm[2]);
    return 0;
  }
  function statusClass(status) {
    const value = text(status);
    if (/진행중|발생/.test(value)) return "active";
    if (/예약 가능/.test(value)) return "available";
    if (/마감|선점|예약 중|예약중/.test(value)) return "closed";
    return "";
  }
  function displayStatus(record, info) {
    const raw = text(record.statusLabel) || text(record.status_text) || text(record.statusText) || text(record.status);
    if (/^발생$/.test(raw) && info.kind === "취소중") return "취소 진행중";
    if (/^발생$/.test(raw)) return "예약 가능 발생";
    if (raw && raw !== "N" && raw !== "Y") return raw;
    if (info.kind === "취소중" && info.status === "발생") return "취소 진행중";
    return info.status || "발생";
  }
  function statusInfo(item) {
    const combined = [item && item.event_type, item && item.eventType, item && item.kind, item && item.status, item && item.state, item && item.statusText, item && item.message].map(text).join(" ");
    const canclYn = text(item && item.canclYn).toUpperCase();
    const resveAt = text(item && item.resveAt).toUpperCase();
    const resveYn = text(item && item.resveYn).toUpperCase();
    const preocpcYn = text(item && item.preocpcYn).toUpperCase();
    const imprtyYn = text(item && item.imprtyYn).toUpperCase();
    if (canclYn === "N" || /canceling|취소\s*진행|취소중/i.test(combined)) return { kind: "취소중", cls: "canceling", status: "발생" };
    if (resveAt === "Y" && resveYn === "Y" && preocpcYn === "Y" && imprtyYn === "N" && canclYn === "Y") return { kind: "예약가능", cls: "available", status: "종료 → 예약 가능" };
    if (/예약\s*마감|예약마감|예약\s*불가|예약불가|마감|불가|closed|unavailable/i.test(combined)) return { kind: "예약가능", cls: "available", status: "종료 → 예약 마감" };
    if (/선점|예약\s*완료|예약완료|예약\s*중|예약중|결제\s*완료|결제완료|reserved|payment/i.test(combined)) return { kind: "예약가능", cls: "available", status: "종료 → 선점/예약 중" };
    if (/available|예약\s*가능|예약가능|\bY\b/i.test(combined)) return { kind: "예약가능", cls: "available", status: "종료 → 예약 가능" };
    return { kind: "취소중", cls: "canceling", status: "발생" };
  }
  function recordKey(r) { return [r.date, r.facility, r.room].join("|"); }
  function normalizeRecord(record) {
    const info = statusInfo(record || {});
    const sourceTime = record.detected || record.detected_at || record.detectedAt || record.received_at || record.time || record.created_at || record.updated_at;
    const date = text(record.date || record.target_date || record.targetDate || record.beginDate || record.resveBeginDe).replace(/^\d{4}-/, "");
    const detected = shortClock(sourceTime);
    const kind = text(record.kind) || info.kind;
    const status = displayStatus(record || {}, { ...info, kind });
    return {
      date,
      facility: facilityName(record.facility || record.category || record.fcltyNm || record.name),
      room: roomWithCapacity(record.room || record.room_name || record.roomName || record.roomNo, record),
      detected,
      sortAt: sortAt(date, detected, sourceTime),
      kind,
      kindClass: /예약/.test(kind) ? "available" : info.cls,
      status
    };
  }
  function loadHistory() {
    try { const v = JSON.parse(localStorage.getItem(HISTORY_STORE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }
  function saveHistory(items) {
    try { localStorage.setItem(HISTORY_STORE_KEY, JSON.stringify(items.slice(-700))); } catch (_) {}
  }
  function mergeHistory() {
    const map = new Map();
    Array.from(arguments).flat().forEach(item => {
      const record = normalizeRecord(item || {});
      if (!record.date || !record.facility || !record.room || !record.detected || record.date.includes("없습니다")) return;
      const key = recordKey(record);
      const prev = map.get(key);
      if (!prev) map.set(key, record);
      else map.set(key, { ...prev, kind: record.kind || prev.kind, kindClass: record.kindClass || prev.kindClass, status: record.status && record.status !== "발생" ? record.status : prev.status, detected: prev.detected || record.detected, sortAt: Math.max(Number(prev.sortAt || 0), Number(record.sortAt || 0)) });
    });
    return Array.from(map.values()).sort((a, b) => (Number(b.sortAt || 0) - Number(a.sortAt || 0)) || (a.date + a.facility + a.room).localeCompare(b.date + b.facility + b.room, "ko"));
  }
  function rowsToRecords(selector, active) {
    return Array.from(document.querySelectorAll(selector + " .grid-row")).map(row => {
      const c = Array.from(row.children).map(el => text(el.textContent));
      if (c.length < 4) return null;
      if (active) return normalizeRecord({ date: c[0], facility: c[1], room: c[2], detected: c[3], kind: "취소중", status: "취소 진행중", canclYn: "N" });
      if (/^\d{1,2}:\d{2}/.test(c[0])) return normalizeRecord({ detected: c[0], kind: c[1], status: c[2], date: c[3], facility: c[4], room: c[5] });
      return normalizeRecord({ date: c[0], facility: c[1], room: c[2], detected: c[3], kind: c[4], status: c[5] });
    }).filter(Boolean);
  }
  function renderHistory(items) {
    const wrap = document.querySelector("#firstRows.history-grid");
    if (!wrap) return;
    const signature = JSON.stringify(items.map(item => [item.detected, item.kind, item.status, item.date, item.facility, item.room, item.sortAt]));
    const expectedHeader = "시간|종류|상태|날짜|시설|객실";
    const currentHeader = Array.from(wrap.querySelectorAll(".grid-head > *")).map(el => text(el.textContent)).join("|");
    if (wrap.dataset.codexHistorySignature === signature && currentHeader === expectedHeader) return;
    wrap.dataset.codexHistorySignature = signature;
    if (!items.length) { wrap.innerHTML = '<div class="empty">누적 감지 기록이 없습니다.</div>'; return; }
    wrap.innerHTML = '<div class="grid-head"><span>시간</span><span>종류</span><span>상태</span><span>날짜</span><span>시설</span><span>객실</span></div>' + items.map(item => {
      const cls = /예약/.test(item.kind) ? "available" : "canceling";
      const statusCls = statusClass(item.status);
      return '<div class="grid-row"><time>' + escapeHtml(item.detected) + '</time><span class="history-kind ' + cls + '">' + escapeHtml(item.kind) + '</span><span class="history-status ' + statusCls + '">' + escapeHtml(item.status || "발생") + '</span><span>' + escapeHtml(item.date).replace(/^\d{4}-/, "") + '</span><strong>' + escapeHtml(item.facility) + '</strong><span>' + escapeHtml(item.room) + '</span></div>';
    }).join("");
  }
  function applyRoomCapacityLabels() {
    Array.from(document.querySelectorAll("#activeRows .grid-row")).forEach(row => {
      const c = row.children;
      if (!c || c.length < 3) return;
      c[2].textContent = roomWithCapacity(c[2].textContent, { facility: c[1].textContent, category: c[1].textContent, room: c[2].textContent });
    });
    Array.from(document.querySelectorAll("#firstRows.history-grid .grid-row")).forEach(row => {
      const c = row.children;
      if (!c || c.length < 6) return;
      c[5].textContent = roomWithCapacity(c[5].textContent, { facility: c[4].textContent, category: c[4].textContent, room: c[5].textContent });
    });
  }
  function ensureSummary() {
    let box = document.getElementById("codexLiveSummary");
    if (box) return box;
    const controls = document.querySelector(".panel.controls");
    box = document.createElement("section");
    box.id = "codexLiveSummary";
    box.className = "codex-live-summary";
    box.innerHTML = '<div class="summary-cell"><span class="summary-label">현재시간</span><strong class="summary-value" data-summary="now">--:--:--</strong></div><div class="summary-cell"><span class="summary-label">취소</span><strong class="summary-value" data-summary="cancel">0건</strong></div><div class="summary-cell"><span class="summary-label">갱신시간</span><strong class="summary-value" data-summary="refresh">-</strong></div><div class="summary-cell"><span class="summary-label">갱신주기</span><strong class="summary-value" data-summary="interval">60초</strong></div>';
    if (controls) controls.insertAdjacentElement("beforeend", box);
    else document.body.insertAdjacentElement("afterbegin", box);
    return box;
  }
  function remainingRefreshSeconds() {
    const interval = Number.isFinite(Number(state.intervalSec)) && Number(state.intervalSec) > 0 ? Number(state.intervalSec) : 60;
    if (!state.lastRefreshMs) return interval;
    return Math.max(0, Math.min(interval, Math.ceil((state.lastRefreshMs + interval * 1000 - Date.now()) / 1000)));
  }
  function setSummary(name, value) { const el = document.querySelector('[data-summary="' + name + '"]'); if (el) el.textContent = value; }
  function renderSummary() {
    ensureSummary();
    setSummary("now", clock());
    setSummary("cancel", state.cancelCount + "건");
    setSummary("refresh", state.lastRefresh);
    setSummary("interval", remainingRefreshSeconds() + "초");
  }
  function cleanupText() {
    Array.from(document.querySelectorAll(".facility-status-box")).forEach(el => el.remove());
    Array.from(document.querySelectorAll(".section-title, h2, h3")).forEach(el => {
      const v = text(el.textContent);
      if (v.includes("현재 실시간 취소 진행 중인 시설")) el.textContent = "취소 진행 중";
      if (v.includes("취소 시설별 최초 감지 기록")) el.textContent = "감지기록 누적";
    });
  }
  function stabilizeActiveRows(active) {
    const wrap = document.querySelector("#activeRows");
    const incoming = Array.isArray(active) ? active : [];
    const domRecords = rowsToRecords("#activeRows", true);
    const hasIncoming = incoming.length > 0;
    const hasDomRows = domRecords.length > 0;
    if (hasIncoming || hasDomRows) {
      if (wrap && wrap.querySelector(".grid-row")) {
        state.lastActiveHtml = wrap.innerHTML;
        state.lastActiveAt = Date.now();
      }
      return hasIncoming ? incoming : domRecords;
    }
    if (wrap && state.lastActiveHtml && Date.now() - state.lastActiveAt <= ACTIVE_EMPTY_GRACE_MS) {
      wrap.innerHTML = state.lastActiveHtml;
      return rowsToRecords("#activeRows", true);
    }
    return incoming;
  }
  async function syncFromServer() {
    if (state.syncing) return;
    state.syncing = true;
    try {
      const response = await fetch("/api/events?codex_refine=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const active = Array.isArray(data.active) ? data.active : [];
      const stableActive = stabilizeActiveRows(active);
      const events = Array.isArray(data.events) ? data.events : [];
      const monitor = data.status && data.status.monitor ? data.status.monitor : {};
      state.cancelCount = stableActive.length || Number(monitor.activeCount || 0) || 0;
      const refreshed = (data.status && data.status.lastRefreshAt) || data.lastRefreshAt || data.lastReportAt;
      state.lastRefresh = refreshed ? clock(refreshed) : "-";
      const rd = refreshed ? new Date(refreshed) : null;
      state.lastRefreshMs = rd && Number.isFinite(rd.getTime()) ? rd.getTime() : Date.now();
      state.intervalSec = Number((data.config && data.config.intervalSec) || monitor.intervalSec || state.intervalSec || 60);
      const merged = mergeHistory(loadHistory(), rowsToRecords("#firstRows.history-grid", false), rowsToRecords("#activeRows", true), events.map(normalizeRecord), stableActive.map(item => normalizeRecord({ ...item, kind: "취소중", canclYn: "N", status: "발생" })));
      saveHistory(merged);
      renderHistory(merged);
      applyRoomCapacityLabels();
      renderSummary();
    } finally {
      state.syncing = false;
    }
  }
  function boot() {
    ensureSummary();
    cleanupText();
    renderSummary();
    renderHistory(mergeHistory(loadHistory(), rowsToRecords("#firstRows.history-grid", false), rowsToRecords("#activeRows", true)));
    applyRoomCapacityLabels();
    syncFromServer();
    setInterval(renderSummary, 1000);
    setInterval(() => { cleanupText(); stabilizeActiveRows([]); applyRoomCapacityLabels(); }, 1000);
    setInterval(() => { const merged = mergeHistory(loadHistory(), rowsToRecords("#firstRows.history-grid", false), rowsToRecords("#activeRows", true)); saveHistory(merged); renderHistory(merged); applyRoomCapacityLabels(); }, 2500);
    setInterval(syncFromServer, 10000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
</script>`;


const state = {
  startedAt: new Date().toISOString(),
  lastReportAt: null,
  lastRefreshAt: null,
  previousRefreshAt: null,
  config: {
    intervalSec: 60,
    facilities: TARGET_FACILITIES
  },
  monitor: {
    count: 0,
    totalRequests: 0,
    activeCount: 0,
    range: "-",
    intervalSec: 60,
    source: "pc-local",
    facilities: TARGET_FACILITIES_TEXT
  },
  heartbeat: null,
  active: [],
  events: []
};


let monitorError = "";
let lastStateSyncAt = 0;


function lastReportAgeMs() {
  const time = new Date(state.lastReportAt || 0).getTime();
  return Number.isFinite(time) ? Date.now() - time : Infinity;
}


function hasFreshLocalReport() {
  return state.monitor.source === "reservation-console" && lastReportAgeMs() <= LOCAL_REPORT_FRESH_MS;
}


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
  if (name === "1600") return "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5";
  if (name === "1500") return "\ud5c8\ud5c8\ubc14\ub2e4";
  if (name === "1400") return "\ub09c\ubc14\ub2e4";
  if (name === "1300") return "\ub4e0\ubc14\ub2e4";
  if (name.includes("\uc790\ub3d9\ucc28") || name.includes("\ucea0\ud551")) {
    return "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5";
  }
  if (name.includes("\ud5c8\ud5c8")) return "\ud5c8\ud5c8\ubc14\ub2e4";
  if (name.includes("\ub09c\ubc14\ub2e4")) return "\ub09c\ubc14\ub2e4";
  if (name.includes("\ub4e0\ubc14\ub2e4")) return "\ub4e0\ubc14\ub2e4";
  return name;
}


function normalizeCategoryFromItem(item) {
  const candidates = [
    item.category,
    item.categoryCode,
    item.catCode,
    item.catName,
    item.fcltyCategory,
    item.facility,
    item.facilityName,
    item.fcltyNm,
    item.fcltyCode,
    item.fcltyTyCode,
    item.facilityCode,
    item.facilityTypeCode,
    item.roomName,
    item.room_name,
    item.room,
    item.name,
    item.nameCol,
    item.message,
    item.raw
  ];
  for (const value of candidates) {
    const normalized = normalizeCategoryName(value);
    if (["\ub4e0\ubc14\ub2e4", "\ub09c\ubc14\ub2e4", "\ud5c8\ud5c8\ubc14\ub2e4", "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5"].includes(normalized)) {
      return normalized;
    }
  }
  return normalizeCategoryName(item.category || item.name || item.facility || "-");
}


function normalizeRoomName(value, category) {
  const text = String(value || "-").trim();
  if (category === "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5") {
    return text.replace(/^\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5\s*/, "");
  }
  return text;
}


function valueOfServer(v) {
  return String(v || "").trim();
}

const DEUNBADA_CAPACITY_MAP_SERVER = {
  "101": "8", "102": "4", "103": "4", "104": "2", "105": "2", "106": "10", "107": "2", "108": "2", "109": "4", "110": "8", "111": "4", "112": "6", "113": "2", "114": "2", "115": "6", "116": "4", "117": "2", "118": "2", "119": "6", "120": "4", "121": "4", "122": "4", "123": "4"
};
const NANBADA_CAPACITY_MAP_SERVER = {
  "101": "8", "102": "6", "103": "4", "104": "4", "105": "6", "106": "10", "107": "4", "108": "4", "109": "8", "110": "6", "111": "4", "112": "4", "113": "8", "114": "6", "115": "10"
};
const HEOHEOBADA_CAPACITY_MAP_SERVER = {
  "101": "10", "102": "8", "103": "4", "104": "4", "105": "6", "106": "4", "107": "4", "108": "10"
};

function roomNumberOfServer(room) {
  const match = valueOfServer(room).match(/(\d+)\s*번?/);
  return match ? match[1] : "";
}

function mappedCapacityServer(item) {
  const facility = valueOfServer(item.facility || item.category || item.categoryName || item.name || item.fcltyNm);
  const roomNo = roomNumberOfServer(item.room || item.roomName || item.room_name || item.name || item.raw);
  if (/든바다/.test(facility)) return DEUNBADA_CAPACITY_MAP_SERVER[roomNo] || "";
  if (/난바다/.test(facility)) return NANBADA_CAPACITY_MAP_SERVER[roomNo] || "";
  if (/허허바다/.test(facility)) return HEOHEOBADA_CAPACITY_MAP_SERVER[roomNo] || "";
  return "";
}

function capacityOf(item) {
  const mapped = mappedCapacityServer(item || {});
  if (mapped) return mapped;
  const direct = valueOfServer(item.capacity || item.people || item.person || item.persons || item.headcount || item.cnt || item.inwon || item.roomCapacity || item.capacityText);
  if (!direct || direct === "2") return "";
  if (/^\d+$/.test(direct)) return direct;
  const match = direct.match(/(\d+)\s*(?:인|명|people|persons?)/i);
  return match ? match[1] : "";
}

function roomWithCapacity(room, item) {
  const base = valueOfServer(room).replace(/\s*\(\d+\s*인\)\s*$/, "");
  const capacity = capacityOf({ ...(item || {}), room: base, roomName: base });
  return base && capacity ? base + "(" + capacity + "인)" : base;
}


function normalizeStatusPhraseServer(text) {
  const raw = valueOfServer(text);
  if (!raw) return "";
  if (/예약\s*완료|예약완료/i.test(raw)) return "예약완료";
  if (/선점\s*\/?\s*예약\s*중|선점\/예약중|선점중|선점/i.test(raw)) return "선점중";
  if (/예약\s*중|예약중/i.test(raw)) return "예약중";
  if (/예약\s*가능|예약가능/i.test(raw)) return "예약가능";
  if (/예약\s*마감|예약마감/i.test(raw)) return "예약마감";
  if (/발생|detected|new/i.test(raw)) return "발생";
  return raw;
}


function signalFlagServer(item, ...names) {
  for (const name of names) {
    const value = valueOfServer(item?.[name]).toUpperCase();
    if (value) return value;
  }
  return "";
}

function signalStatusTextServer(item, previous = {}) {
  const combined = [
    item.state,
    item.statusText,
    item.status_text,
    item.statusLabel,
    item.status_label,
    item.message,
    item.event_type,
    item.eventType,
    item.status,
    previous.state,
    previous.statusText,
    previous.message
  ].map(valueOfServer).filter(Boolean).join(" ");
  const canclYn = signalFlagServer(item, "canclYn", "cancl_yn", "cancelYn", "cancel_yn");
  const resveAt = signalFlagServer(item, "resveAt", "resve_at");
  const resveYn = signalFlagServer(item, "resveYn", "resve_yn");
  const preocpcYn = signalFlagServer(item, "preocpcYn", "preocpc_yn");
  const imprtyYn = signalFlagServer(item, "imprtyYn", "imprty_yn");
  if (canclYn === "N") return "발생";
  if (resveAt === "Y" && resveYn === "Y" && preocpcYn === "Y" && imprtyYn === "N" && canclYn === "Y") return "종료 → 예약 가능";
  if (/예약\s*마감|예약마감|예약\s*불가|예약불가|예약\s*불가능|마감|불가|closed|unavailable/i.test(combined)) return "종료 → 예약 마감";
  if (/선점|예약\s*완료|예약완료|예약\s*중|예약중|결제\s*완료|결제완료|payment\s*complete|reserved/i.test(combined)) return "종료 → 선점/예약 중";
  if (/available|예약\s*가능|예약가능|\bY\b/i.test(combined)) return "종료 → 예약 가능";
  return "발생";
}

function referenceStatusTailServer(phrase) {
  const raw = normalizeStatusPhraseServer(phrase);
  if (/예약가능/i.test(raw)) return "예약 가능";
  if (/예약마감/i.test(raw)) return "예약 마감";
  if (/예약완료|예약중|선점중|선점/i.test(raw)) return "선점/예약 중";
  return raw;
}

function eventStatusText(item, previous = {}) {
  const combined = [
    item.state,
    item.statusText,
    item.status_text,
    item.statusLabel,
    item.status_label,
    item.message,
    item.event_type,
    item.eventType,
    item.status,
    previous.state,
    previous.statusText,
    previous.message
  ].map(valueOfServer).filter(Boolean).join(" ");
  const ended = combined.match(/종료\s*(?:→|->|-)?\s*([^,|]*)/);
  if (ended) {
    const tail = referenceStatusTailServer(ended[1]);
    return tail && tail !== "발생" ? "종료 → " + tail : "종료";
  }
  const signalStatus = signalStatusTextServer(item, previous);
  if (signalStatus) return signalStatus;
  const phrase = normalizeStatusPhraseServer((combined.match(/예약\s*완료|예약완료|선점\s*\/?\s*예약\s*중|선점\/예약중|선점중|선점|예약\s*중|예약중|예약\s*가능|예약가능|예약\s*마감|예약마감|발생/i) || [""])[0]);
  if (/예약\s*마감|예약마감|예약\s*불가|예약불가|예약\s*불가능|마감|불가|closed|unavailable/i.test(combined)) return "종료 → 예약 마감";
  if (/선점|예약\s*완료|예약완료|예약\s*중|예약중|결제\s*완료|결제완료|payment\s*complete|reserved/i.test(combined)) return "종료 → 선점/예약 중";
  if (/종료|ended|closed|finish/i.test(combined) && phrase && phrase !== "발생") return "종료 → " + referenceStatusTailServer(phrase);
  return "발생";
}



function normalizeItem(item) {
  const category = normalizeCategoryFromItem(item);
  const roomName = normalizeRoomName(item.roomName || item.room_name || item.room || item.fcltyNm || item.nameCol, category);
  const capacity = capacityOf({ ...item, category, facility: category, room: roomName, roomName });
  const displayRoomName = roomWithCapacity(roomName, { ...item, category, facility: category, capacity });
  const rawStatus = String(item.status || item.canclYn || item.cancelYn || item.state || "").trim();
  const rawEventType = String(item.event_type || item.eventType || "").trim();
  const rawMessage = String(item.message || "").trim();
  const rawStatusText = String(item.statusText || item.status_text || item.statusLabel || item.status_label || "").trim();
  const inferredAvailable = /available|예약\s*가능|예약가능|예약\s*마감|예약마감|예약\s*완료|예약완료|선점|예약\s*중|예약중|Y/i.test([rawEventType, rawStatus, rawMessage, rawStatusText].join(" "));
  const inferredEventType = rawEventType || (inferredAvailable ? "available" : "canceling");
  const normalizedStatus = rawStatus || (inferredEventType === "available" ? "Y" : "N");
  const id = String(item.id || [item.date || item.target_date || item.beginDate || item.resveBeginDe || "", category, roomName, item.fcltyCode || "", item.fcltyTyCode || "", item.resveNoCode || ""].join("|"));
  const detectedAt = item.detectedAt || item.detected_at || item.time || item.detected || item.detectedTime || item.received_at || new Date().toISOString();
  return { id, date: String(item.date || item.target_date || item.beginDate || item.resveBeginDe || "-"), category, roomName: displayRoomName, capacity, fcltyCode: String(item.fcltyCode || ""), fcltyTyCode: String(item.fcltyTyCode || ""), resveNoCode: String(item.resveNoCode || ""), status: normalizedStatus, state: String(item.state || ""), event_type: inferredEventType, statusText: rawStatusText, message: rawMessage, resveAt: String(item.resveAt || item.resve_at || ""), resveYn: String(item.resveYn || item.resve_yn || ""), preocpcYn: String(item.preocpcYn || item.preocpc_yn || ""), imprtyYn: String(item.imprtyYn || item.imprty_yn || ""), canclYn: String(item.canclYn || item.cancl_yn || item.cancelYn || item.cancel_yn || ""), detectedAt };
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
    client: heartbeat.client || payload.client || heartbeat.source || payload.source || "state-signal",
    facilities: targetFacilitiesFrom(heartbeat.facilities || heartbeat.targetFacilities || payload.facilities || payload.targetFacilities)
  };
}

function facilityTextOf(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean).join(",");
  return String(value || "").trim();
}

function facilityMatchesName(value, facility) {
  const text = String(value || "").trim();
  if (!text || !facility) return false;
  if (facility === "자동차캠핑장") return /자동차|오토|캠핑/.test(text);
  return text.includes(facility);
}

function itemMatchesFacility(item, facility) {
  return facilityMatchesName(item && (item.category || item.facility || item.name || item.fcltyNm), facility);
}

function payloadFacilityText(payload, heartbeat) {
  const rawHeartbeat = payload && payload.heartbeat && typeof payload.heartbeat === "object" ? payload.heartbeat : payload;
  return facilityTextOf(
    (rawHeartbeat && (rawHeartbeat.facilities || rawHeartbeat.targetFacilities || rawHeartbeat.facility)) ||
    (payload && (payload.facilities || payload.targetFacilities || payload.facility)) ||
    ""
  );
}

function heartbeatCoversFacility(payload, heartbeat, normalizedItems, facility) {
  const source = String(heartbeat && heartbeat.client || "");
  if (/dashboard-html/.test(source)) {
    return normalizedItems.some(item => itemMatchesFacility(item, facility));
  }
  const facilities = payloadFacilityText(payload, heartbeat);
  if (!facilities) return false;
  return facilityMatchesName(facilities, facility);
}

function mergeActiveWithPreviousForUncoveredFacilities(nextActive, payload, heartbeat) {
  const map = new Map(nextActive.map(item => [item.id, item]));
  for (const facility of TARGET_FACILITIES) {
    if (heartbeatCoversFacility(payload, heartbeat, nextActive, facility)) continue;
    for (const previous of state.active || []) {
      if (itemMatchesFacility(previous, facility)) map.set(previous.id, previous);
    }
  }
  return Array.from(map.values());
}



function eventForState(item) {
  const rawEventType = String(item.event_type || item.eventType || "").trim();
  const rawStatus = String(item.status || "").trim();
  const rawState = String(item.state || "").trim();
  const rawMessage = String(item.message || "").trim();
  const rawStatusText = String(item.statusText || item.status_text || item.statusLabel || item.status_label || "").trim();
  const combinedStatus = [rawEventType, rawStatus, rawState, rawMessage, rawStatusText].join(" ");
  const isAvailable = /available|예약\s*가능|예약가능|예약\s*마감|예약마감|예약\s*완료|예약완료|선점|예약\s*중|예약중|Y/i.test(combinedStatus);
  const eventType = rawEventType || (isAvailable ? "available" : "canceling");
  const stateText = eventStatusText(item) || rawState || rawStatusText || (isAvailable ? "종료" : "발생");
  const displayRoomName = roomWithCapacity(item.roomName, item);
  return { client: item.source || state.monitor.source || "go-mangsang", event_type: eventType, status: rawStatus || (isAvailable ? "Y" : "N"), state: stateText, statusText: rawStatusText, target_date: item.date, facility: item.category, room: displayRoomName, room_name: displayRoomName, capacity: item.capacity || capacityOf(item), detected_at: item.detectedAt, received_at: item.detectedAt, message: rawMessage || rawStatusText || [item.date, item.category, displayRoomName].join(" ").trim() };
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
  const uniqueActive = Array.from(new Map(active.map(item => [item.id, item])).values());
  const hasActivePayload = Array.isArray(heartbeat.canceling_items) || Array.isArray(heartbeat.canceling) || Array.isArray(heartbeat.active) || Array.isArray(heartbeat.canceling_details);
  const mergedActive = hasActivePayload
    ? mergeActiveWithPreviousForUncoveredFacilities(uniqueActive, payload || {}, heartbeat)
    : uniqueActive;


  state.heartbeat = {
    ...heartbeat,
    canceling_count: mergedActive.length,
    canceling_items: mergedActive.map(eventForState)
  };
  state.previousRefreshAt = state.lastRefreshAt;
  state.lastRefreshAt = heartbeat.received_at;
  state.lastReportAt = new Date().toISOString();
  state.monitor = {
    ...state.monitor,
    count: Number(heartbeat.count || state.monitor.count || 0),
    activeCount: mergedActive.length,
    source: String(heartbeat.client || "state-signal"),
    facilities: targetFacilitiesFrom(heartbeat.facilities || heartbeat.targetFacilities)
  };
  monitorError = String(heartbeat.error || heartbeat.monitorError || heartbeat.message || "");


  if (hasActivePayload) {
    state.active = mergedActive;
    saveActive();
  }
  if (mergedActive.length > 0) upsertEvents(mergedActive);
  return mergedActive;
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


function decodeHtmlText(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseReferenceDashboardHtml(html, sourceUrl = "") {
  const raw = String(html || "");
  const receivedText = decodeHtmlText((raw.match(/<div class="info-label">\s*마지막\s*<\/div>\s*<div class="info-value">([\s\S]*?)<\/div>/) || [])[1]) || new Date().toISOString();
  const rows = [];
  const tableMatches = Array.from(raw.matchAll(/<table[\s\S]*?<\/table>/gi)).map(match => match[0]);

  function cellsOf(rowHtml) {
    return Array.from(String(rowHtml || "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(cell => decodeHtmlText(cell[1]));
  }

  function pushActiveRow(cells, indexes, detectedFallback) {
    const date = cells[indexes.date] || "";
    const facility = cells[indexes.facility] || "";
    const people = indexes.people >= 0 ? cells[indexes.people] : "";
    const room = cells[indexes.room] || "";
    const detected = cells[indexes.detected] || detectedFallback || receivedText;
    if (!date || !facility || !room || /없음|없습니다/.test(cells.join(" "))) return;
    rows.push({
      target_date: date,
      date,
      facility,
      category: facility,
      room,
      room_name: room,
      capacityText: people,
      detected,
      detectedAt: detected,
      time: detected,
      expected: indexes.expected >= 0 ? cells[indexes.expected] : "",
      remain: indexes.remain >= 0 ? cells[indexes.remain] : "",
      status: "N",
      canclYn: "N",
      event_type: "canceling",
      state: "취소 진행중",
      statusText: "취소 진행중",
      message: [date, facility, room, people, "취소 진행중"].filter(Boolean).join(" ")
    });
  }

  for (const table of tableMatches) {
    const rowHtmls = Array.from(table.matchAll(/<tr[\s\S]*?<\/tr>/gi)).map(match => match[0]);
    if (!rowHtmls.length) continue;
    const firstCells = cellsOf(rowHtmls[0]);
    const headerText = firstCells.join(" ");
    const looksActiveTable = /날짜/.test(headerText) && /시설/.test(headerText) && /객실/.test(headerText) && /감지/.test(headerText) && !/종류/.test(headerText);
    if (!looksActiveTable) continue;
    const indexes = {
      date: firstCells.findIndex(value => /날짜|체크인/.test(value)),
      facility: firstCells.findIndex(value => /시설/.test(value)),
      people: firstCells.findIndex(value => /인원/.test(value)),
      room: firstCells.findIndex(value => /객실|사이트/.test(value)),
      detected: firstCells.findIndex(value => /감지/.test(value)),
      expected: firstCells.findIndex(value => /예상/.test(value)),
      remain: firstCells.findIndex(value => /남은시간/.test(value))
    };
    if (indexes.date < 0 || indexes.facility < 0 || indexes.room < 0 || indexes.detected < 0) continue;
    rowHtmls.slice(1).forEach(rowHtml => {
      const cells = cellsOf(rowHtml);
      if (cells.length <= Math.max(indexes.date, indexes.facility, indexes.room, indexes.detected)) return;
      pushActiveRow(cells, indexes, receivedText);
    });
  }

  const legacyBlock = (raw.match(/id="cancelingNow"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || "";
  for (const match of legacyBlock.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/g)) {
    const cells = Array.from(match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map(cell => decodeHtmlText(cell[1]));
    if (cells.length < 5) continue;
    pushActiveRow(cells, { date: 0, facility: 1, people: -1, room: 2, detected: 3, expected: 4, remain: 5 }, receivedText);
  }

  return {
    heartbeat: {
      received_at: new Date().toISOString(),
      status: "running",
      client: sourceUrl ? "dashboard-html:" + sourceUrl : "mangsang-dashboard-html",
      source_received_at: receivedText,
      canceling_count: rows.length,
      canceling_items: rows,
      available_count: 0,
      available_items: []
    }
  };
}

async function syncStateSignalFromHtml() {
  const collected = [];
  let reachedSource = false;
  let sourceNames = [];
  for (const pageUrl of REFERENCE_DASHBOARD_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const requestUrl = referenceDashboardUrl(pageUrl);
      const response = await fetch(requestUrl, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "User-Agent": "go-mangsang-dashboard-html-sync/1.1" }
      });
      clearTimeout(timer);
      if (!response.ok) continue;
      const html = await response.text();
      const payload = parseReferenceDashboardHtml(html, requestUrl);
      const items = payload.heartbeat && Array.isArray(payload.heartbeat.canceling_items) ? payload.heartbeat.canceling_items : [];
      reachedSource = true;
      sourceNames.push(requestUrl);
      collected.push(...items);
    } catch (error) {
      try { clearTimeout(timer); } catch (_) {}
    }
  }
  if (reachedSource) {
    handleHeartbeatPayload({
      heartbeat: {
        received_at: new Date().toISOString(),
        status: "running",
        client: "dashboard-html-merge",
        sources: sourceNames,
        facilities: TARGET_FACILITIES_TEXT,
        targetFacilities: TARGET_FACILITIES,
        canceling_count: collected.length,
        canceling_items: collected,
        available_count: 0,
        available_items: []
      }
    });
    return true;
  }
  return false;
}


async function syncStateSignal() {
  const activeSnapshotBefore = activeForView();
  const hasAutoCamping = activeSnapshotBefore.some(item => itemMatchesFacility(item, "자동차캠핑장"));
  if (hasFreshLocalReport() && hasAutoCamping) return;
  if (!STATE_SIGNAL_URL || Date.now() - lastStateSyncAt < 5000) {
    if (hasFreshLocalReport() && !hasAutoCamping) await syncStateSignalFromHtml();
    return;
  }
  lastStateSyncAt = Date.now();
  let synced = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(referenceDashboardUrl(STATE_SIGNAL_URL), {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "go-mangsang-state-sync/1.1" }
    });
    clearTimeout(timer);
    if (response.ok) {
      const payload = await response.json();
      if (payload && payload.heartbeat) {
        handleHeartbeatPayload(payload);
        synced = true;
      }
    }
  } catch (error) {}
  const activeSnapshot = activeForView();
  if (!synced || activeSnapshot.length === 0 || !activeSnapshot.some(item => itemMatchesFacility(item, "자동차캠핑장"))) {
    await syncStateSignalFromHtml();
  }
}


function upsertEvents(items) {
  const map = new Map(state.events.map(item => [item.id, item]));
  for (const item of items) {
    const previous = map.get(item.id);
    const statusText = eventStatusText(item, previous || {});
    if (!previous) {
      map.set(item.id, { ...item, state: statusText, statusText });
      continue;
    }
    map.set(item.id, {
      ...previous,
      status: item.status || previous.status,
      state: statusText || item.state || previous.state,
      event_type: item.event_type || previous.event_type,
      statusText: statusText || item.statusText || item.status_text || item.statusLabel || item.status_label || previous.statusText,
      capacity: item.capacity || previous.capacity,
      roomName: roomWithCapacity(previous.roomName || item.roomName, item.capacity ? item : previous),
      message: item.message || previous.message,
      resveAt: item.resveAt || previous.resveAt,
      resveYn: item.resveYn || previous.resveYn,
      preocpcYn: item.preocpcYn || previous.preocpcYn,
      imprtyYn: item.imprtyYn || previous.imprtyYn,
      canclYn: item.canclYn || previous.canclYn,
      detectedAt: previous.detectedAt || item.detectedAt
    });
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


function patchHtmlResponse(filePath, content) {
  if (path.basename(filePath) !== "index.html") return content;
  const html = content.toString("utf8");
  if (html.includes("codex-facility-status-box") || !html.includes("</head>")) return html;
  return html.replace("</head>", `${UI_FIX_CSS}\n</head>`);
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
    const responseType = contentTypeFor(filePath);
    const responseBody = responseType.startsWith("text/html") ? patchHtmlResponse(filePath, content) : content;
    res.writeHead(200, {
      "Content-Type": responseType,
      "Cache-Control": "no-store"
    });
    res.end(responseBody);
  });
}


function activeForView() {
  if (state.monitor.source === "reservation-console" && lastReportAgeMs() > LOCAL_REPORT_FRESH_MS) {
    return [];
  }
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
      await syncStateSignal();
      sendJson(res, 200, { ok: true, ...state, eventCount: state.events.length, monitorError, monitorRunning: false });
      return;
    }


    if (req.method === "GET" && url.pathname === "/api/events") {
      await syncStateSignal();
      const active = activeForView();
      if (active.length > 0) upsertEvents(active);
      sendJson(res, 200, {
        ok: true,
        active,
        events: state.events.slice().reverse(),
        config: state.config,
        monitorError,
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
      sendJson(res, 200, { ok: true, config: state.config, targetFacilities: TARGET_FACILITIES });
      return;
    }


    if (req.method === "POST" && url.pathname === "/api/config") {
      const payload = JSON.parse((await readBody(req)) || "{}");
      if (String(payload.password || "") !== CONFIG_PASSWORD) {
        sendJson(res, 403, { ok: false, error: "bad password" });
        return;
      }
      state.config.intervalSec = normalizeIntervalSec(payload.intervalSec);
      state.config.facilities = TARGET_FACILITIES;
      state.monitor.intervalSec = state.config.intervalSec;
      state.monitor.facilities = TARGET_FACILITIES_TEXT;
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
      state.active = allRequestsFailed ? state.active : mergeActiveWithPreviousForUncoveredFacilities(active, payload, payload);
      saveActive();
      state.monitor = {
        count: Number(payload.count || 0),
        totalRequests: Number(payload.totalRequests || 0),
        activeCount: state.active.length,
        range: String(payload.range || "-"),
        intervalSec: Number(payload.intervalSec || state.config.intervalSec),
        source: String(payload.source || "pc-local"),
        facilities: targetFacilitiesFrom(payload.facilities || payload.targetFacilities),
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
      state.monitor.activeCount = 0;
      saveActive();
      sendJson(res, 200, { ok: true, eventCount: state.events.length });
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
