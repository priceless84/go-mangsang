const state = {
  timer: null,
  countdownTimer: null,
  isPolling: false,
  isFetching: false,
  nextAt: null,
  currentCanceling: [],
  currentAvailable: [],
  currentEvents: [],
  cancelDetectionHistory: [],
  lastNonEmptyCanceling: [],
  lastNonEmptyCancelingAt: 0,
  cancelProgressSignature: "",
  availableSignature: "",
  eventsSignature: "",
  detailsSignature: "",
  detectedAt: new Map(),
  rows: [],
  canManage: false
};

const CANCEL_DETECTION_HISTORY_KEY = "camping-monitor-cancel-detection-history";
const CANCEL_DETECTION_HISTORY_LIMIT = 300;
const CANCEL_EMPTY_GRACE_MS = 15000;

const els = {
  startDate: document.querySelector("#startDate"),
  endDate: document.querySelector("#endDate"),
  sessionCookie: document.querySelector("#sessionCookie"),
  intervalSec: document.querySelector("#intervalSec"),
  runOnce: document.querySelector("#runOnce"),
  startPoll: document.querySelector("#startPoll"),
  stopPoll: document.querySelector("#stopPoll"),
  runState: document.querySelector("#runState"),
  openSettings: document.querySelector("#openSettings"),
  openNotifications: document.querySelector("#openNotifications"),
  settingsModal: document.querySelector("#settingsModal"),
  notificationModal: document.querySelector("#notificationModal"),
  overviewStart: document.querySelector("#overviewStart"),
  overviewEnd: document.querySelector("#overviewEnd"),
  overviewInterval: document.querySelector("#overviewInterval"),
  overviewFacilities: document.querySelector("#overviewFacilities"),
  overviewPolling: document.querySelector("#overviewPolling"),
  lastChecked: document.querySelector("#lastChecked"),
  cancelCount: document.querySelector("#cancelCount"),
  availableCount: document.querySelector("#availableCount"),
  nextTick: document.querySelector("#nextTick"),
  loadingBar: document.querySelector("#loadingBar"),
  heartbeatStatus: document.querySelector("#heartbeatStatus"),
  heartbeatAt: document.querySelector("#heartbeatAt"),
  heartbeatClient: document.querySelector("#heartbeatClient"),
  heartbeatRange: document.querySelector("#heartbeatRange"),
  heartbeatFacilities: document.querySelector("#heartbeatFacilities"),
  heartbeatMessage: document.querySelector("#heartbeatMessage"),
  cancelSubText: document.querySelector("#cancelSubText"),
  availableSubText: document.querySelector("#availableSubText"),
  cancelFacilityFilter: document.querySelector("#cancelFacilityFilter"),
  cancelCapacityFilter: document.querySelector("#cancelCapacityFilter"),
  cancelRoomFilter: document.querySelector("#cancelRoomFilter"),
  availableFacilityFilter: document.querySelector("#availableFacilityFilter"),
  availableCapacityFilter: document.querySelector("#availableCapacityFilter"),
  availableRoomFilter: document.querySelector("#availableRoomFilter"),
  cancelBody: document.querySelector("#cancelBody"),
  availableBody: document.querySelector("#availableBody"),
  eventBody: document.querySelector("#eventBody"),
  resultBody: document.querySelector("#resultBody"),
  eventSort: document.querySelector("#eventSort"),
  eventTypeFilter: document.querySelector("#eventTypeFilter"),
  eventFacilityFilter: document.querySelector("#eventFacilityFilter"),
  eventCapacityFilter: document.querySelector("#eventCapacityFilter"),
  eventRoomFilter: document.querySelector("#eventRoomFilter"),
  detailSort: document.querySelector("#detailSort"),
  detailFacilityFilter: document.querySelector("#detailFacilityFilter"),
  detailStatusFilter: document.querySelector("#detailStatusFilter"),
  detailCapacityFilter: document.querySelector("#detailCapacityFilter"),
  detailRoomFilter: document.querySelector("#detailRoomFilter"),
  clearLog: document.querySelector("#clearLog"),
  clearCancel: document.querySelector("#clearCancel"),
  clearAvailable: document.querySelector("#clearAvailable"),
  clearDetails: document.querySelector("#clearDetails"),
  notifyEnabled: document.querySelector("#notifyEnabled"),
  notificationSets: document.querySelector("#notificationSets"),
  addNotificationSet: document.querySelector("#addNotificationSet"),
  saveNotify: document.querySelector("#saveNotify"),
  testMail: document.querySelector("#testMail"),
  notifyMessage: document.querySelector("#notifyMessage")
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseServerDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const normalized = text
    .replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3T$4:$5:$6")
    .replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")
    .replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = value instanceof Date ? value : parseServerDate(value);
  if (!date) return "-";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatClock(value = new Date()) {
  const date = value instanceof Date ? value : parseServerDate(value);
  if (!date) return "-";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateTime(value) {
  const date = parseServerDate(value);
  if (!date) return value || "-";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function updateSummaryClock() {
  els.lastChecked.textContent = formatClock(new Date());
}

function formatRemaining(expectedAt) {
  const expectedDate = parseServerDate(expectedAt);
  if (!expectedDate) return "-";

  const diffMs = expectedDate.getTime() - Date.now();
  if (diffMs <= 0) return "만료";

  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function isRemainingSoon(expectedAt) {
  const expectedDate = parseServerDate(expectedAt);
  if (!expectedDate) return false;
  const diffMs = expectedDate.getTime() - Date.now();
  return diffMs > 0 && diffMs < 30 * 60 * 1000;
}

function updateRemainingCells() {
  document.querySelectorAll(".remaining-cell[data-expected-at]").forEach(cell => {
    const expectedAt = cell.dataset.expectedAt || "";
    if (cell.dataset.live === "1") {
      cell.textContent = formatRemaining(expectedAt);
    }
    cell.classList.toggle("remaining-soon", isRemainingSoon(expectedAt));
  });
}

function displayRoom(row) {
  return row.room || row.roomName || row.room_name || row.roomCode || "-";
}

function roomOnly(row) {
  const value = row.roomName || row.room_name || row.room || row.roomCode || "-";
  return String(value).replace(/\([^)]*\)\s*$/, "").trim() || "-";
}

function roomCapacity(row) {
  if (row.capacity) return String(row.capacity);
  const match = String(row.room || "").match(/\(([^)]+)\)\s*$/);
  return match?.[1] || (row.facility === "자동차캠핑장" ? "사이트" : "-");
}

function rowKey(row) {
  return row.key || `${row.date}|${row.facility}|${row.roomCode || displayRoom(row)}`;
}

function cancelDetectionKey(item) {
  return [
    item.date || item.target_date || "",
    item.facility || "",
    item.roomCode || item.room_code || displayRoom(item)
  ].join("|");
}

function loadCancelDetectionHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(CANCEL_DETECTION_HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCancelDetectionHistory() {
  localStorage.setItem(
    CANCEL_DETECTION_HISTORY_KEY,
    JSON.stringify(state.cancelDetectionHistory.slice(0, CANCEL_DETECTION_HISTORY_LIMIT))
  );
}

function normalizeCancelDetection(item, fallbackState = "최초감지") {
  return {
    client: item.client || "campingkorea-node",
    eventType: "canceling",
    event_type: "canceling",
    state: item.state || fallbackState,
    date: item.date || item.target_date || "",
    target_date: item.target_date || item.date || "",
    facility: item.facility || "",
    room: item.room || displayRoom(item),
    roomName: item.roomName || item.room_name || roomOnly(item),
    room_name: item.room_name || item.roomName || roomOnly(item),
    roomCode: item.roomCode || item.room_code || "",
    capacity: item.capacity || roomCapacity(item),
    receivedAt: item.receivedAt || item.received_at || getDetectedAt(item),
    received_at: item.received_at || item.receivedAt || getDetectedAt(item),
    message: item.message || `${item.date || item.target_date || "-"} ${item.facility || "-"} ${displayRoom(item)} 취소시설 최초감지`
  };
}

function rememberCancelDetections(items, fallbackState) {
  const seen = new Set(state.cancelDetectionHistory.map(cancelDetectionKey));
  let changed = false;

  for (const item of items || []) {
    const normalized = normalizeCancelDetection(item, fallbackState);
    const key = cancelDetectionKey(normalized);
    if (!normalized.date || !normalized.facility || seen.has(key)) continue;
    seen.add(key);
    state.cancelDetectionHistory.unshift(normalized);
    changed = true;
  }

  if (changed) {
    state.cancelDetectionHistory = sortEvents(state.cancelDetectionHistory).slice(0, CANCEL_DETECTION_HISTORY_LIMIT);
    saveCancelDetectionHistory();
  }
}

function isCancelDetectionEvent(event) {
  const type = event.eventType || event.event_type;
  const stateText = `${event.state || ""} ${event.message || ""}`;
  return type === "canceling" && (stateText.includes("발생") || stateText.includes("최초"));
}

function statusClass(row) {
  return row.statusCode || "unknown";
}

function isAvailable(row) {
  return row.statusCode === "bookable"
    || row.bookable === true
    || (
      row.resveAt === "Y"
      && row.preocpcYn === "Y"
      && row.imprtyYn === "N"
      && row.canclYn === "Y"
      && row.resveYn === "Y"
    );
}

function isCanceling(row) {
  return row.statusCode === "cancelBlocked"
    || row.canclYn === "N";
}

function getDetectedAt(row) {
  const fromData = row.detectedAt || row.preocpcBeginDt;
  if (fromData && parseServerDate(fromData)) return fromData;

  const key = rowKey(row);
  if (!state.detectedAt.has(key)) {
    state.detectedAt.set(key, new Date().toISOString());
  }
  return state.detectedAt.get(key);
}

function getExpectedAt(row) {
  const fromData = row.expectedAt || row.preocpcEndDt;
  if (fromData && parseServerDate(fromData)) return fromData;

  const detected = parseServerDate(getDetectedAt(row));
  if (!detected) return "";
  return new Date(detected.getTime() + 2 * 60 * 60 * 1000).toISOString();
}

function typeLabel(type) {
  if (type === "available") return "예약가능";
  if (type === "canceling") return "취소진행중";
  return type || "-";
}

function setDefaults() {
  const saved = JSON.parse(localStorage.getItem("camping-monitor-node-settings") || "{}");
  const today = new Date();
  const defaultStart = new Date(today);
  const defaultEnd = new Date(today);
  defaultEnd.setDate(defaultEnd.getDate() + 6);

  els.startDate.value = saved.startDate || formatDate(defaultStart);
  els.endDate.value = saved.endDate || formatDate(defaultEnd);
  els.sessionCookie.value = saved.sessionCookie || "";
  els.intervalSec.value = saved.intervalSec || 60;

  if (Array.isArray(saved.facilities)) {
    document.querySelectorAll("input[name='facility']").forEach(input => {
      input.checked = saved.facilities.includes(input.value);
    });
  }
}

function getSettings() {
  const facilities = [...document.querySelectorAll("input[name='facility']:checked")].map(input => input.value);
  return {
    startDate: els.startDate.value,
    endDate: els.endDate.value,
    stayNights: 1,
    sessionCookie: els.sessionCookie.value.trim(),
    intervalSec: Math.max(20, Number(els.intervalSec.value || 60)),
    facilities
  };
}

function saveSettings() {
  localStorage.setItem("camping-monitor-node-settings", JSON.stringify(getSettings()));
  updateOverview();
}

function applyServerSettings(settings) {
  if (!settings) return;
  if (settings.startDate) els.startDate.value = settings.startDate;
  if (settings.endDate) els.endDate.value = settings.endDate;
  if (settings.intervalSec) els.intervalSec.value = settings.intervalSec;

  if (Array.isArray(settings.facilities)) {
    document.querySelectorAll("input[name='facility']").forEach(input => {
      input.checked = settings.facilities.includes(input.value);
    });
  }

  if (settings.sessionCookieConfigured && !els.sessionCookie.value.trim()) {
    els.sessionCookie.placeholder = "서버에 로그인 Cookie가 설정되어 있습니다. 보안상 내용은 표시하지 않습니다.";
  }

  const saved = JSON.parse(localStorage.getItem("camping-monitor-node-settings") || "{}");
  localStorage.setItem("camping-monitor-node-settings", JSON.stringify({
    ...saved,
    startDate: els.startDate.value,
    endDate: els.endDate.value,
    intervalSec: Number(els.intervalSec.value || 60),
    facilities: [...document.querySelectorAll("input[name='facility']:checked")].map(input => input.value)
  }));
  updateOverview();
}

function updateOverview() {
  const settings = getSettings();
  els.overviewStart.textContent = settings.startDate || "-";
  els.overviewEnd.textContent = settings.endDate || "-";
  els.overviewInterval.textContent = settings.intervalSec ? `${settings.intervalSec}초` : "-";
  els.overviewFacilities.textContent = settings.facilities.join(", ") || "-";
  els.overviewPolling.textContent = state.isPolling ? "폴링 중" : "폴링 정지";
}

function openModal(modal) {
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal(modal) {
  modal.hidden = true;
  if (!document.querySelector(".modal-layer:not([hidden])")) document.body.classList.remove("modal-open");
}

function setLoading(active) {
  els.loadingBar.classList.toggle("active", active);
  els.runOnce.disabled = active || state.isPolling;
}

function setRunState(text) {
  els.runState.textContent = text;
}

function applyManagementAccess(allowed) {
  state.canManage = Boolean(allowed);
  els.openSettings.hidden = !state.canManage;
  els.openNotifications.hidden = !state.canManage;
  if (!state.canManage) {
    closeModal(els.settingsModal);
    closeModal(els.notificationModal);
  }
}

function renderHeartbeat(data) {
  const heartbeat = data.heartbeat || {};
  const status = heartbeat.status || (data.ok ? "running" : "error");

  els.heartbeatStatus.textContent = status === "running" ? "감시 중" : status;
  els.heartbeatStatus.className = `state-badge ${status}`;
  els.heartbeatAt.textContent = heartbeat.receivedAt || data.generatedAt || "-";
  els.heartbeatClient.textContent = heartbeat.client || "-";
  els.heartbeatRange.textContent = `${data.start || heartbeat.start || "-"} ~ ${data.end || heartbeat.end || "-"}`;
  els.heartbeatFacilities.textContent = heartbeat.facilities || data.facilities || "-";
  els.heartbeatMessage.textContent = heartbeat.message || "-";
}

function syncFacilityFilter(select, rows) {
  if (!select) return;

  const selected = select.value;
  const facilities = [...new Set(rows.map(row => row.facility).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko"));

  select.innerHTML = `<option value="">전체 시설</option>`;
  for (const facility of facilities) {
    const option = document.createElement("option");
    option.value = facility;
    option.textContent = facility;
    select.append(option);
  }

  select.value = facilities.includes(selected) ? selected : "";
}

function syncSelectOptions(select, values, allLabel) {
  if (!select) return;

  const selected = select.value;
  const options = [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));

  select.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>`;
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }

  select.value = options.includes(selected) ? selected : "";
}

function filterRows(rows, facilitySelect, capacitySelect, roomSelect) {
  const facility = facilitySelect?.value || "";
  const capacity = capacitySelect?.value || "";
  const room = roomSelect?.value || "";
  return rows.filter(row => {
    if (facility && row.facility !== facility) return false;
    if (capacity && roomCapacity(row) !== capacity) return false;
    if (room && roomOnly(row) !== room) return false;
    return true;
  });
}

function syncPanelFilters(rows, facilitySelect, capacitySelect, roomSelect) {
  syncFacilityFilter(facilitySelect, rows);
  syncSelectOptions(capacitySelect, rows.map(roomCapacity), "전체");
  const facility = facilitySelect?.value || "";
  const roomRows = facility ? rows.filter(row => row.facility === facility) : rows;
  syncSelectOptions(roomSelect, roomRows.map(roomOnly), "전체");
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "ko", { numeric: true });
}

function compareDateText(a, b) {
  const ad = parseServerDate(a);
  const bd = parseServerDate(b);
  const av = ad ? ad.getTime() : 0;
  const bv = bd ? bd.getTime() : 0;
  return av - bv;
}

function eventTime(event) {
  return event.receivedAt || event.received_at || "";
}

function eventDate(event) {
  return event.date || event.target_date || "";
}

function sortEvents(events) {
  const sortValue = els.eventSort?.value || "timeDesc";
  return [...events].sort((a, b) => {
    if (sortValue === "timeAsc") return compareDateText(eventTime(a), eventTime(b));
    if (sortValue === "dateAsc") {
      return compareText(eventDate(a), eventDate(b))
        || compareText(a.facility, b.facility)
        || compareText(displayRoom(a), displayRoom(b));
    }
    if (sortValue === "dateDesc") {
      return compareText(eventDate(b), eventDate(a))
        || compareText(a.facility, b.facility)
        || compareText(displayRoom(a), displayRoom(b));
    }
    if (sortValue === "facilityAsc") {
      return compareText(a.facility, b.facility)
        || compareText(eventDate(a), eventDate(b))
        || compareText(displayRoom(a), displayRoom(b));
    }
    if (sortValue === "roomAsc") {
      return compareText(displayRoom(a), displayRoom(b))
        || compareText(eventDate(a), eventDate(b))
        || compareText(a.facility, b.facility);
    }
    if (sortValue === "typeAsc") {
      return compareText(typeLabel(a.eventType || a.event_type), typeLabel(b.eventType || b.event_type))
        || compareDateText(eventTime(b), eventTime(a));
    }
    return compareDateText(eventTime(b), eventTime(a));
  });
}

function filterEvents(events) {
  const type = els.eventTypeFilter?.value || "";
  return filterRows(events, els.eventFacilityFilter, els.eventCapacityFilter, els.eventRoomFilter).filter(event => {
    const eventType = typeLabel(event.eventType || event.event_type);
    if (type && eventType !== type) return false;
    return true;
  });
}

function sortDetailRows(rows) {
  const sortValue = els.detailSort?.value || "dateAsc";
  return [...rows].sort((a, b) => {
    if (sortValue === "dateDesc") {
      return compareText(b.date, a.date)
        || compareText(a.facility, b.facility)
        || compareText(displayRoom(a), displayRoom(b));
    }
    if (sortValue === "facilityAsc") {
      return compareText(a.facility, b.facility)
        || compareText(a.date, b.date)
        || compareText(displayRoom(a), displayRoom(b));
    }
    if (sortValue === "roomAsc") {
      return compareText(displayRoom(a), displayRoom(b))
        || compareText(a.date, b.date)
        || compareText(a.facility, b.facility);
    }
    if (sortValue === "statusAsc") {
      return compareText(a.statusName, b.statusName)
        || compareText(a.date, b.date)
        || compareText(a.facility, b.facility)
        || compareText(displayRoom(a), displayRoom(b));
    }
    return compareText(a.date, b.date)
      || compareText(a.facility, b.facility)
      || compareText(displayRoom(a), displayRoom(b));
  });
}

function filterDetailRows(rows) {
  const status = els.detailStatusFilter?.value || "";
  return filterRows(rows, els.detailFacilityFilter, els.detailCapacityFilter, els.detailRoomFilter).filter(row => {
    if (status && (row.statusName || "") !== status) return false;
    return true;
  });
}

function renderCancelProgress(rows) {
  const filteredRows = filterRows(rows, els.cancelFacilityFilter, els.cancelCapacityFilter, els.cancelRoomFilter);
  els.cancelSubText.textContent = `${filteredRows.length}건`;

  if (!filteredRows.length) {
    const emptyHtml = `<tr><td colspan="7" class="empty-cell">현재 취소진행중 없음</td></tr>`;
    if (state.cancelProgressSignature !== "empty") {
      els.cancelBody.innerHTML = emptyHtml;
      state.cancelProgressSignature = "empty";
    }
    return;
  }

  const rowViews = filteredRows.map(row => {
    const detectedAt = getDetectedAt(row);
    const expectedAt = getExpectedAt(row);
    const remaining = row.canclWaitTimeNm || formatRemaining(expectedAt);
    return { row, detectedAt, expectedAt, remaining };
  });
  const signature = rowViews.map(({ row, detectedAt, expectedAt, remaining }) => {
    return [
      row.date,
      row.facility,
      roomCapacity(row),
      roomOnly(row),
      formatTime(detectedAt),
      formatTime(expectedAt),
      row.canclWaitTimeNm ? remaining : expectedAt
    ].join("|");
  }).join("||");

  if (state.cancelProgressSignature === signature) {
    updateRemainingCells();
    return;
  }

  const html = rowViews.map(({ row, detectedAt, expectedAt, remaining }) => {
    return `
      <tr class="cancel-progress-row">
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.facility)}</td>
      <td>${escapeHtml(roomCapacity(row))}</td>
      <td>${escapeHtml(roomOnly(row))}</td>
      <td>${escapeHtml(formatTime(detectedAt))}</td>
      <td>${escapeHtml(formatTime(expectedAt))}</td>
      <td class="remaining-cell" data-live="${row.canclWaitTimeNm ? "0" : "1"}" data-expected-at="${escapeHtml(expectedAt)}">${escapeHtml(remaining)}</td>
      </tr>
    `;
  }).join("");

  els.cancelBody.innerHTML = html;
  state.cancelProgressSignature = signature;
  updateRemainingCells();
}

function renderAvailable(rows) {
  const filteredRows = filterRows(rows, els.availableFacilityFilter, els.availableCapacityFilter, els.availableRoomFilter);
  els.availableSubText.textContent = `${filteredRows.length}건`;

  if (!filteredRows.length) {
    const emptyHtml = `<tr><td colspan="5" class="empty-cell">현재 예약가능 없음</td></tr>`;
    if (state.availableSignature !== "empty") {
      els.availableBody.innerHTML = emptyHtml;
      state.availableSignature = "empty";
    }
    return;
  }

  const signature = filteredRows.map(row => [
    row.date,
    row.facility,
    roomCapacity(row),
    roomOnly(row),
    row.statusName || ""
  ].join("|")).join("||");
  if (state.availableSignature === signature) return;

  els.availableBody.innerHTML = filteredRows.map(row => `
    <tr class="room-bookable">
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.facility)}</td>
      <td>${escapeHtml(roomCapacity(row))}</td>
      <td>${escapeHtml(roomOnly(row))}</td>
      <td><span class="badge bookable">${escapeHtml(row.statusName || "예약 가능")}</span></td>
    </tr>
  `).join("");
  state.availableSignature = signature;
}

function makeSnapshotEvents(cancelingRows, availableRows) {
  const items = [];
  for (const row of cancelingRows) {
    items.push({
      eventType: "canceling",
      state: "현재",
      date: row.date,
      facility: row.facility,
      room: displayRoom(row),
      roomName: roomOnly(row),
      capacity: roomCapacity(row),
      receivedAt: getDetectedAt(row),
      message: `${row.date} ${row.facility} ${displayRoom(row)} 현재 취소진행중`
    });
  }
  for (const row of availableRows) {
    items.push({
      eventType: "available",
      state: "현재",
      date: row.date,
      facility: row.facility,
      room: displayRoom(row),
      roomName: roomOnly(row),
      capacity: roomCapacity(row),
      receivedAt: row.detectedAt || new Date().toISOString(),
      message: `${row.date} ${row.facility} ${displayRoom(row)} 현재 예약가능`
    });
  }
  return items;
}

function renderEvents(events, cancelingRows, availableRows) {
  const displayEvents = sortEvents(filterEvents(events || []));

  if (!displayEvents.length) {
    const emptyHtml = `<tr><td colspan="8" class="empty-cell">최근 이력이 없습니다.</td></tr>`;
    if (state.eventsSignature !== "empty") {
      els.eventBody.innerHTML = emptyHtml;
      state.eventsSignature = "empty";
    }
    return;
  }

  const visibleEvents = displayEvents.slice(0, 80);
  const signature = visibleEvents.map(event => [
    event.receivedAt || event.received_at,
    event.eventType || event.event_type || "",
    event.state || "",
    event.date || event.target_date || "",
    event.facility || "",
    roomCapacity(event),
    roomOnly(event),
    event.message || ""
  ].join("|")).join("||");
  if (state.eventsSignature === signature) return;

  els.eventBody.innerHTML = visibleEvents.map(event => {
    const type = event.eventType || event.event_type || "";
    return `
      <tr>
      <td>${escapeHtml(formatDateTime(event.receivedAt || event.received_at))}</td>
      <td><span class="type ${escapeHtml(type)}">${escapeHtml(typeLabel(type))}</span></td>
      <td>${escapeHtml(event.state || "-")}</td>
      <td>${escapeHtml(event.date || event.target_date || "-")}</td>
      <td>${escapeHtml(event.facility || "-")}</td>
      <td>${escapeHtml(roomCapacity(event))}</td>
      <td>${escapeHtml(roomOnly(event))}</td>
      <td>${escapeHtml(event.message || "")}</td>
      </tr>
    `;
  }).join("");
  state.eventsSignature = signature;
}

function renderDetails() {
  const rows = sortDetailRows(filterDetailRows(state.rows).filter(row => {
    if (row.statusCode === "reserved" || row.statusName === "예약 마감") return false;
    return true;
  }));

  if (!rows.length) {
    const emptyHtml = `<tr><td colspan="7" class="empty-cell">조회 결과가 없습니다.</td></tr>`;
    if (state.detailsSignature !== "empty") {
      els.resultBody.innerHTML = emptyHtml;
      state.detailsSignature = "empty";
    }
    return;
  }

  const signature = rows.map(row => [
    row.date,
    row.checkoutDate || "",
    row.facility,
    roomCapacity(row),
    roomOnly(row),
    row.statusName || "",
    renderFlags(row)
  ].join("|")).join("||");
  if (state.detailsSignature === signature) return;

  els.resultBody.innerHTML = rows.map(row => `
    <tr class="room-${statusClass(row)}">
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.checkoutDate || "")}</td>
      <td>${escapeHtml(row.facility)}</td>
      <td>${escapeHtml(roomCapacity(row))}</td>
      <td>${escapeHtml(roomOnly(row))}</td>
      <td><span class="badge ${escapeHtml(statusClass(row))}">${escapeHtml(row.statusName || "상태 확인 필요")}</span></td>
      <td class="flags">${escapeHtml(renderFlags(row))}</td>
    </tr>
  `).join("");
  state.detailsSignature = signature;
}

function renderFlags(row) {
  return [
    `예약:${row.resveAt || "-"}`,
    `선점:${row.preocpcYn || "-"}`,
    `불가:${row.imprtyYn || "-"}`,
    `취소:${row.canclYn || "-"}`,
    `운영:${row.resveYn || "-"}`
  ].join(" / ");
}

function sortDashboardRows(rows) {
  return [...rows].sort((a, b) => {
    return (a.date || "").localeCompare(b.date || "")
      || (a.facility || "").localeCompare(b.facility || "")
      || displayRoom(a).localeCompare(displayRoom(b), "ko");
  });
}

function mergeByKey(primaryRows, fallbackRows) {
  const map = new Map();
  for (const row of primaryRows || []) {
    map.set(row.key || `${row.date}|${row.facility}|${row.roomCode || displayRoom(row)}`, row);
  }
  for (const row of fallbackRows || []) {
    const key = row.key || `${row.date}|${row.facility}|${row.roomCode || displayRoom(row)}`;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

function selectedFacilities() {
  return [...document.querySelectorAll("input[name='facility']:checked")].map(input => input.value);
}

function stabilizeCancelingRows(rows) {
  const now = Date.now();
  if (rows.length) {
    state.lastNonEmptyCanceling = rows;
    state.lastNonEmptyCancelingAt = now;
    return rows;
  }

  const selected = new Set(selectedFacilities());
  const fallbackRows = state.lastNonEmptyCanceling.filter(row => {
    return !selected.size || selected.has(row.facility);
  });
  const isRecent = now - state.lastNonEmptyCancelingAt <= CANCEL_EMPTY_GRACE_MS;

  if (fallbackRows.length && isRecent) return fallbackRows;

  state.lastNonEmptyCanceling = [];
  state.lastNonEmptyCancelingAt = 0;
  return rows;
}

function render(data) {
  const rows = sortDashboardRows(data.visibleRows || data.rows || []);
  const hasServerCanceling = Object.prototype.hasOwnProperty.call(data, "currentCanceling");
  const hasServerAvailable = Object.prototype.hasOwnProperty.call(data, "currentAvailable");
  const cancelingRows = stabilizeCancelingRows(sortDashboardRows(
    hasServerCanceling ? (data.currentCanceling || []) : rows.filter(isCanceling)
  ));
  const availableRows = sortDashboardRows(
    hasServerAvailable ? (data.currentAvailable || []) : rows.filter(isAvailable)
  );

  const serverEvents = Array.isArray(data.events) ? data.events : [];
  rememberCancelDetections(serverEvents.filter(isCancelDetectionEvent), "발생");
  rememberCancelDetections(cancelingRows, "최초감지");

  state.rows = rows;
  state.currentCanceling = cancelingRows;
  state.currentAvailable = availableRows;
  state.currentEvents = serverEvents.length ? serverEvents : state.cancelDetectionHistory;

  updateSummaryClock();
  els.cancelCount.textContent = cancelingRows.length;
  els.availableCount.textContent = formatClock(data.generatedAt || data.heartbeat?.receivedAt || new Date());

  renderHeartbeat(data);
  syncPanelFilters(cancelingRows, els.cancelFacilityFilter, els.cancelCapacityFilter, els.cancelRoomFilter);
  syncPanelFilters(availableRows, els.availableFacilityFilter, els.availableCapacityFilter, els.availableRoomFilter);
  const eventSource = state.currentEvents;
  syncSelectOptions(els.eventTypeFilter, eventSource.map(event => typeLabel(event.eventType || event.event_type)), "전체 종류");
  syncPanelFilters(eventSource, els.eventFacilityFilter, els.eventCapacityFilter, els.eventRoomFilter);
  syncPanelFilters(rows, els.detailFacilityFilter, els.detailCapacityFilter, els.detailRoomFilter);
  syncSelectOptions(els.detailStatusFilter, rows.map(row => row.statusName || "상태 확인 필요"), "전체 상태");
  renderCancelProgress(cancelingRows);
  renderAvailable(availableRows);
  renderEvents(state.currentEvents, cancelingRows, availableRows);
  renderDetails();
  updateOverview();

  for (const error of data.errors || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(new Date().toLocaleString("ko-KR"))}</td>
      <td><span class="type error">오류</span></td>
      <td>-</td>
      <td>${escapeHtml(error.date || "-")}</td>
      <td>${escapeHtml(error.facility || "-")}</td>
      <td>-</td>
      <td>-</td>
      <td>${escapeHtml(error.message || "")}</td>
    `;
    els.eventBody.prepend(tr);
  }
}

