const FACILITIES = ["든바다", "난바다", "허허바다", "자동차캠핑장"];
const REFRESH_MS = 5000;

const state = {
  canceling: [],
  available: [],
  history: [],
  selectedFacilities: new Set(FACILITIES),
  timer: null,
  clockTimer: null
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
  historyBody: document.querySelector("#historyBody")
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function clock(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function shortTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return clock(date);
}

function shortDate(value) {
  if (!value) return "-";
  const text = String(value);
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[2]}-${match[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text.replace(/^(\d{4})[-./]/, "");
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

function rangeSummary(range, dates) {
  if (Array.isArray(dates) && dates.length) {
    const sorted = [...dates].sort();
    const end = new Date(sorted[0]);
    end.setDate(end.getDate() + 29);
    return `${compactDate(sorted[0])}~${compactDate(end)}(30일)`;
  }

  const found = String(range || "").match(/\d{4}-\d{2}-\d{2}/g);
  if (found?.length) {
    const end = new Date(found[0]);
    end.setDate(end.getDate() + 29);
    return `${compactDate(found[0])}~${compactDate(end)}(30일)`;
  }
  return "-";
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

function compactStatus(value) {
  const text = String(value || "").replace(/\s+/g, "");
  if (text.includes("가능종료") || (text.includes("종료") && text.includes("예약가능"))) return "가능종료";
  if (text.includes("마감종료") || (text.includes("종료") && text.includes("예약마감"))) return "마감종료";
  if (text.includes("취소") && text.includes("진행")) return "진행중";
  if (text.includes("발생")) return "발생";
  return text || "-";
}

function typeLabel(value) {
  const text = String(value || "");
  if (text.includes("available") || text.includes("예약")) return "예약가능";
  if (text.includes("cancel")) return "취소중";
  return text || "-";
}

function statusLabel(heartbeat) {
  if (!heartbeat?.received_at) return "대기 중";
  const ageSec = (Date.now() - new Date(heartbeat.received_at).getTime()) / 1000;
  if (heartbeat.status === "stopped") return "중지";
  if (ageSec <= 180) return "감시 중";
  if (ageSec <= 600) return "지연";
  return "중지";
}

function remainText(expected) {
  if (!expected) return "-";
  const end = new Date(expected);
  const diff = end.getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return "만료";
  const totalMinutes = Math.ceil(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

function parseItem(item) {
  const detected = item.detected_at ? new Date(item.detected_at) : null;
  const expected = detected ? new Date(detected.getTime() + 2 * 60 * 60 * 1000) : null;
  return {
    date: shortDate(item.target_date),
    facility: normalizeFacilityName(item.facility),
    room: item.room || "",
    detected: shortTime(detected),
    expected: shortTime(expected),
    remaining: remainText(expected)
  };
}

function parseStatePayload(payload) {
  const hb = payload?.state?.heartbeat || null;
  const events = payload?.state?.events || [];
  const canceling = (hb?.canceling_items || []).map(parseItem);
  const available = (hb?.available_items || []).map(item => ({
    date: shortDate(item.target_date),
    facility: normalizeFacilityName(item.facility),
    room: item.room || "",
    status: "발생"
  }));
  const history = events.slice().reverse().slice(0, 120).map(event => ({
    detected: shortTime(event.received_at),
    date: shortDate(event.target_date),
    facility: normalizeFacilityName(event.facility),
    room: event.room || "",
    type: typeLabel(event.event_type),
    status: compactStatus(event.state)
  }));

  return {
    watchState: statusLabel(hb),
    last: localTime(hb?.received_at),
    range: rangeSummary(hb?.range, hb?.target_dates),
    facilities: Array.isArray(hb?.facilities) && hb.facilities.length
      ? hb.facilities.map(normalizeFacilityName)
      : FACILITIES,
    canceling,
    available,
    history
  };
}

function facilityMatch(row) {
  return state.selectedFacilities.has(normalizeFacilityName(row.facility));
}

function emptyRow(colspan, text) {
  return `<tr><td class="empty" colspan="${colspan}">${text}</td></tr>`;
}

function renderFacilityFilter(facilities = FACILITIES) {
  const normalized = facilities.map(normalizeFacilityName).filter(Boolean);
  const display = FACILITIES.filter(facility => normalized.includes(facility));
  const list = display.length ? display : FACILITIES;

  els.facilityFilter.innerHTML = list.map(facility => `
    <button type="button" class="${state.selectedFacilities.has(facility) ? "active" : ""}" data-facility="${facility}">
      ${facility}
    </button>
  `).join("");
  els.facilityText.textContent = list.join(", ");
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
      <td>${row.detected}</td>
      <td>${row.expected}</td>
      <td class="danger-text">${row.remaining}</td>
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
      <td>${row.detected}</td>
      <td>${row.date}</td>
      <td>${row.facility}</td>
      <td>${row.room}</td>
      <td class="${row.type === "취소중" ? "type-cancel" : "type-available"}">${row.type}</td>
      <td class="${row.status === "발생" || row.status === "진행중" ? "state-live" : "state-end"}">${row.status}</td>
    </tr>
  `).join("");
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
      <td class="state-live">${row.status}</td>
    </tr>
  `).join("");
  return filtered.length;
}

function render(data) {
  state.canceling = data.canceling;
  state.available = data.available;
  state.history = data.history;

  els.watchState.textContent = data.watchState;
  els.lastUpdate.textContent = data.last;
  els.watchRange.textContent = data.range;
  renderFacilityFilter(data.facilities);

  const cancelVisible = renderCancelRows(state.canceling);
  renderHistory(state.history);
  const availableVisible = renderAvailableRows(state.available);

  els.cancelCount.textContent = `${cancelVisible}건`;
  els.availableCount.textContent = `${availableVisible}건`;
  els.cancelBadge.textContent = `${cancelVisible}건`;
  els.availableBadge.textContent = `${availableVisible}건`;
}

async function refresh() {
  try {
    const response = await fetch(`/api/state?ts=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();
    render(parseStatePayload(payload));
  } catch {
    els.watchState.textContent = "연결 확인";
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

els.facilityFilter.addEventListener("click", event => {
  const button = event.target.closest("button[data-facility]");
  if (!button) return;
  const facility = button.dataset.facility;
  if (state.selectedFacilities.has(facility)) {
    state.selectedFacilities.delete(facility);
  } else {
    state.selectedFacilities.add(facility);
  }
  renderFacilityFilter();
  const cancelVisible = renderCancelRows(state.canceling);
  renderHistory(state.history);
  const availableVisible = renderAvailableRows(state.available);
  els.cancelCount.textContent = `${cancelVisible}건`;
  els.availableCount.textContent = `${availableVisible}건`;
  els.cancelBadge.textContent = `${cancelVisible}건`;
  els.availableBadge.textContent = `${availableVisible}건`;
});

start();
