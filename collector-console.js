window.stopWatchAll && stopWatchAll();

(function () {
  "use strict";

  const DASHBOARD_URL = "https://go-mangsang.onrender.com";

  const CATEGORIES = [
    { code: "1300", name: "든바다", resveNoCodes: ["ME", "MC", "MA", "MG", "MD", "MB"] },
    { code: "1400", name: "난바다", resveNoCodes: ["MH", "MB", "MD", "MG", "MI"] },
    { code: "1500", name: "허허바다", resveNoCodes: ["MI", "MF", "MC", "MD", "MB"] },
    { code: "1600", name: "자동차캠핑장", resveNoCodes: ["RR"] }
  ];

  const CONFIG = {
    url: "/user/reservation/ND_selectChildFcltyList.do",
    trrsrtCode: "1000",
    maxDays: 40,
    intervalSec: 5,
    requestTimeoutMs: 9000,
    concurrency: 12
  };

  const ROOM_CAPACITY = {
    "1300": {
      "101": 8, "102": 4, "103": 4, "104": 2, "105": 2, "106": 10,
      "107": 2, "108": 2, "109": 4, "110": 8, "111": 4, "112": 6,
      "113": 2, "114": 2, "115": 6, "116": 4, "117": 2, "118": 2,
      "119": 6, "120": 4, "121": 4, "122": 4, "123": 4
    },
    "1400": {
      "101": 8, "102": 6, "103": 4, "104": 4, "105": 6, "106": 10,
      "107": 4, "108": 4, "109": 8, "110": 6, "111": 4, "112": 4,
      "113": 8, "114": 6, "115": 10
    },
    "1500": {
      "101": 10, "102": 8, "103": 4, "104": 4, "105": 6, "106": 4,
      "107": 4, "108": 10
    }
  };

  let count = 0;
  let isProcessing = false;
  let previousRefreshTime = "-";
  let currentRefreshTime = "-";
  let scanStartTime = null;
  let scanEndTime = null;
  let scanDuration = "0.00";
  let cycleDuration = "0.00";
  let nextStartTime = "-";
  let completedRequests = 0;
  let totalRequests = 0;
  let failures = 0;
  const cancelDetectedTimes = {};

  window.myWatchTimer = null;

  function getFormattedDate(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  }

  function nowText() {
    return new Date().toLocaleTimeString("ko-KR");
  }

  function displayWidth(value) {
    return [...String(value ?? "")].reduce((width, ch) => width + (/[^ -~]/.test(ch) ? 2 : 1), 0);
  }

  function padDisplay(value, targetWidth) {
    const text = String(value ?? "");
    return text + " ".repeat(Math.max(0, targetWidth - displayWidth(text)));
  }

  function centerDisplay(value, targetWidth) {
    const text = String(value ?? "");
    const space = Math.max(0, targetWidth - displayWidth(text));
    return " ".repeat(Math.floor(space / 2)) + text + " ".repeat(Math.ceil(space / 2));
  }

  function maxDisplayWidth(values) {
    return values.reduce((max, value) => Math.max(max, displayWidth(value)), 0);
  }

  function parseTimeToDate(timeStr) {
    const d = new Date();
    const text = String(timeStr || "");
    const match = text.match(/(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return new Date(NaN);
    let hour = Number(match[2]);
    const minute = Number(match[3]);
    const second = Number(match[4] || 0);
    if (match[1] === "오후" && hour < 12) hour += 12;
    if (match[1] === "오전" && hour === 12) hour = 0;
    d.setHours(hour, minute, second, 0);
    return d;
  }

  function addTwoHours(timeStr) {
    const d = parseTimeToDate(timeStr);
    if (!Number.isFinite(d.getTime())) return "-";
    d.setHours(d.getHours() + 2);
    return d.toLocaleTimeString("ko-KR");
  }

  function getRoomNo(x) {
    const source = [x?.fcltyNm, x?.fcltyCode, x?.fcltyNo, x?.roomNo].filter(Boolean).join(" ");
    const match = source.match(/(\d{3})/);
    return match ? match[1] : "";
  }

  function getCapacity(cat, x) {
    const roomNo = getRoomNo(x);
    if (cat.code === "1600") return 4;
    return ROOM_CAPACITY[cat.code]?.[roomNo] ?? null;
  }

  function makeRoomText(cat, x) {
    const roomName = String(x?.fcltyNm || "이름없음").trim();
    const capacity = getCapacity(cat, x);
    return capacity ? `${roomName}(${capacity}인)` : roomName;
  }

  function pickFirstValue(obj, keys) {
    if (!obj || typeof obj !== "object") return "";
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
    }
    return "";
  }

  function getActualResveNoCode(site, res, fallbackCode) {
    return pickFirstValue(site, [
      "resveNoCode", "resveNoCd", "resveNo", "resveCode", "resveSeCode",
      "resveClCode", "fcltyResveNoCode", "fcltyResveCode", "resveTyCode", "resveTypeCode"
    ]) || pickFirstValue(res?.value, [
      "resveNoCode", "resveNoCd", "resveNo", "resveCode", "resveSeCode", "resveClCode"
    ]) || fallbackCode || "-";
  }

  function isCanceling(site) {
    if (!site || typeof site !== "object") return false;
    return String(site.canclYn || "").toUpperCase() === "N";
  }

  function isAvailable(site) {
    if (!site || typeof site !== "object") return false;
    return String(site.resveAt || "").toUpperCase() === "Y" &&
      String(site.resveYn || "").toUpperCase() === "Y" &&
      String(site.preocpcYn || "").toUpperCase() === "Y" &&
      String(site.imprtyYn || "").toUpperCase() === "N" &&
      String(site.canclYn || "").toUpperCase() === "Y";
  }

  function beep() {
    try {
      new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg").play().catch(() => {});
    } catch (e) {}
  }

  function buildRows(activeRecords, historyRecords) {
    const all = [...activeRecords, ...historyRecords];
    const dateWidth = Math.max(12, displayWidth("날짜"), maxDisplayWidth(all.map(x => x.date)));
    const categoryWidth = Math.max(10, displayWidth("시설"), maxDisplayWidth(all.map(x => x.category)));
    const roomWidth = Math.max(12, displayWidth("객실"), maxDisplayWidth(all.map(x => x.room)));
    const detectedWidth = Math.max(13, displayWidth("감지"), maxDisplayWidth(all.map(x => x.detected)));
    const expectedWidth = Math.max(13, displayWidth("예상"), maxDisplayWidth(all.map(x => x.expected)));
    const separator = " │ ";
    const rowPrefix = "• ";
    const headerPrefix = " ".repeat(displayWidth(rowPrefix));
    const header =
      headerPrefix +
      centerDisplay("날짜", dateWidth) + separator +
      centerDisplay("시설", categoryWidth) + separator +
      centerDisplay("객실", roomWidth) + separator +
      centerDisplay("감지", detectedWidth) + separator +
      centerDisplay("예상", expectedWidth);

    function makeLine(r) {
      return (
        rowPrefix +
        padDisplay(r.date, dateWidth) + separator +
        padDisplay(r.category, categoryWidth) + separator +
        padDisplay(r.room, roomWidth) + separator +
        padDisplay(r.detected, detectedWidth) + separator +
        padDisplay(r.expected, expectedWidth)
      );
    }

    return {
      header,
      activeLines: activeRecords.map(makeLine),
      historyLines: historyRecords.map(makeLine)
    };
  }

  function showScreen(activeRecords) {
    const now = new Date();

    Object.keys(cancelDetectedTimes).forEach(key => {
      const item = cancelDetectedTimes[key];
      const detectTime = parseTimeToDate(item.detected);
      if (Number.isFinite(detectTime.getTime()) && now - detectTime > 7200 * 1000) {
        delete cancelDetectedTimes[key];
      }
    });

    const historyRecords = Object.values(cancelDetectedTimes).map(item => ({
      date: item.date,
      category: item.category,
      room: item.room,
      detected: item.detected,
      expected: addTwoHours(item.detected)
    }));

    const rows = buildRows(activeRecords, historyRecords);
    console.clear();
    console.log(`
========================================================
⚡ 망상리조트 4구역 x 40일 취소 모니터링
대시보드 : ${DASHBOARD_URL}
감시 범위 : ${getFormattedDate(1)} ~ ${getFormattedDate(CONFIG.maxDays)}
동시 요청수 : ${totalRequests}개 조합 / 조회 횟수 : ${count}회차
진행 상태 : ${completedRequests} / ${totalRequests} 요청 완료 (통신실패 ${failures})
현재 시간 : ${nowText()}
이전 갱신 : ${previousRefreshTime}
최근 갱신 : ${currentRefreshTime}
스캔 시작 : ${scanStartTime ? scanStartTime.toLocaleTimeString("ko-KR") : "-"}
스캔 종료 : ${scanEndTime ? scanEndTime.toLocaleTimeString("ko-KR") : "-"}
스캔 소요 : ${scanDuration}초
다음 시작 : ${nextStartTime}
실제 주기 : ${cycleDuration}초
--------------------------------------------------------
[1] 🚨 현재 취소 진행 시설
${rows.header}
${rows.activeLines.length ? rows.activeLines.join("\n") : "• 취소분 없음"}

[2] ⏱ 최초 감지 / 예상시간
${rows.header}
${rows.historyLines.length ? rows.historyLines.join("\n") : "-"}

명령 stopWatchAll() | resetCancelLog()
========================================================
`);
  }

  async function reportToDashboard(activeRecords, availableRecords, phase) {
    try {
      const active = activeRecords.map(record => ({
        id: record.id,
        date: record.rawDate,
        category: record.category,
        roomName: record.room,
        fcltyCode: record.fcltyCode,
        fcltyTyCode: record.fcltyTyCode,
        resveNoCode: record.resveNoCode,
        detectedAt: record.detectedAt
      }));
      const available = availableRecords.map(record => ({
        id: record.id,
        date: record.rawDate,
        category: record.category,
        roomName: record.room,
        fcltyCode: record.fcltyCode,
        fcltyTyCode: record.fcltyTyCode,
        resveNoCode: record.resveNoCode,
        detectedAt: record.detectedAt
      }));

      const response = await fetch(`${DASHBOARD_URL}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase,
          refreshedAt: new Date().toISOString(),
          count,
          totalRequests,
          completedRequests,
          failures,
          monitorError: totalRequests > 0 && failures >= totalRequests ? "캠핑코리아 통신 실패" : "",
          source: "pc-local",
          range: `${getFormattedDate(1)} ~ ${getFormattedDate(CONFIG.maxDays)}`,
          intervalSec: CONFIG.intervalSec,
          active,
          available
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.warn("⚠️ 대시보드 서버 전송 실패:", error.message);
    }
  }

  function ajaxWithTimeout(options, timeoutMs) {
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, timeout: true });
      }, timeoutMs);

      $.ajax({
        ...options,
        success(res) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ ok: true, res });
        },
        error(xhr, status, error) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ ok: false, status, error });
        }
      });
    });
  }

  async function runLimited(tasks, limit, onProgress) {
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < tasks.length && !window.__mangsangStopRequested) {
        const task = tasks[nextIndex++];
        await task();
        await onProgress();
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  }

  window.stopWatchAll = function () {
    window.__mangsangStopRequested = true;
    if (window.myWatchTimer) clearTimeout(window.myWatchTimer);
    window.myWatchTimer = null;
    isProcessing = false;
    console.log("🛑 모니터링 중지");
  };

  window.resetCancelLog = function () {
    Object.keys(cancelDetectedTimes).forEach(key => delete cancelDetectedTimes[key]);
    console.log("🧹 감지 기록 초기화");
  };

  async function batchCheckAll() {
    if (isProcessing) return;
    if (typeof $ === "undefined" || !$.ajax) {
      console.error("❌ jQuery($.ajax)를 찾을 수 없습니다. 예약 페이지가 완전히 로드된 뒤 다시 실행하세요.");
      return;
    }

    window.__mangsangStopRequested = false;
    isProcessing = true;
    count++;
    completedRequests = 0;
    failures = 0;
    scanStartTime = new Date();

    const tasks = [];
    const activeMap = new Map();
    const availableMap = new Map();

    for (let day = 1; day < CONFIG.maxDays; day++) {
      const checkBeginDe = getFormattedDate(day);
      const checkEndDe = getFormattedDate(day + 1);

      CATEGORIES.forEach(cat => {
        cat.resveNoCodes.forEach(resveNoCode => {
          tasks.push(async () => {
            const result = await ajaxWithTimeout({
              url: CONFIG.url,
              type: "POST",
              dataType: "json",
              cache: false,
              data: {
                trrsrtCode: CONFIG.trrsrtCode,
                fcltyCode: cat.code,
                resveNoCode,
                resveBeginDe: checkBeginDe,
                resveEndDe: checkEndDe
              }
            }, CONFIG.requestTimeoutMs);

            completedRequests++;
            if (!result.ok) {
              failures++;
              return;
            }

            const list = result.res?.value?.childFcltyList;
            if (!Array.isArray(list)) return;

            list.forEach(x => {
              if (!isCanceling(x) && !isAvailable(x)) return;
              const room = makeRoomText(cat, x);
              const id = [checkBeginDe, cat.code, x.fcltyCode || x.fcltyNm || "", room].join("|");
              const key = id;

              if (!cancelDetectedTimes[key]) {
                cancelDetectedTimes[key] = {
                  date: `[${checkBeginDe}]`,
                  category: cat.name,
                  room,
                  detected: nowText(),
                  detectedAt: new Date().toISOString()
                };
                beep();
              } else {
                cancelDetectedTimes[key].room = room;
              }

              const detected = cancelDetectedTimes[key].detected;
              const record = {
                id,
                rawDate: checkBeginDe,
                date: `[${checkBeginDe}]`,
                category: cat.name,
                room,
                detected,
                detectedAt: cancelDetectedTimes[key].detectedAt,
                expected: addTwoHours(detected),
                fcltyCode: x.fcltyCode || "-",
                fcltyTyCode: x.fcltyTyCode || "-",
                resveNoCode: String(getActualResveNoCode(x, result.res, resveNoCode) || "-")
              };

              if (isCanceling(x)) {
                activeMap.set(id, record);
              } else if (isAvailable(x)) {
                availableMap.set(id, record);
              }
            });
          });
        });
      });
    }

    totalRequests = tasks.length;
    previousRefreshTime = currentRefreshTime;
    currentRefreshTime = nowText();

    const progressReport = async () => {
      const activeRecords = Array.from(activeMap.values());
      const availableRecords = Array.from(availableMap.values());
      if (completedRequests === 1 || completedRequests % 20 === 0 || completedRequests === totalRequests) {
        showScreen(activeRecords);
        if (activeRecords.length || availableRecords.length || completedRequests === totalRequests) {
          await reportToDashboard(activeRecords, availableRecords, "progress");
        }
      }
    };

    showScreen([]);
    await runLimited(tasks, CONFIG.concurrency, progressReport);

    scanEndTime = new Date();
    scanDuration = ((scanEndTime - scanStartTime) / 1000).toFixed(2);
    cycleDuration = (Number(scanDuration) + CONFIG.intervalSec).toFixed(2);
    nextStartTime = new Date(scanEndTime.getTime() + CONFIG.intervalSec * 1000).toLocaleTimeString("ko-KR");

    const activeRecords = Array.from(activeMap.values());
    const availableRecords = Array.from(availableMap.values());
    currentRefreshTime = nowText();
    showScreen(activeRecords);
    await reportToDashboard(activeRecords, availableRecords, "finished");

    isProcessing = false;
    if (!window.__mangsangStopRequested) {
      window.myWatchTimer = setTimeout(batchCheckAll, CONFIG.intervalSec * 1000);
    }
  }

  console.clear();
  console.log("🚀 [기존 콘솔 표시 + 대시보드 전송] 모니터링 시작...");
  batchCheckAll();
})();