async function fetchStatus() {
  if (state.isFetching) {
    return false;
  }

  const settings = getSettings();
  if (!settings.startDate || !settings.endDate) {
    throw new Error("시작일과 종료일을 입력하세요.");
  }
  if (!settings.facilities.length) {
    throw new Error("시설을 하나 이상 선택하세요.");
  }

  saveSettings();
  state.isFetching = true;
  setLoading(true);
  setRunState("조회 중");

  try {
    const response = await fetch("/api/run-once", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      cache: "no-store",
      body: JSON.stringify({
        start: settings.startDate,
        end: settings.endDate,
        stayNights: settings.stayNights,
        sessionCookie: settings.sessionCookie,
        facilities: settings.facilities.join(",")
      })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "조회 실패");
    }
    render(data);
    setRunState(state.isPolling ? "폴링 중" : "대기 중");
    return true;
  } finally {
    state.isFetching = false;
    setLoading(false);
  }
}

async function runSafe() {
  try {
    await fetchStatus();
  } catch (error) {
    setRunState("오류");
    els.eventBody.innerHTML = `
      <tr>
        <td>${escapeHtml(new Date().toLocaleString("ko-KR"))}</td>
        <td><span class="type error">오류</span></td>
        <td colspan="6">${escapeHtml(error.message)}</td>
      </tr>
    `;
  }
}

