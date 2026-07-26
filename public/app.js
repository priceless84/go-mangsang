const FACILITIES = ["든바다", "난바다", "허허바다", "자동차캠핑장"];
const REFRESH_MS = 5000;

const state = {
  selectedFacilities: new Set(FACILITIES),
  rows: {
    canceling: [],
    available: [],
    history: []
  },
  timer: null
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
  const start = lines.findIndex(line => normalizeLine(line) === startLabel);
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
  const history = parseHistorySection(rawLines);
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

function facilityMatch(row) {
  return state.selectedFacilities.has(row.facility);
}

function renderFacilityFilter() {
  els.facilityFilter.innerHTML = FACILITIES.map(facility => `
    <button type="button" class="${state.selectedFacilities.has(facility) ? "active" : ""}" data-facility="${facility}">
      ${facility}
    </button>
  `).join("");
  els.facilityText.textContent = [...state.selectedFacilities].join(", ") || "선택 없음";
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
      <td class="${row.type === "취소진행중" ? "type-cancel" : "type-available"}">${row.type}</td>
      <td class="${row.status.startsWith("종료") ? "state-end" : "state-live"}">${row.status}</td>
      <td>${row.date}</td>
      <td>${row.facility}</td>
      <td>${row.room}</td>
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

  els.cancelCount.textContent = `${cancelVisible}건`;
  els.availableCount.textContent = `${availableVisible}건`;
  els.cancelBadge.textContent = `${cancelVisible}건`;
  els.availableBadge.textContent = `${availableVisible}건`;
}

async function refresh() {
  els.nowTime.textContent = clock();
  try {
    const response = await fetch(`/api/reference?ts=${Date.now()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!payload.ok && !payload.text) throw new Error(payload.message || "조회 실패");
    render(parseDashboard(payload.text || ""));
  } catch (error) {
    els.watchState.textContent = "연결 확인 필요";
  }
}

function start() {
  renderFacilityFilter();
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
  if (!state.selectedFacilities.size) state.selectedFacilities.add(facility);
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
