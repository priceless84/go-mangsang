const FACILITIES = ["든바다", "난바다", "허허바다", "자동차캠핑장"];
const REFRESH_MS = 5000;
const DATA_SOURCES = [
  "/api/reference",
  "https://mangsang-alarm-dashboard.onrender.com/api/reference"
];

const state = {
  rows: {
    canceling: [],
    available: [],
    history: []
  },
  timer: null,
  clockTimer: null,
  selectedFacilities: new Set(FACILITIES)
};

const els = {
  watchState: document.querySelector("#watchState"),
  nowTime: document.querySelector("#nowTime"),
  cancelCount: document.querySelector("#cancelCount"),
  availableCount: document.querySelector("#availableCount"),
  lastUpdate: document.querySelector("#lastUpdate"),
  watchRange: document.querySelector("#watchRange"),
  facilityText: document.querySelector("#facilityText"),
  facilityFilter: document.querySelector("#facilityFilter"),
  cancelBadge: document.querySelector("#cancelBadge"),
  availableBadge: document.querySelector("#availableBadge"),
  historyBadge: document.querySelector("#historyBadge"),
  cancelBody: document.querySelector("#cancelBody"),
  availableBody: document.querySelector("#availableBody"),
  historyBody: document.querySelector("#historyBody"),
  referencePanel: document.querySelector("#referencePanel")
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function clock(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function shortDate(value) {
  if (!value) return "-";
  const text = String(value);
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[2]}-${match[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text.replace(/^(\d{4})[.-]\s*/, "");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function compactDate(value) {
  if (!value) return "-";
  const text = String(value);
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${Number(match[2])}/${Number(match[3])}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text.replace(/^0/, "").replace(/-0?/g, "/");
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function normalizeLine(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function countFromText(text, label) {
  const match = String(text || "").match(new RegExp(`${label}\\s*(\\d+)건`));
  return match ? Number(match[1]) : 0;
}

function valueAfter(lines, label) {
  const index = lines.findIndex(line => normalizeLine(line) === label);
  return index >= 0 ? normalizeLine(lines[index + 1]) : "-";
}

function parseTableRows(lines) {
  return lines
    .filter(line => line.includes("\t"))
    .map(line => line.split("\t").map(cell => normalizeLine(cell)).filter(Boolean));
}

function sectionLines(lines, startLabel, endLabel) {
  const start = lines.findIndex(line => normalizeLine(line).startsWith(startLabel));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && normalizeLine(line).startsWith(endLabel));
  return lines.slice(start + 1, end > start ? end : undefined);
}

function parseCancelingSection(lines) {
  return parseTableRows(sectionLines(lines, "현재 취소진행중", "현재 예약가능"))
    .filter(row => row[0] !== "날짜" && row.length >= 3)
    .map(row => ({
      date: row[0],
      facility: row[1],
      room: row[2],
      detected: row[3] || "-",
      expected: row[4] || "-",
      remaining: row[5] || "-",
      status: "발생"
    }));
}

function parseAvailableSection(lines) {
  return parseTableRows(sectionLines(lines, "현재 예약가능", "최근 이력"))
    .filter(row => row[0] !== "날짜" && row.length >= 3)
    .map(row => ({
      date: row[0],
      facility: row[1],
      room: row[2],
      status: row[3] || "발생"
    }));
}

function parseHistorySection(lines) {
  return parseTableRows(sectionLines(lines, "최근 이력", "__END__"))
    .filter(row => row[0] !== "시간" && row.length >= 6)
    .map(row => ({
      time: row[0],
      type: row[1],
      status: row[2],
      date: row[3],
      facility: row[4],
      room: row[5]
    }));
}

function parseDashboard(text) {
  const rawLines = String(text || "").split(/\n+/);
  const lines = rawLines.map(normalizeLine).filter(Boolean);
  const history = parseHistorySection(rawLines).map(row => ({
    ...row,
    time: historyTime(row.time),
    type: row.type === "취소진행중" ? "취소중" : row.type,
    status: compactStatus(row.status),
    date: shortDate(row.date)
  }));
  const watchState = valueAfter(lines, "감시 상태");

  return {
    watchState: watchState.includes("감시") ? watchState : "감시 중",
    last: valueAfter(lines, "마지막"),
    name: valueAfter(lines, "감시 이름"),
    range: valueAfter(lines, "감시 날짜"),
    facilities: valueAfter(lines, "시설"),
    cancelCount: countFromText(text, "취소진행중"),
    availableCount: countFromText(text, "예약가능"),
    canceling: parseCancelingSection(rawLines),
    available: parseAvailableSection(rawLines),
    history
  };
}

function statusLabel(heartbeat) {
  if (!heartbeat || !heartbeat.received_at) return "신호 없음";
  const ageSec = (Date.now() - new Date(heartbeat.received_at).getTime()) / 1000;
  if (heartbeat.status === "login_required") return "로그인 필요";
  if (heartbeat.status === "stopped" || heartbeat.status === "ended") return "중지됨";
  if (ageSec <= 300) return "감시 중";
  if (ageSec <= 900) return "지연";
  return "중지됨";
}

function localTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function historyTime(value) {
  if (!value) return "-";
  const korean = String(value).match(/(\d{1,2})시\s*(\d{1,2})분/);
  if (korean) return `${pad(korean[1])}:${pad(korean[2])}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shortTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function remainText(value) {
  if (!value) return "-";
  const end = new Date(value);
  const diff = end.getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return "만료";
  const totalMinutes = Math.ceil(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

function dateSummary(dates) {
  if (!Array.isArray(dates) || !dates.length) return "-";
  const sorted = [...dates].sort();
  if (sorted.length === 1) return compactDate(sorted[0]);
  const end = new Date(sorted[0]);
  end.setDate(end.getDate() + 29);
  return `${compactDate(sorted[0])}~${compactDate(end)}(30일)`;
}

function rangeSummary(value, dates) {
  const byDates = dateSummary(dates);
  if (byDates !== "-") return byDates;

  const text = String(value || "").trim();
  if (text) {
    const found = text.match(/\d{4}-\d{2}-\d{2}/g);
    if (found?.length >= 2) {
      const start = new Date(found[0]);
      const end = new Date(found[0]);
      end.setDate(end.getDate() + 29);
      const days = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
        ? ""
        : "(30일)";
      return `${compactDate(found[0])}~${compactDate(end)}${days}`;
    }
    if (found?.length === 1) return compactDate(found[0]);
    return text;
  }
  return "-";
}

function compactStatus(value) {
  const text = String(value || "").replace(/\s*→\s*/g, "→").replace(/\s+/g, "");
  if (text.includes("종료→예약가능")) return "가능종료";
  if (text.includes("종료→예약마감")) return "마감종료";
  if (text.includes("취소") && text.includes("진행")) return "진행중";
  return text;
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

function displayFacilities(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") return FACILITIES.join(", ");
  return text.split(",").map(normalizeFacilityName).filter(Boolean).join(", ") || FACILITIES.join(", ");
}

function parseStatePayload(payload) {
  const hb = payload?.state?.heartbeat || payload?.heartbeat || null;
  const stateData = payload?.state || payload || {};
  const canceling = (hb?.canceling_items || []).map(item => {
    const detected = item.detected_at ? new Date(item.detected_at) : null;
    const expected = detected ? new Date(detected.getTime() + 2 * 60 * 60 * 1000) : null;
    return {
      date: shortDate(item.target_date),
      facility: normalizeFacilityName(item.facility),
      room: item.room || "",
      detected: shortTime(detected),
      expected: shortTime(expected),
      remaining: remainText(expected),
      status: "발생"
    };
  });
  const available = (hb?.available_items || []).map(item => ({
    date: shortDate(item.target_date),
    facility: normalizeFacilityName(item.facility),
    room: item.room || "",
    status: "발생"
  }));
  const history = (stateData.events || []).slice().reverse().slice(0, 80).map(event => ({
    time: historyTime(event.received_at),
    type: event.event_type === "canceling" ? "취소중" : "예약가능",
    status: compactStatus(event.state),
    date: shortDate(event.target_date),
    facility: normalizeFacilityName(event.facility),
    room: event.room || ""
  }));

  return {
    watchState: statusLabel(hb),
    last: localTime(hb?.received_at),
    range: rangeSummary(hb?.range, hb?.target_dates),
    facilities: Array.isArray(hb?.facilities) ? hb.facilities.join(", ") : FACILITIES.join(", "),
    canceling,
    available,
    history
  };
}

function payloadScore(payload) {
  const hb = payload?.state?.heartbeat || payload?.heartbeat || null;
  const stateData = payload?.state || payload || {};
  const textData = payload?.text || "";
  const parsedText = textData ? parseDashboard(textData) : null;
  const canceling = hb?.canceling_items?.length || parsedText?.canceling?.length || parsedText?.cancelCount || 0;
  const available = hb?.available_items?.length || parsedText?.available?.length || parsedText?.availableCount || 0;
  const events = stateData.events?.length || parsedText?.history?.length || 0;
  const received = hb?.received_at ? new Date(hb.received_at).getTime() : 0;
  const liveRows = canceling + available;
  return liveRows * 1000000000 + events * 1000000 + Math.floor((Number.isFinite(received) ? received : 0) / 1000000000000);
}

async function loadPayload() {
  const results = await Promise.allSettled(DATA_SOURCES.map(async source => {
    const joiner = source.includes("?") ? "&" : "?";
    const response = await fetch(`${source}${joiner}ts=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!payload.ok && !payload.text && !payload.state) {
      throw new Error(payload.message || "조회 실패");
    }
    return payload;
  }));

  const payloads = results
    .filter(result => result.status === "fulfilled")
    .map(result => result.value);

  if (!payloads.length) {
    throw new Error("조회 실패");
  }

  return payloads.sort((a, b) => payloadScore(b) - payloadScore(a))[0];
}

function facilityMatch(row) {
  return state.selectedFacilities.has(normalizeFacilityName(row.facility));
}

function renderFacilityFilter() {
  if (!els.facilityFilter) return;
  els.facilityFilter.innerHTML = FACILITIES.map(facility => `
    <button type="button" class="${state.selectedFacilities.has(facility) ? "active" : ""}" data-facility="${facility}">
      ${facility}
    </button>
  `).join("");
  els.facilityText.textContent = FACILITIES.filter(facility => state.selectedFacilities.has(facility)).join(", ") || "선택 없음";
}

function emptyRow(colspan, text) {
  return `<tr><td class="empty" colspan="${colspan}">${text}</td></tr>`;
}

function renderCancelRows(rows) {
  const filtered = rows.filter(facilityMatch);
  if (!filtered.length) {
    els.cancelBody.innerHTML = emptyRow(6, "현재 취소진행중 없음");
    return 0;
  }
  els.cancelBody.innerHTML = filtered.map(row => `
    <tr>
      <td>${row.date}</td>
      <td>${row.facility}</td>
      <td>${row.room}</td>
      <td>${row.detected || "-"}</td>
      <td>${row.expected || "-"}</td>
      <td class="type-cancel">${row.remaining || "-"}</td>
    </tr>
  `).join("");
  return filtered.length;
}

function renderAvailableRows(rows) {
  const filtered = rows.filter(facilityMatch);
  if (!filtered.length) {
    els.availableBody.innerHTML = emptyRow(4, "현재 예약가능 없음");
    return 0;
  }
  els.availableBody.innerHTML = filtered.map(row => `
    <tr>
      <td>${row.date}</td>
      <td>${row.facility}</td>
      <td>${row.room}</td>
      <td class="${row.status === "발생" ? "state-live" : "state-end"}">${row.status}</td>
    </tr>
  `).join("");
  return filtered.length;
}

function renderHistory(rows) {
  const filtered = rows.filter(facilityMatch).slice(0, 80);
  els.historyBadge.textContent = `${filtered.length}건`;
  if (!filtered.length) {
    els.historyBody.innerHTML = emptyRow(6, "최근 이력이 없습니다");
    return;
  }
  els.historyBody.innerHTML = filtered.map(row => `
    <tr>
      <td>${row.time}</td>
      <td>${row.date}</td>
      <td>${row.facility}</td>
      <td>${row.room}</td>
      <td class="${row.type === "취소중" ? "type-cancel" : "type-available"}">${row.type}</td>
      <td class="${row.status.startsWith("종료") ? "state-end" : "state-live"}">${row.status}</td>
    </tr>
  `).join("");
}

function render(data) {
  state.rows.canceling = data.canceling;
  state.rows.available = data.available;
  state.rows.history = data.history;

  els.watchState.textContent = data.watchState || "감시 확인";
  els.lastUpdate.textContent = data.last || "-";
  els.watchRange.textContent = data.range || "-";

  const cancelVisible = renderCancelRows(state.rows.canceling);
  const availableVisible = renderAvailableRows(state.rows.available);
  renderHistory(state.rows.history);

  if (els.referencePanel) {
    els.referencePanel.hidden = cancelVisible + availableVisible > 0;
  }

  els.cancelCount.textContent = `${cancelVisible}건`;
  els.availableCount.textContent = `${availableVisible}건`;
  els.cancelBadge.textContent = `${cancelVisible}건`;
  els.availableBadge.textContent = `${availableVisible}건`;
}

async function refresh() {
  try {
    const payload = await loadPayload();
    const parsedText = payload.text ? parseDashboard(payload.text) : null;
    if (parsedText && (parsedText.canceling.length || parsedText.available.length || parsedText.history.length)) {
      render(parsedText);
    } else {
      render(payload.state ? parseStatePayload(payload) : parseDashboard(payload.text || ""));
    }
  } catch (error) {
    els.watchState.textContent = "연결 확인 필요";
  }
}

function updateNowTime() {
  els.nowTime.textContent = clock();
}

function start() {
  renderFacilityFilter();
  updateNowTime();
  state.clockTimer = setInterval(updateNowTime, 1000);
  refresh();
  state.timer = setInterval(refresh, REFRESH_MS);
}

els.facilityFilter?.addEventListener("click", event => {
  const button = event.target.closest("button[data-facility]");
  if (!button) return;
  const facility = button.dataset.facility;
  if (state.selectedFacilities.has(facility)) {
    state.selectedFacilities.delete(facility);
  } else {
    state.selectedFacilities.add(facility);
  }
  renderFacilityFilter();
  render({
    watchState: els.watchState.textContent,
    last: els.lastUpdate.textContent,
    range: els.watchRange.textContent,
    canceling: state.rows.canceling,
    available: state.rows.available,
    history: state.rows.history
  });
});

start();