function updateCountdown() {
  updateSummaryClock();
  updateRemainingCells();

  if (!state.nextAt) {
    els.nextTick.textContent = "-";
    return;
  }

  const remaining = Math.max(0, Math.ceil((state.nextAt - Date.now()) / 1000));
  els.nextTick.textContent = `${remaining}초`;
}

function stopPolling() {
  clearTimeout(state.timer);
  clearInterval(state.countdownTimer);
  state.timer = null;
  state.countdownTimer = null;
  state.isPolling = false;
  state.nextAt = null;
  els.startPoll.disabled = false;
  els.stopPoll.disabled = true;
  els.runOnce.disabled = false;
  setRunState("대기 중");
  updateCountdown();
  updateOverview();
}

async function stopServerPolling() {
  await fetch("/api/poll/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    cache: "no-store",
    body: "{}"
  });
  stopPolling();
}

function scheduleNextPoll(intervalMs) {
  if (!state.isPolling) return;

  state.nextAt = Date.now() + intervalMs;
  clearTimeout(state.timer);
  state.timer = setTimeout(async () => {
    await runSafe();
    scheduleNextPoll(intervalMs);
  }, intervalMs);
  updateCountdown();
}

async function startPolling() {
  stopPolling();
  const settings = getSettings();
  state.isPolling = true;
  els.startPoll.disabled = true;
  els.stopPoll.disabled = false;
  els.runOnce.disabled = true;
  setRunState("폴링 중");
  updateOverview();

  saveSettings();
  setLoading(true);
  const response = await fetch("/api/poll/start", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    cache: "no-store",
    body: JSON.stringify({
      start: settings.startDate,
      end: settings.endDate,
      stayNights: settings.stayNights,
      sessionCookie: settings.sessionCookie,
      intervalSec: settings.intervalSec,
      facilities: settings.facilities.join(",")
    })
  });
  const payload = await response.json();
  setLoading(false);
  if (!response.ok || !payload.ok) throw new Error(payload.message || "폴링 시작 실패");
  if (payload.data) render(payload.data);
  state.nextAt = payload.nextAt ? Date.parse(payload.nextAt) : null;
  state.countdownTimer = setInterval(updateCountdown, 1000);
}

