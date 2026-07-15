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
const LOCAL_REPORT_FRESH_MS = 180 * 1000;
const UI_FIX_CSS = String.raw`
<style id="codex-ui-fixes">
#activeRows,
#firstRows.history-grid {
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
}
#activeRows .grid-head,
#activeRows .grid-row,
#firstRows.history-grid .grid-head,
#firstRows.history-grid .grid-row {
  grid-template-columns: 54px 68px 52px 54px 68px 86px !important;
  min-width: 382px !important;
  justify-content: stretch !important;
  gap: 4px !important;
  align-items: center !important;
}
#activeRows .grid-head > *, #activeRows .grid-row > *, #firstRows.history-grid .grid-head > *, #firstRows.history-grid .grid-row > * {
  min-width: 0 !important; max-width: 100% !important; overflow: visible !important; text-overflow: clip !important; white-space: nowrap !important; text-align: center !important;
  font-size: 12px !important;
  letter-spacing: 0 !important;
}
#activeRows .grid-row .remaining-soon, #activeRows .grid-row span.remaining-soon, .grid-row .remaining-soon, .grid-row span.remaining-soon {
  display: inline !important; min-width: 0 !important; min-height: 0 !important; padding: 0 !important; border-radius: 0 !important; background: transparent !important; color: #c40000 !important; font-weight: 950 !important; box-shadow: none !important;
}
.facility-status-box { width: 100%; min-height: 54px; border-radius: 2px; background: #000; margin: 0 0 8px; }
.facility-status-box[hidden] { display: none !important; }
#firstRows.history-grid .grid-head span:nth-child(5), #firstRows.history-grid .grid-row span:nth-child(5), #firstRows.history-grid .grid-head span:nth-child(6), #firstRows.history-grid .grid-row span:nth-child(6) { grid-column: auto !important; text-align: center !important; }
#firstRows.history-grid .grid-row .history-kind, #firstRows.history-grid .grid-row span:nth-child(5).history-kind {
  display: inline-flex !important; align-items: center !important; justify-content: center !important; min-width: 0 !important; width: 100% !important; min-height: 26px !important; padding: 0 2px !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; color: #a36300 !important; font-family: var(--sans) !important; font-size: 12px !important; font-weight: 900 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: clip !important;
}
#firstRows.history-grid .grid-row .history-kind.available, #firstRows.history-grid .grid-row span:nth-child(5).history-kind.available { background: transparent !important; color: #08783f !important; }
#firstRows.history-grid .grid-row .history-status {
  display: flex !important; align-items: center !important; justify-content: center !important; min-height: 34px !important; padding: 0 4px !important; border: 0 !important; background: transparent !important; color: #17211b !important; font-family: var(--sans) !important; font-size: 12px !important; font-weight: 850 !important; line-height: 1.2 !important; white-space: normal !important; word-break: keep-all !important; overflow-wrap: anywhere !important;
}
@media (min-width: 760px) { #activeRows .grid-head, #activeRows .grid-row, #firstRows.history-grid .grid-head, #firstRows.history-grid .grid-row { grid-template-columns: 96px 124px 78px 90px 116px 170px !important; min-width: 674px !important; gap: 8px !important; } #activeRows .grid-head > *, #activeRows .grid-row > *, #firstRows.history-grid .grid-head > *, #firstRows.history-grid .grid-row > * { font-size: 13px !important; } #firstRows.history-grid .grid-row .history-status { font-size: 13px !important; padding: 0 8px !important; } .facility-status-box { min-height: 64px; } }
@media (max-width: 759px) { .facility-status-box { min-height: 42px; } }

.codex-live-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid #cfe0d7;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(25, 48, 38, .08);
}
.codex-live-summary .summary-cell {
  min-width: 0;
  text-align: center;
  border-right: 1px solid #e0ebe5;
}
.codex-live-summary .summary-cell:last-child { border-right: 0; }
.codex-live-summary .summary-label {
  display: block;
  margin-bottom: 5px;
  color: #52665c;
  font-size: 12px;
  font-weight: 800;
}
.codex-live-summary .summary-value {
  display: block;
  color: #071a33;
  font-size: 20px;
  font-weight: 950;
  line-height: 1.15;
  white-space: nowrap;
}
@media (max-width: 520px) {
  .codex-live-summary {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    padding: 10px 8px;
  }
  .codex-live-summary .summary-cell:nth-child(2) { border-right: 1px solid #e0ebe5; }
  .codex-live-summary .summary-value { font-size: 15px; }
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
  color: #c40000 !important;
  font-weight: 950 !important;
  box-shadow: none !important;
}


/* compact mobile layout cleanup */
body .facility-status-box { display: none !important; }
body .panel.controls { gap: 10px !important; }
body .panel.controls button,
body .panel.controls .chip,
body .panel.controls label,
body .panel.controls .segmented button,
body .panel.controls .date-mode button,
body .panel.controls input[type="button"] {
  min-height: 40px !important;
  height: 40px !important;
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}
body .panel.controls input[type="date"],
body .panel.controls input:not([type]),
body .panel.controls select {
  min-height: 40px !important;
  height: 40px !important;
  padding-top: 6px !important;
  padding-bottom: 6px !important;
}
body .codex-live-summary {
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 0 !important;
  margin: 10px 0 2px !important;
  padding: 10px 8px !important;
  border-radius: 8px !important;
}
body .codex-live-summary .summary-cell {
  border-right: 1px solid #e0ebe5 !important;
  padding: 0 4px !important;
}
body .codex-live-summary .summary-cell:last-child { border-right: 0 !important; }
body .codex-live-summary .summary-label {
  margin-bottom: 4px !important;
  font-size: 11px !important;
  line-height: 1.1 !important;
}
body .codex-live-summary .summary-value {
  font-size: 16px !important;
  line-height: 1.15 !important;
  white-space: nowrap !important;
}
body #activeRows,
body #firstRows.history-grid {
  overflow-x: hidden !important;
}
body #activeRows .grid-head,
body #activeRows .grid-row,
body #firstRows.history-grid .grid-head,
body #firstRows.history-grid .grid-row {
  grid-template-columns: 44px 58px 44px 48px 54px minmax(58px, 1fr) !important;
  min-width: 0 !important;
  width: 100% !important;
  gap: 3px !important;
}
body #activeRows .grid-head > *,
body #activeRows .grid-row > *,
body #firstRows.history-grid .grid-head > *,
body #firstRows.history-grid .grid-row > * {
  font-size: 11px !important;
  overflow: visible !important;
  text-overflow: clip !important;
  white-space: nowrap !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
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
  color: #c40000 !important;
  font-weight: 950 !important;
  box-shadow: none !important;
}
@media (max-width: 390px) {
  body .codex-live-summary .summary-label { font-size: 10px !important; }
  body .codex-live-summary .summary-value { font-size: 14px !important; }
  body #activeRows .grid-head,
  body #activeRows .grid-row,
  body #firstRows.history-grid .grid-head,
  body #firstRows.history-grid .grid-row {
    grid-template-columns: 42px 55px 42px 45px 50px minmax(54px, 1fr) !important;
    gap: 2px !important;
  }
  body #activeRows .grid-head > *,
  body #activeRows .grid-row > *,
  body #firstRows.history-grid .grid-head > *,
  body #firstRows.history-grid .grid-row > * { font-size: 10.5px !important; }
}
@media (min-width: 760px) {
  body .codex-live-summary .summary-value { font-size: 20px !important; }
  body #activeRows .grid-head,
  body #activeRows .grid-row,
  body #firstRows.history-grid .grid-head,
  body #firstRows.history-grid .grid-row {
    grid-template-columns: 96px 124px 78px 90px 116px minmax(170px, 1fr) !important;
    gap: 8px !important;
  }
  body #activeRows .grid-head > *,
  body #activeRows .grid-row > *,
  body #firstRows.history-grid .grid-head > *,
  body #firstRows.history-grid .grid-row > * { font-size: 13px !important; }
}


/* readability and compact controls pass */
body .panel.controls {
  gap: 6px !important;
  padding-top: 12px !important;
  padding-bottom: 12px !important;
}
body .panel.controls .field-title,
body .panel.controls h2,
body .panel.controls h3 {
  margin-bottom: 4px !important;
  line-height: 1.15 !important;
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
body #activeRows .grid-head,
body #activeRows .grid-row,
body #firstRows.history-grid .grid-head,
body #firstRows.history-grid .grid-row {
  grid-template-columns: 43px 56px 42px 46px 50px minmax(60px, 1fr) !important;
  gap: 2px !important;
}
body #activeRows .grid-head > *,
body #activeRows .grid-row > *,
body #firstRows.history-grid .grid-head > *,
body #firstRows.history-grid .grid-row > * {
  font-size: 12px !important;
  font-weight: 900 !important;
  line-height: 1.18 !important;
  letter-spacing: 0 !important;
}
body #activeRows .grid-row .remaining-soon,
body #activeRows .grid-row span.remaining-soon,
body .grid-row .remaining-soon,
body .grid-row span.remaining-soon {
  font-size: 12px !important;
  font-weight: 950 !important;
}
body #firstRows.history-grid .grid-row .history-kind,
body #firstRows.history-grid .grid-row span:nth-child(5).history-kind,
body #firstRows.history-grid .grid-row .history-status {
  font-size: 12px !important;
  font-weight: 900 !important;
}
@media (max-width: 390px) {
  body #activeRows .grid-head,
  body #activeRows .grid-row,
  body #firstRows.history-grid .grid-head,
  body #firstRows.history-grid .grid-row {
    grid-template-columns: 40px 52px 40px 43px 47px minmax(52px, 1fr) !important;
    gap: 1px !important;
  }
  body #activeRows .grid-head > *,
  body #activeRows .grid-row > *,
  body #firstRows.history-grid .grid-head > *,
  body #firstRows.history-grid .grid-row > *,
  body #firstRows.history-grid .grid-row .history-kind,
  body #firstRows.history-grid .grid-row span:nth-child(5).history-kind,
  body #firstRows.history-grid .grid-row .history-status {
    font-size: 12px !important;
  }
}

/* align history rows with active rows */
body #firstRows.history-grid .grid-row .history-kind,
body #firstRows.history-grid .grid-row span:nth-child(5).history-kind,
body #firstRows.history-grid .grid-row .history-status {
  display: block !important;
  min-height: 0 !important;
  height: auto !important;
  padding: 0 !important;
  line-height: 1.18 !important;
  white-space: nowrap !important;
  overflow: visible !important;
  text-overflow: clip !important;
  text-align: center !important;
}
body #firstRows.history-grid .grid-row {
  min-height: 33px !important;
  align-items: center !important;
}

/* show capacity beside room without horizontal scroll */
body #activeRows .grid-head,
body #activeRows .grid-row,
body #firstRows.history-grid .grid-head,
body #firstRows.history-grid .grid-row {
  grid-template-columns: 39px 50px 64px 42px 44px minmax(52px, 1fr) !important;
  gap: 2px !important;
}
body #activeRows .grid-head > *,
body #activeRows .grid-row > *,
body #firstRows.history-grid .grid-head > *,
body #firstRows.history-grid .grid-row > * {
  font-size: 11.5px !important;
  letter-spacing: 0 !important;
}
@media (max-width: 390px) {
  body #activeRows .grid-head,
  body #activeRows .grid-row,
  body #firstRows.history-grid .grid-head,
  body #firstRows.history-grid .grid-row {
    grid-template-columns: 38px 49px 63px 41px 43px minmax(50px, 1fr) !important;
    gap: 1px !important;
  }
  body #activeRows .grid-head > *,
  body #activeRows .grid-row > *,
  body #firstRows.history-grid .grid-head > *,
  body #firstRows.history-grid .grid-row > * {
    font-size: 11px !important;
  }
}
@media (min-width: 760px) {
  body #activeRows .grid-head,
  body #activeRows .grid-row,
  body #firstRows.history-grid .grid-head,
  body #firstRows.history-grid .grid-row {
    grid-template-columns: 96px 124px 112px 90px 116px minmax(154px, 1fr) !important;
    gap: 8px !important;
  }
}
</style>
<script id="codex-facility-status-box" defer>
(() => {
  function valueOf(v) { return String(v || "").trim(); }
  const DEUNBADA_CAPACITY_MAP = {
    "101": "8", "102": "4", "103": "4", "104": "2", "105": "2", "106": "10", "107": "2", "108": "2", "109": "4", "110": "8", "111": "4", "112": "6", "113": "2", "114": "2", "115": "6", "116": "4", "117": "2", "118": "2", "119": "6", "120": "4", "121": "4", "122": "4", "123": "4"
  };
  const NANBADA_CAPACITY_MAP = {
    "101": "8", "102": "6", "103": "4", "104": "4", "105": "6", "106": "10", "107": "4", "108": "4", "109": "8", "110": "6", "111": "4", "112": "4", "113": "8", "114": "6", "115": "10"
  };
  const HEOHEOBADA_CAPACITY_MAP = {
    "101": "10", "102": "8", "103": "4", "104": "4", "105": "6", "106": "4", "107": "4", "108": "10"
  };
  function roomNumberOf(room) {
    const match = valueOf(room).match(/(\d+)\s*번?/);
    return match ? match[1] : "";
  }
  function mappedCapacity(item) {
    const facility = valueOf(item?.facility || item?.category || item?.categoryName || item?.name || item?.fcltyNm);
    const roomNo = roomNumberOf(item?.room || item?.roomName || item?.room_name || item?.name || item?.raw);
    if (/든바다/.test(facility)) return DEUNBADA_CAPACITY_MAP[roomNo] || "";
    if (/난바다/.test(facility)) return NANBADA_CAPACITY_MAP[roomNo] || "";
    if (/허허바다/.test(facility)) return HEOHEOBADA_CAPACITY_MAP[roomNo] || "";
    return "";
  }
  function capacityOf(item) {
    const mapped = mappedCapacity(item || {});
    if (mapped) return mapped;
    const direct = valueOf(item?.capacity || item?.people || item?.person || item?.persons || item?.headcount || item?.cnt || item?.inwon || item?.roomCapacity || item?.capacityText);
    if (!direct || direct === "2") return "";
    if (/^\d+$/.test(direct)) return direct;
    const match = direct.match(/(\d+)\s*(?:인|명|people|persons?)/i);
    return match ? match[1] : "";
  }
  function roomWithCapacity(room, item) {
    const base = valueOf(room).replace(/\s*\(\d+\s*인\)\s*$/, "");
    const capacity = capacityOf({ ...(item || {}), room: base, roomName: base });
    return base && capacity ? base + "(" + capacity + "인)" : base;
  }
  function applyRoomCapacityLabels() {
    Array.from(document.querySelectorAll('#activeRows .grid-row, #firstRows.history-grid .grid-row')).forEach(row => {
      const cells = row.children;
      if (!cells || cells.length < 3) return;
      const roomCell = cells[2];
      const current = valueOf(roomCell.textContent);
      if (!current) return;
      const facility = valueOf(cells[1]?.textContent);
      roomCell.textContent = roomWithCapacity(current, { facility, category: facility, room: current, roomName: current });
    });
  }
  function joined(item) { return [item?.event_type, item?.eventType, item?.kind, item?.status, item?.state, item?.message].map(valueOf).join(" "); }
  function isAvailable(item) { return /available|예약\s*가능|예약가능|예약\s*마감|예약마감|예약\s*완료|예약완료|선점|예약\s*중|예약중|Y/i.test(joined(item)); }
  function isEnded(item) { return /종료|ended|closed|finish|complete|예약\s*완료|예약완료|예약\s*마감|예약마감/i.test([item?.state, item?.status, item?.message].map(valueOf).join(" ")); }
  function normalizeStatusPhrase(text) {
    const raw = valueOf(text);
    if (!raw) return "";
    if (/예약\s*완료|예약완료/i.test(raw)) return "예약완료";
    if (/선점\s*\/?\s*예약\s*중|선점\/예약중|선점중|선점/i.test(raw)) return "선점중";
    if (/예약\s*중|예약중/i.test(raw)) return "예약중";
    if (/예약\s*가능|예약가능/i.test(raw)) return "예약가능";
    if (/예약\s*마감|예약마감/i.test(raw)) return "예약마감";
    if (/발생|detected|new/i.test(raw)) return "발생";
    return raw;
  }
  function explicitStatusPhrase(item) {
    const combined = [item?.statusText, item?.status_text, item?.statusLabel, item?.status_label, item?.state, item?.status, item?.message, item?.event_type, item?.eventType].map(valueOf).filter(Boolean).join(" ");
    const match = combined.match(/예약\s*완료|예약완료|선점\s*\/?\s*예약\s*중|선점\/예약중|선점중|선점|예약\s*중|예약중|예약\s*가능|예약가능|예약\s*마감|예약마감|발생/i);
    return match ? normalizeStatusPhrase(match[0]) : "";
  }
  function signalFlag(item, ...names) {
    for (const name of names) {
      const value = valueOf(item?.[name]).toUpperCase();
      if (value) return value;
    }
    return "";
  }
  function signalStatusText(item) {
    const combined = [item?.state, item?.status, item?.statusText, item?.status_text, item?.statusLabel, item?.status_label, item?.message, item?.event_type, item?.eventType].map(valueOf).filter(Boolean).join(" ");
    const resveAt = signalFlag(item, "resveAt", "resve_at");
    const resveYn = signalFlag(item, "resveYn", "resve_yn");
    const preocpcYn = signalFlag(item, "preocpcYn", "preocpc_yn");
    const imprtyYn = signalFlag(item, "imprtyYn", "imprty_yn");
    const canclYn = signalFlag(item, "canclYn", "cancl_yn", "cancelYn", "cancel_yn") || (signalFlag(item, "status") === "N" ? "N" : "");
    if ((item?._activeSignalMatch || item?.myActive || item?.mine || item?.isMine) && (preocpcYn === "Y" || /선점|preocpc|active/i.test(combined))) return "나의 선점 시설";
    if (/예약 *완료|예약완료|예약 *중|예약중|결제 *완료|결제완료|payment *complete|reserved/i.test(combined)) return "예약중";
    if (/예약 *마감|예약마감|예약 *불가|예약불가|예약 *불가능|마감|불가|closed|unavailable/i.test(combined)) return "예약마감시설";
    if (canclYn === "N") return "취소진행시설";
    if (resveAt === "Y" || resveYn === "Y" || preocpcYn === "Y" || imprtyYn === "N" || canclYn === "Y" || /available|예약 *가능|예약가능/i.test(combined)) return "예약가능시설";
    return "";
  }

  function installStatusOverrides() {
    window.historyKind = function historyKind(item) { return isAvailable(item) ? "예약가능" : "취소중"; };
    window.historyKindClass = function historyKindClass(item) { return isAvailable(item) ? "history-kind available" : "history-kind canceling"; };
    window.statusText = function statusText(item) {
      const state = valueOf(item?.state), status = valueOf(item?.status), message = valueOf(item?.message);
      const combined = [state, status, message, item?.statusText, item?.status_text, item?.statusLabel, item?.status_label].map(valueOf).filter(Boolean).join(" ");
      const signal = signalStatusText(item);
      if (signal) return signal;
      const endMatch = combined.match(/종료\s*(?:→|->|-)?\s*([^,|]*)/);
      if (endMatch) {
        const tail = normalizeStatusPhrase(endMatch[1]);
        return tail && tail !== "발생" ? "종료 → " + tail : "종료";
      }
      const phrase = explicitStatusPhrase(item);
      if (phrase && phrase !== "발생") return isEnded(item) || isAvailable(item) ? "종료 → " + phrase : phrase;
      if (isEnded(item)) return "종료";
      if (isAvailable(item)) return "종료 → 예약가능";
      if (state && !/^[NY]$/i.test(state) && !/canceling|available/i.test(state)) return normalizeStatusPhrase(state);
      if (status && !/^[NY]$/i.test(status) && !/canceling|available/i.test(status)) return normalizeStatusPhrase(status);
      if (/canceling|취소|N/i.test(combined)) return "취소 진행중";
      return phrase || "발생";
    };
    if (typeof window.render === "function") window.render();
  }
  function insertFacilityBox() { if (document.querySelector(".facility-status-box")) return; const titles = Array.from(document.querySelectorAll(".field-title")); const facilityTitle = titles.find(title => (title.textContent || "").includes("시설명")); if (!facilityTitle) return; const box = document.createElement("div"); box.className = "facility-status-box"; box.setAttribute("aria-label", "상태 표시 박스"); facilityTitle.insertAdjacentElement("afterend", box); }

  const summaryState = { lastRefresh: '-', interval: '-', intervalSec: 60, lastRefreshMs: 0, cancelCount: null };

  function two(value) { return String(value).padStart(2, '0'); }

  function formatClock(value) {
    const date = value ? new Date(value) : new Date();
    if (!Number.isFinite(date.getTime())) return '-';
    return two(date.getHours()) + ':' + two(date.getMinutes()) + ':' + two(date.getSeconds());
  }

  function normalizeInterval(sec) {
    const n = Number(sec);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 60;
  }

  function remainingRefreshSeconds() {
    const interval = normalizeInterval(summaryState.intervalSec);
    const base = Number(summaryState.lastRefreshMs || 0);
    if (!base) return interval;
    const next = base + interval * 1000;
    return Math.max(0, Math.min(interval, Math.ceil((next - Date.now()) / 1000)));
  }

  function countActiveRows() {
    return Array.from(document.querySelectorAll('#activeRows .grid-row'))
      .filter(row => (row.textContent || '').trim() && !(row.textContent || '').includes('없습니다'))
      .length;
  }

  function ensureLiveSummaryBox() {
    let box = document.getElementById('codexLiveSummary');
    if (box) return box;
    const controls = document.querySelector('.panel.controls');
    const app = document.querySelector('.app') || document.body;
    box = document.createElement('section');
    box.id = 'codexLiveSummary';
    box.className = 'codex-live-summary';
    box.innerHTML = [
      '<div class="summary-cell"><span class="summary-label">현재시간</span><strong class="summary-value" data-summary="now">--:--:--</strong></div>',
      '<div class="summary-cell"><span class="summary-label">취소</span><strong class="summary-value" data-summary="cancel">0건</strong></div>',
      '<div class="summary-cell"><span class="summary-label">갱신시간</span><strong class="summary-value" data-summary="refresh">-</strong></div>',
      '<div class="summary-cell"><span class="summary-label">갱신주기</span><strong class="summary-value" data-summary="interval">60초</strong></div>'
    ].join('');
    if (controls) controls.insertAdjacentElement('beforeend', box);
    else app.insertAdjacentElement('afterbegin', box);
    return box;
  }

  function setSummaryValue(name, value) {
    const el = document.querySelector('[data-summary="' + name + '"]');
    if (el) el.textContent = value;
  }

  function renderLiveSummary() {
    ensureLiveSummaryBox();
    const count = summaryState.cancelCount == null ? countActiveRows() : summaryState.cancelCount;
    setSummaryValue('now', formatClock());
    setSummaryValue('cancel', count + '건');
    setSummaryValue('refresh', summaryState.lastRefresh);
    setSummaryValue('interval', remainingRefreshSeconds() + '초');
  }

  function requestSummaryStatus() {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/events?summary=' + Date.now(), true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || xhr.status < 200 || xhr.status >= 300) return;
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          const active = Array.isArray(data.active) ? data.active : [];
          const monitor = data.status && data.status.monitor ? data.status.monitor : data.monitor || {};
          summaryState.cancelCount = active.length || Number(monitor.activeCount || 0) || countActiveRows();
          const refreshed = data.status?.lastRefreshAt || data.lastRefreshAt || data.lastReportAt || data.heartbeat?.received_at;
          summaryState.lastRefresh = refreshed ? formatClock(refreshed) : '-';
          const refreshDate = refreshed ? new Date(refreshed) : null;
          summaryState.lastRefreshMs = refreshDate && Number.isFinite(refreshDate.getTime()) ? refreshDate.getTime() : Date.now();
          summaryState.intervalSec = normalizeInterval(data.config?.intervalSec || monitor.intervalSec || data.intervalSec);
          renderLiveSummary();
        } catch (error) {}
      };
      xhr.send();
    } catch (error) {}
  }



  function applyLayoutTextCleanup() {
    Array.from(document.querySelectorAll('.facility-status-box')).forEach(el => el.remove());
    Array.from(document.querySelectorAll('.panel.section .section-title, .panel.section h2, .panel.section h3, .section-title, h2, h3'))
      .forEach(el => {
        const text = (el.textContent || '').trim();
        if (text.includes('현재 실시간 취소 진행 중인 시설')) el.textContent = '취소 진행 중';
        if (text.includes('취소 시설별 최초 감지 기록')) el.textContent = '감지기록 누적';
      });
  }

  function fixRemainingStyle() {
    Array.from(document.querySelectorAll('.remaining-soon')).forEach(el => {
      el.style.setProperty('display', 'inline', 'important');
      el.style.setProperty('width', 'auto', 'important');
      el.style.setProperty('min-width', '0', 'important');
      el.style.setProperty('min-height', '0', 'important');
      el.style.setProperty('padding', '0', 'important');
      el.style.setProperty('border', '0', 'important');
      el.style.setProperty('border-radius', '0', 'important');
      el.style.setProperty('background', 'transparent', 'important');
      el.style.setProperty('color', '#c40000', 'important');
      el.style.setProperty('font-weight', '950', 'important');
      el.style.setProperty('box-shadow', 'none', 'important');
    });
  }


  const HISTORY_STORE_KEY = "goMangsangFirstDetectedHistoryV1";

  function loadStoredHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_STORE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveStoredHistory(items) {
    try {
      localStorage.setItem(HISTORY_STORE_KEY, JSON.stringify(items.slice(-500)));
    } catch (_) {}
  }

  function normalizeHistoryRecord(record) {
    const kind = valueOf(record.kind) || "취소중";
    const rawStatus = valueOf(record.status) || "발생";
    const status = /취소/.test(kind) && rawStatus === "발생" ? "취소 진행중" : rawStatus;
    return {
      date: valueOf(record.date),
      facility: valueOf(record.facility),
      room: roomWithCapacity(valueOf(record.room), record),
      detected: valueOf(record.detected),
      kind,
      status
    };
  }

  function historyKey(record) {
    return [record.date, record.facility, record.room].join("|");
  }

  function readRowsAsHistory(selector, mode) {
    return Array.from(document.querySelectorAll(selector + " .grid-row")).map(row => {
      const cells = Array.from(row.children).map(cell => valueOf(cell.textContent));
      if (mode === "active" && cells.length >= 4) {
        return normalizeHistoryRecord({ date: cells[0], facility: cells[1], room: cells[2], detected: cells[3], kind: "취소중", status: "발생" });
      }
      if (mode === "history" && cells.length >= 6) {
        return normalizeHistoryRecord({ date: cells[0], facility: cells[1], room: cells[2], detected: cells[3], kind: cells[4], status: cells[5] });
      }
      return null;
    }).filter(item => item && item.date && item.facility && item.room && item.detected && !item.date.includes("없습니다"));
  }

  function mergeHistoryRecords(...groups) {
    const map = new Map();
    groups.flat().forEach(item => {
      const record = normalizeHistoryRecord(item || {});
      if (!record.date || !record.facility || !record.room || !record.detected) return;
      const key = historyKey(record);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, record);
        return;
      }
      map.set(key, {
        ...prev,
        kind: record.kind || prev.kind,
        status: record.status && record.status !== "발생" ? record.status : prev.status,
        detected: prev.detected || record.detected
      });
    });
    return Array.from(map.values()).sort((a, b) => (a.date + a.facility + a.room).localeCompare(b.date + b.facility + b.room, "ko"));
  }

  function historyRenderSignature(items) {
    return JSON.stringify(items.map(item => [item.date, item.facility, item.room, item.detected, item.kind, item.status]));
  }

  function renderStoredHistory(items) {
    const wrap = document.querySelector("#firstRows.history-grid");
    if (!wrap) return;
    const signature = historyRenderSignature(items);
    if (wrap.dataset.codexHistorySignature === signature) return;
    wrap.dataset.codexHistorySignature = signature;
    let head = wrap.querySelector(".grid-head");
    if (!head) {
      head = document.createElement("div");
      head.className = "grid-head";
      ["날짜", "시설", "객실", "감지", "종류", "상태"].forEach(text => {
        const span = document.createElement("span");
        span.textContent = text;
        head.appendChild(span);
      });
    }
    wrap.innerHTML = "";
    wrap.appendChild(head);
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "grid-row empty";
      empty.textContent = "누적 감지 기록이 없습니다.";
      wrap.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "grid-row";
      [item.date, item.facility, item.room, item.detected].forEach(text => {
        const span = document.createElement("span");
        span.textContent = text;
        row.appendChild(span);
      });
      const kind = document.createElement("span");
      kind.className = "history-kind " + (/예약/.test(item.kind) ? "available" : "canceling");
      kind.textContent = item.kind || "취소중";
      row.appendChild(kind);
      const status = document.createElement("span");
      status.className = "history-status";
      status.textContent = /취소/.test(item.kind || "") && (item.status || "발생") === "발생" ? "취소 진행중" : (item.status || "발생");
      row.appendChild(status);
      wrap.appendChild(row);
    });
  }

  function formatHistoryDetected(value) {
    const raw = valueOf(value);
    if (!raw) return "";
    const timeMatch = raw.match(/(d{1,2}):(d{2})(?::d{2})?/);
    if (timeMatch) return timeMatch[1].padStart(2, "0") + ":" + timeMatch[2];
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    return raw;
  }

  function firstValueOf(...values) {
    for (const value of values) {
      const text = valueOf(value);
      if (text) return text;
    }
    return "";
  }

  function historyRecordFromEvent(item, forcedKind) {
    const rawKind = forcedKind || valueOf(item?.kind) || valueOf(item?.event_type) || valueOf(item?.eventType);
    const kind = /available|예약\s*가능|예약가능|예약\s*마감|예약마감|예약\s*완료|예약완료|선점|예약\s*중|예약중|Y/i.test(joined({ ...item, kind: rawKind })) ? "예약가능" : "취소중";
    const detected = formatHistoryDetected(firstValueOf(item?.detected, item?.detected_at, item?.detectedAt, item?.received_at, item?.receivedAt, item?.time, item?.created_at, item?.createdAt, item?.updated_at, item?.updatedAt));
    const rawStatus = typeof statusText === "function" ? statusText(item) : firstValueOf(item?.statusText, item?.status_text, item?.statusLabel, item?.status_label, item?.state, item?.status);
    return normalizeHistoryRecord({
      date: firstValueOf(item?.date, item?.target_date, item?.targetDate, item?.beginDate, item?.resveBeginDe),
      facility: firstValueOf(item?.facility, item?.category, item?.fcltyNm, item?.area),
      room: firstValueOf(item?.room, item?.room_name, item?.roomName, item?.roomNo, item?.room_no),
      detected,
      kind,
      status: rawStatus || (kind === "취소중" ? "취소 진행중" : "발생")
    });
  }

  async function syncHistoryFromServer() {
    if (typeof fetch !== "function") return;
    try {
      const response = await fetch("/api/events?codex_history_restore=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      const fromEvents = Array.isArray(payload.events) ? payload.events.map(item => historyRecordFromEvent(item)) : [];
      const fromActive = Array.isArray(payload.active) ? payload.active.map(item => historyRecordFromEvent({ ...item, event_type: "canceling", state: "취소진행시설", statusText: "취소진행시설", canclYn: "N", status: "N" }, "취소중")) : [];
      const merged = mergeHistoryRecords(loadStoredHistory(), readRowsAsHistory("#firstRows.history-grid", "history"), readRowsAsHistory("#activeRows", "active"), fromEvents, fromActive);
      if (merged.length) {
        saveStoredHistory(merged);
        renderStoredHistory(merged);
        applyRoomCapacityLabels();
      }
    } catch (_) {}
  }

  function syncPersistentHistory() {
    const stored = loadStoredHistory();
    const fromHistory = readRowsAsHistory("#firstRows.history-grid", "history");
    const fromActive = readRowsAsHistory("#activeRows", "active");
    const merged = mergeHistoryRecords(stored, fromHistory, fromActive);
    if (merged.length) {
      saveStoredHistory(merged);
      renderStoredHistory(merged);
      applyRoomCapacityLabels();
    }
  }

  function boot() { installStatusOverrides(); ensureLiveSummaryBox(); renderLiveSummary(); requestSummaryStatus(); applyLayoutTextCleanup(); fixRemainingStyle(); applyRoomCapacityLabels(); syncPersistentHistory(); syncHistoryFromServer(); setInterval(renderLiveSummary, 1000); setInterval(requestSummaryStatus, 5000); setInterval(fixRemainingStyle, 1000); setInterval(applyLayoutTextCleanup, 1000); setInterval(applyRoomCapacityLabels, 1000); setInterval(syncPersistentHistory, 3000); setInterval(syncHistoryFromServer, 10000); setTimeout(installStatusOverrides, 1000); setTimeout(fixRemainingStyle, 1200); setTimeout(applyRoomCapacityLabels, 1300); setTimeout(syncPersistentHistory, 1500); setTimeout(syncHistoryFromServer, 700); setTimeout(syncHistoryFromServer, 2500); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
</script>`;


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
  const merged = { ...previous, ...item };
  const combined = [merged.state, merged.status, merged.statusText, merged.status_text, merged.statusLabel, merged.status_label, merged.message, merged.event_type, merged.eventType].map(valueOfServer).filter(Boolean).join(" ");
  const resveAt = signalFlagServer(merged, "resveAt", "resve_at");
  const resveYn = signalFlagServer(merged, "resveYn", "resve_yn");
  const preocpcYn = signalFlagServer(merged, "preocpcYn", "preocpc_yn");
  const imprtyYn = signalFlagServer(merged, "imprtyYn", "imprty_yn");
  const canclYn = signalFlagServer(merged, "canclYn", "cancl_yn", "cancelYn", "cancel_yn") || (signalFlagServer(merged, "status") === "N" ? "N" : "");
  if ((merged._activeSignalMatch || merged.myActive || merged.mine || merged.isMine) && (preocpcYn === "Y" || /선점|preocpc|active/i.test(combined))) return "나의 선점 시설";
  if (/예약 *완료|예약완료|예약 *중|예약중|결제 *완료|결제완료|payment *complete|reserved/i.test(combined)) return "예약중";
  if (/예약 *마감|예약마감|예약 *불가|예약불가|예약 *불가능|마감|불가|closed|unavailable/i.test(combined)) return "예약마감시설";
  if (canclYn === "N") return "취소진행시설";
  if (resveAt === "Y" || resveYn === "Y" || preocpcYn === "Y" || imprtyYn === "N" || canclYn === "Y" || /available|예약 *가능|예약가능/i.test(combined)) return "예약가능시설";
  return "";
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
  const signal = signalStatusTextServer(item, previous);
  if (signal) return signal;
  const ended = combined.match(/종료\s*(?:→|->|-)?\s*([^,|]*)/);
  if (ended) {
    const tail = normalizeStatusPhraseServer(ended[1]);
    return tail && tail !== "발생" ? "종료 → " + tail : "종료";
  }
  const phrase = normalizeStatusPhraseServer((combined.match(/예약\s*완료|예약완료|선점\s*\/?\s*예약\s*중|선점\/예약중|선점중|선점|예약\s*중|예약중|예약\s*가능|예약가능|예약\s*마감|예약마감|발생/i) || [""])[0]);
  if (phrase && phrase !== "발생") return /available|예약|선점|Y/i.test(combined) ? "종료 → " + phrase : phrase;
  if (/canceling|취소|N/i.test(combined)) return "취소 진행중";
  return phrase || "발생";
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
    client: heartbeat.client || payload.client || heartbeat.source || payload.source || "state-signal"
  };
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


  state.heartbeat = {
    ...heartbeat,
    canceling_count: uniqueActive.length,
    canceling_items: uniqueActive.map(eventForState)
  };
  state.previousRefreshAt = state.lastRefreshAt;
  state.lastRefreshAt = heartbeat.received_at;
  state.lastReportAt = new Date().toISOString();
  state.monitor = {
    ...state.monitor,
    count: Number(heartbeat.count || state.monitor.count || 0),
    activeCount: uniqueActive.length,
    source: String(heartbeat.client || "state-signal")
  };
  monitorError = String(heartbeat.error || heartbeat.monitorError || heartbeat.message || "");


  if (Array.isArray(heartbeat.canceling_items) || Array.isArray(heartbeat.canceling) || Array.isArray(heartbeat.active) || Array.isArray(heartbeat.canceling_details)) {
    state.active = uniqueActive;
    saveActive();
  }
  if (uniqueActive.length > 0) upsertEvents(uniqueActive);
  return uniqueActive;
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

