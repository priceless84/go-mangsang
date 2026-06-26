"use strict";

let lastPayload = {
  active: [],
  events: [],
  status: { monitor: {} }
};

const $ = id => document.getElementById(id);

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR");
}

function includesFilter(row, filter) {
  if (!filter) return true;
  return [
    row.date,
    row.category,
    row.roomName,
    row.fcltyCode,
    row.fcltyTyCode,
    row.resveNoCode
  ].join(" ").toLowerCase().includes(filter.toLowerCase());
}

function rowHtml(row, timeLabel) {
  return `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.roomName)}</td>
      <td>${escapeHtml(row.fcltyCode)}</td>
      <td>${escapeHtml(row.fcltyTyCode)}</td>
      <td>${escapeHtml(row.resveNoCode)}</td>
      <td>${escapeHtml(formatDateTime(row[timeLabel] || row.detectedAt))}</td>
    </tr>
  `;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[ch]));
}

function render(payload) {
  lastPayload = payload;

  const filter = $("filterInput").value.trim();
  const status = payload.status || {};
  const monitor = status.monitor || {};
  const active = (payload.active || []).filter(row => includesFilter(row, filter));
  const events = (payload.events || []).filter(row => includesFilter(row, filter));

  $("activeCount").textContent = payload.active?.length || 0;
  $("eventCount").textContent = payload.events?.length || 0;
  $("scanCount").textContent = monitor.count || 0;
  $("requestCount").textContent = monitor.totalRequests || 0;
  $("range").textContent = monitor.range || "-";
  $("interval").textContent = monitor.intervalSec ? `${monitor.intervalSec}초` : "-";
  $("lastReportAt").textContent = formatDateTime(status.lastReportAt);
  $("lastRefreshAt").textContent = formatDateTime(status.lastRefreshAt);
  $("activeUpdated").textContent = `최근 수신: ${formatDateTime(status.lastReportAt)}`;

  const serverState = $("serverState");
  const lastReportAt = status.lastReportAt ? new Date(status.lastReportAt).getTime() : 0;
  const staleMs = Date.now() - lastReportAt;

  serverState.className = "status-pill";
  if (!lastReportAt) {
    serverState.textContent = "수집기 대기 중";
    serverState.classList.add("warn");
  } else if (staleMs > 60_000) {
    serverState.textContent = "수신 지연";
    serverState.classList.add("warn");
  } else {
    serverState.textContent = "실시간 수신 중";
    serverState.classList.add("ok");
  }

  $("activeRows").innerHTML = active.length
    ? active.map(row => rowHtml(row, "detectedAt")).join("")
    : `<tr><td colspan="7" class="empty">현재 감지된 취소분 없음</td></tr>`;

  $("eventRows").innerHTML = events.length
    ? events.map(row => rowHtml(row, "detectedAt")).join("")
    : `<tr><td colspan="7" class="empty">누적 기록 없음</td></tr>`;
}

async function loadDashboard() {
  try {
    const res = await fetch("/api/events", { cache: "no-store" });
    const payload = await res.json();
    render(payload);
  } catch {
    const serverState = $("serverState");
    serverState.textContent = "서버 연결 실패";
    serverState.className = "status-pill warn";
  }
}

async function resetEvents() {
  if (!confirm("누적 감지 기록을 리셋할까요?")) return;
  await fetch("/api/reset", { method: "POST" });
  await loadDashboard();
}

$("filterInput").addEventListener("input", () => render(lastPayload));
$("refreshBtn").addEventListener("click", loadDashboard);
$("resetBtn").addEventListener("click", resetEvents);

loadDashboard();
setInterval(loadDashboard, 3000);