els.runOnce.addEventListener("click", runSafe);
els.startPoll.addEventListener("click", () => startPolling().catch(error => {
  setLoading(false);
  stopPolling();
  setRunState("오류");
  alert(error.message);
}));
els.stopPoll.addEventListener("click", () => stopServerPolling().catch(error => alert(error.message)));
els.eventSort.addEventListener("change", () => renderEvents(state.currentEvents, state.currentCanceling, state.currentAvailable));
els.eventTypeFilter.addEventListener("change", () => renderEvents(state.currentEvents, state.currentCanceling, state.currentAvailable));
for (const select of [els.eventFacilityFilter, els.eventCapacityFilter, els.eventRoomFilter]) {
  select.addEventListener("change", () => {
    if (select === els.eventFacilityFilter) {
      const source = state.currentEvents;
      syncPanelFilters(source, els.eventFacilityFilter, els.eventCapacityFilter, els.eventRoomFilter);
    }
    renderEvents(state.currentEvents, state.currentCanceling, state.currentAvailable);
  });
}
els.detailSort.addEventListener("change", renderDetails);
els.detailStatusFilter.addEventListener("change", renderDetails);
for (const select of [els.detailFacilityFilter, els.detailCapacityFilter, els.detailRoomFilter]) {
  select.addEventListener("change", () => {
    if (select === els.detailFacilityFilter) syncPanelFilters(state.rows, els.detailFacilityFilter, els.detailCapacityFilter, els.detailRoomFilter);
    renderDetails();
  });
}
for (const select of [els.cancelFacilityFilter, els.cancelCapacityFilter, els.cancelRoomFilter]) {
  select.addEventListener("change", () => {
    if (select === els.cancelFacilityFilter) syncPanelFilters(state.currentCanceling, els.cancelFacilityFilter, els.cancelCapacityFilter, els.cancelRoomFilter);
    renderCancelProgress(state.currentCanceling);
  });
}
for (const select of [els.availableFacilityFilter, els.availableCapacityFilter, els.availableRoomFilter]) {
  select.addEventListener("change", () => {
    if (select === els.availableFacilityFilter) syncPanelFilters(state.currentAvailable, els.availableFacilityFilter, els.availableCapacityFilter, els.availableRoomFilter);
    renderAvailable(state.currentAvailable);
  });
}
els.clearCancel.addEventListener("click", () => {
  state.currentCanceling = [];
  els.cancelCount.textContent = "0";
  syncPanelFilters([], els.cancelFacilityFilter, els.cancelCapacityFilter, els.cancelRoomFilter);
  renderCancelProgress([]);
});
els.clearAvailable.addEventListener("click", () => {
  state.currentAvailable = [];
  syncPanelFilters([], els.availableFacilityFilter, els.availableCapacityFilter, els.availableRoomFilter);
  renderAvailable([]);
});
els.clearLog.addEventListener("click", () => {
  state.cancelDetectionHistory = [];
  state.currentEvents = [];
  localStorage.removeItem(CANCEL_DETECTION_HISTORY_KEY);
  syncPanelFilters([], els.eventFacilityFilter, els.eventCapacityFilter, els.eventRoomFilter);
  els.eventBody.innerHTML = `<tr><td colspan="8" class="empty-cell">취소시설 최초감지 기록을 초기화했습니다.</td></tr>`;
});
els.clearDetails.addEventListener("click", () => {
  state.rows = [];
  syncPanelFilters([], els.detailFacilityFilter, els.detailCapacityFilter, els.detailRoomFilter);
  renderDetails();
});