function parseReferenceDashboardHtml(html) {
  const raw = String(html || "");
  const receivedText = decodeHtmlText((raw.match(/<div class="info-label">\s*마지막\s*<\/div>\s*<div class="info-value">([\s\S]*?)<\/div>/) || [])[1]) || new Date().toISOString();
  const cancelingBlock = (raw.match(/id="cancelingNow"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || "";
  const rows = [];
  for (const match of cancelingBlock.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/g)) {
    const cells = Array.from(match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map(cell => decodeHtmlText(cell[1]));
    if (cells.length < 5) continue;
    rows.push({
      target_date: cells[0],
      date: cells[0],
      facility: cells[1],
      category: cells[1],
      room: cells[2],
      room_name: cells[2],
      detected: cells[3],
      time: cells[3],
      expected: cells[4],
      remain: cells[5] || "",
      status: "N",
      event_type: "canceling",
      state: "취소 진행중",
      statusText: "취소 진행중",
      message: [cells[0], cells[1], cells[2], "취소 진행중"].join(" ")
    });
  }
  return {
    heartbeat: {
      received_at: new Date().toISOString(),
      status: "running",
      client: "mangsang-dashboard-html",
      source_received_at: receivedText,
      canceling_count: rows.length,
      canceling_items: rows,
      available_count: 0,
      available_items: []
    }
  };
}

async function syncStateSignalFromHtml() {
  const pageUrl = "https://mangsang-alarm-dashboard.onrender.com/";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(pageUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "go-mangsang-dashboard-html-sync/1.0" }
    });
    clearTimeout(timer);
    if (!response.ok) return false;
    const html = await response.text();
    const payload = parseReferenceDashboardHtml(html);
    if (payload.heartbeat && Array.isArray(payload.heartbeat.canceling_items)) {
      handleHeartbeatPayload(payload);
      return true;
    }
  } catch (error) {
    try { clearTimeout(timer); } catch (_) {}
  }
  return false;
}


async function syncStateSignal() {
  if (hasFreshLocalReport()) return;
  if (!STATE_SIGNAL_URL || Date.now() - lastStateSyncAt < 5000) return;
  lastStateSyncAt = Date.now();
  let synced = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(STATE_SIGNAL_URL, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "go-mangsang-state-sync/1.0" }
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
  if (!synced || activeForView().length === 0) {
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
      state.active = allRequestsFailed ? [] : active;
      saveActive();
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