for (const input of els.settingsModal.querySelectorAll("input, select, textarea")) {
  input.addEventListener("change", saveSettings);
}

state.cancelDetectionHistory = loadCancelDetectionHistory();
state.currentEvents = state.cancelDetectionHistory;
setDefaults();
updateOverview();
updateSummaryClock();
setInterval(updateSummaryClock, 1000);

function getNotificationSettings() {
  const sets = [...els.notificationSets.querySelectorAll(".notification-set")].map(set => ({
    id: set.dataset.id,
    start: set.querySelector("[data-field='start']").value,
    end: set.querySelector("[data-field='end']").value,
    email: set.querySelector("[data-field='email']").value.trim(),
    facility: set.querySelector("[data-field='facility']").value,
    capacity: set.querySelector("[data-field='capacity']").value,
    rooms: set.querySelector("[data-field='rooms']").value.trim(),
    statuses: [...set.querySelectorAll("[data-field='status']:checked")].map(input => input.value)
  }));
  return {
    enabled: els.notifyEnabled.checked,
    sets
  };
}

function notificationSetTemplate(config, index) {
  const statuses = Array.isArray(config.statuses) && config.statuses.length ? config.statuses : ["canceling"];
  const facilities = ["", "든바다", "난바다", "허허바다", "자동차캠핑장"];
  const capacities = ["", "2인실", "4인실", "6인실", "8인실", "10인실", "사이트"];
  const facilityOptions = facilities.map(value => `<option value="${escapeHtml(value)}"${config.facility === value ? " selected" : ""}>${escapeHtml(value || "전체 시설")}</option>`).join("");
  const capacityOptions = capacities.map(value => `<option value="${escapeHtml(value)}"${config.capacity === value ? " selected" : ""}>${escapeHtml(value || "전체 인실")}</option>`).join("");
  const statusOption = (value, label) => `<label><input type="checkbox" data-field="status" value="${value}"${statuses.includes(value) ? " checked" : ""}> ${label}</label>`;
  return `
    <div class="notification-set-head"><h3>알림조건 ${index + 1}</h3><button type="button" class="remove-notification-set">삭제</button></div>
    <div class="notification-set-grid">
      <label>알림 시작일<input type="date" data-field="start" value="${escapeHtml(config.start || els.startDate.value)}"></label>
      <label>알림 종료일<input type="date" data-field="end" value="${escapeHtml(config.end || els.endDate.value)}"></label>
      <label>수신 이메일<input type="email" data-field="email" value="${escapeHtml(config.email || "")}" placeholder="name@example.com"></label>
      <label>시설<select data-field="facility">${facilityOptions}</select></label>
      <label>인실<select data-field="capacity">${capacityOptions}</select></label>
      <label>객실 호수<input type="text" data-field="rooms" value="${escapeHtml(config.rooms || "")}" placeholder="예: 101,102,105 / 비우면 전체"></label>
      <fieldset class="status-options"><legend>상태값</legend>
        ${statusOption("available", "예약가능")}
        ${statusOption("canceling", "취소진행중")}
        ${statusOption("preocpc", "선점/예약 중")}
      </fieldset>
    </div>`;
}

function renumberNotificationSets() {
  [...els.notificationSets.querySelectorAll(".notification-set h3")].forEach((title, index) => {
    title.textContent = `알림조건 ${index + 1}`;
  });
}

function addNotificationSet(config = {}) {
  const set = document.createElement("section");
  set.className = "notification-set";
  set.dataset.id = config.id || `set-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  set.innerHTML = notificationSetTemplate(config, els.notificationSets.children.length);
  set.querySelector(".remove-notification-set").addEventListener("click", () => {
    set.remove();
    if (!els.notificationSets.children.length) addNotificationSet();
    renumberNotificationSets();
  });
  els.notificationSets.append(set);
  renumberNotificationSets();
}

function setNotifyMessage(text, isError = false) {
  els.notifyMessage.textContent = text;
  els.notifyMessage.classList.toggle("error", isError);
}

async function loadNotificationSettings() {
  const response = await fetch("/api/notification", { cache: "no-store" });
  const data = await response.json();
  if (!data.ok) return;
  const notification = data.notification || {};
  els.notifyEnabled.checked = Boolean(notification.enabled);
  els.notificationSets.innerHTML = "";
  const sets = Array.isArray(notification.sets) ? notification.sets : [];
  for (const set of sets) addNotificationSet(set);
  if (!sets.length) addNotificationSet();
}

async function saveNotificationSettings() {
  const response = await fetch("/api/notification", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    cache: "no-store",
    body: JSON.stringify(getNotificationSettings())
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message || "알림 설정 저장 실패");
  setNotifyMessage("알림 설정을 저장했습니다.");
}

async function sendTestMail() {
  if (els.testMail.disabled) return;
  els.testMail.disabled = true;
  const startedAt = Date.now();
  setNotifyMessage("테스트 메일 발송 중...");
  try {
    const email = getNotificationSettings().sets.find(set => set.email)?.email || "";
    const response = await fetch("/api/notification/test-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      cache: "no-store",
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || "테스트 메일 발송 실패");
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    setNotifyMessage(`${data.message || "테스트 메일을 발송했습니다."} (${elapsedSeconds}초)`);
  } finally {
    els.testMail.disabled = false;
  }
}

async function loadServerStatus() {
  const response = await fetch("/api/status", { cache: "no-store" });
  const payload = await response.json();
  if (!payload.ok) return;
  applyManagementAccess(payload.canManage);
  applyServerSettings(payload.settings);
  if (payload.data) render(payload.data);
  state.isPolling = Boolean(payload.polling);
  state.isFetching = Boolean(payload.fetching);
  state.nextAt = payload.nextAt ? Date.parse(payload.nextAt) : null;
  els.startPoll.disabled = state.isPolling;
  els.stopPoll.disabled = !state.isPolling;
  els.runOnce.disabled = state.isPolling || state.isFetching;
  setRunState(state.isPolling ? "폴링 중" : "대기 중");
  updateOverview();
  if (state.isPolling && !state.countdownTimer) {
    state.countdownTimer = setInterval(updateCountdown, 1000);
  }
  updateCountdown();
}

function connectStream() {
  if (!window.EventSource) return;
  const source = new EventSource("/api/stream");
  source.onmessage = event => {
    const payload = JSON.parse(event.data);
    if (payload.type === "status" && payload.data) {
      if (typeof payload.canManage === "boolean") applyManagementAccess(payload.canManage);
      applyServerSettings(payload.settings);
      render(payload.data);
      setLoading(false);
    }
    if (payload.type === "fetching") {
      state.isFetching = Boolean(payload.fetching);
      setLoading(state.isFetching);
    }
    if (payload.type === "polling") {
      state.isPolling = Boolean(payload.polling);
      state.nextAt = payload.nextAt ? Date.parse(payload.nextAt) : null;
      els.startPoll.disabled = state.isPolling;
      els.stopPoll.disabled = !state.isPolling;
      els.runOnce.disabled = state.isPolling || state.isFetching;
      setRunState(state.isPolling ? "폴링 중" : "대기 중");
      updateCountdown();
      updateOverview();
    }
    if (payload.type === "error") {
      setRunState("오류");
    }
  };
}

els.saveNotify.addEventListener("click", () => saveNotificationSettings().catch(error => setNotifyMessage(error.message, true)));
els.testMail.addEventListener("click", () => sendTestMail().catch(error => setNotifyMessage(error.message, true)));
els.addNotificationSet.addEventListener("click", () => addNotificationSet());
els.openSettings.addEventListener("click", () => openModal(els.settingsModal));
els.openNotifications.addEventListener("click", () => openModal(els.notificationModal));
document.querySelectorAll("[data-close-modal]").forEach(button => {
  button.addEventListener("click", () => closeModal(document.querySelector(`#${button.dataset.closeModal}`)));
});
document.querySelectorAll(".modal-layer").forEach(layer => {
  layer.addEventListener("click", event => {
    if (event.target === layer) closeModal(layer);
  });
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const openLayer = document.querySelector(".modal-layer:not([hidden])");
  if (openLayer) closeModal(openLayer);
});

loadServerStatus().catch(() => {});
