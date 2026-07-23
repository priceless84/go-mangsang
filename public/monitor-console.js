window.stopWatchAll && window.stopWatchAll();

(function () {
  "use strict";

  const CATEGORIES = [
    { code: "1300", name: "든바다" },
    { code: "1400", name: "난바다" },
    { code: "1500", name: "허허바다" },
    { code: "1600", name: "자동차캠핑장" }
  ];

  const CONFIG = {
    url: "/user/reservation/ND_selectChildFcltyList.do",
    reportUrl: "https://go-mangsang.onrender.com/api/report",
    trrsrtCode: "1000",
    resveNoCode: "MA",
    maxDays: 40,
    intervalSec: 5
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
      "101": 10, "102": 8, "103": 4, "104": 4, "105": 6,
      "106": 4, "107": 4, "108": 10
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

  function parseTimeToDate(timeStr) {
    const d = new Date();
    const raw = String(timeStr || "");
    const match = raw.match(/(오전|오후)?\s*(\d+):(\d+):(\d+)/);
    if (match) {
      let h = Number(match[2]);
      const m = Number(match[3]);
      const s = Number(match[4]);
      if (match[1] === "오후" && h < 12) h += 12;
      if (match[1] === "오전" && h === 12) h = 0;
      d.setHours(h, m, s, 0);
      return d;
    }
    const [h, m, s] = raw.split(":").map(Number);
    d.setHours(h || 0, m || 0, s || 0, 0);
    return d;
  }

  function addTwoHours(timeStr) {
    const d = parseTimeToDate(timeStr);
    d.setHours(d.getHours() + 2);
    return d.toLocaleTimeString("ko-KR");
  }

  function displayWidth(value) {
    return [...String(value)].reduce(
      (width, ch) => width + (/[^\u0000-\u00ff]/.test(ch) ? 2 : 1),
      0
    );
  }

  function padDisplay(value, targetWidth) {
    const text = String(value);
    return text + " ".repeat(Math.max(0, targetWidth - displayWidth(text)));
  }

  function maxDisplayWidth(values) {
    return Math.max(0, ...values.map(displayWidth));
  }

  function getRoomNo(x) {
    const source = [x && x.fcltyNm, x && x.fcltyCode, x && x.fcltyNo, x && x.roomNo]
      .filter(Boolean)
      .join(" ");
    const match = source.match(/(\d{3})/);
    return match ? match[1] : "";
  }

  function getCapacity(cat, x) {
    const roomNo = getRoomNo(x);
    if (cat.code === "1600") return 4;
    return ROOM_CAPACITY[cat.code] && ROOM_CAPACITY[cat.code][roomNo]
      ? ROOM_CAPACITY[cat.code][roomNo]
      : null;
  }

  function makeRoomText(cat, x) {
    const roomName = String((x && x.fcltyNm) || "이름없음").trim();
    const capacity = getCapacity(cat, x);
    return capacity ? `${roomName}(${capacity}인)` : roomName;
  }

  function beep() {
    try {
      new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg")
        .play()
        .catch(() => {});
    } catch (e) {}
  }

  function buildRows(activeRecords, historyRecords) {
    const all = [...activeRecords, ...historyRecords];
    const categoryWidth = maxDisplayWidth(all.map(x => x.category));
    const roomWidth = maxDisplayWidth(all.map(x => x.room));

    function makeLine(r) {
      return [
        `[${r.date}]`,
        padDisplay(r.category, categoryWidth),
        padDisplay(r.room, roomWidth),
        `감지 ${r.detected}`,
        `예상 ${r.expected}`
      ].join("  ");
    }

    return {
      activeLines: activeRecords.map(makeLine),
      historyLines: historyRecords.map(makeLine)
    };
  }

  function reportToDashboard(activeRecords, historyRecords, totalRequests) {
    const toItem = record => ({
      date: record.date,
      target_date: record.date,
      facility: record.category,
      category: record.category,
      room: record.room,
      room_name: record.room,
      roomName: record.room,
      capacity: String(record.capacity || ""),
      status: "N",
      canclYn: "N",
      event_type: "canceling",
      eventType: "canceling",
      state: "발생",
      statusText: "취소 진행중",
      detectedAt: record.detectedAt || new Date().toISOString(),
      message: `${record.date} ${record.category} ${record.room} 취소 진행중`
    });

    fetch(CONFIG.reportUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      cache: "no-store",
      body: JSON.stringify({
        source: "reservation-console",
        refreshedAt: new Date().toISOString(),
        range: `${getFormattedDate(1)} ~ ${getFormattedDate(CONFIG.maxDays)}`,
        intervalSec: CONFIG.intervalSec,
        facilities: CATEGORIES.map(item => item.name).join(","),
        count,
        totalRequests,
        failures: 0,
        active: activeRecords.map(toItem),
        events: historyRecords.map(toItem)
      })
    }).catch(() => {});
  }

  function showScreen(activeRecords, totalRequests) {
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
      capacity: item.capacity,
      detected: item.detected,
      detectedAt: item.detectedAt,
      expected: addTwoHours(item.detected)
    }));
    const rows = buildRows(activeRecords, historyRecords);

    console.clear();
    console.log(`
========================================================
망상리조트 4구역 40일 취소 모니터링
감시 범위 : ${getFormattedDate(1)} ~ ${getFormattedDate(CONFIG.maxDays)}
동시 요청수 : 총 ${totalRequests}개 조합 / 조회 횟수 : ${count}회차
현재 시간 : ${nowText()}
이전 갱신 : ${previousRefreshTime}
최근 갱신 : ${currentRefreshTime}
스캔 시작 : ${scanStartTime ? scanStartTime.toLocaleTimeString("ko-KR") : "-"}
스캔 종료 : ${scanEndTime ? scanEndTime.toLocaleTimeString("ko-KR") : "-"}
스캔 소요 : ${scanDuration}초
다음 시작 : ${nextStartTime}
실제 주기 : ${cycleDuration}초
-------------------------------------------------------------
[1] 현재 취소 진행 시설
${rows.activeLines.length ? rows.activeLines.join("\n") : "취소분 없음"}

[2] 최초 감지 / 예상시간
${rows.historyLines.length ? rows.historyLines.join("\n") : "-"}

명령 stopWatchAll() / resetCancelLog()
========================================================
`);
    reportToDashboard(activeRecords, historyRecords, totalRequests);
  }

  window.stopWatchAll = function () {
    if (window.myWatchTimer) clearTimeout(window.myWatchTimer);
    window.myWatchTimer = null;
    isProcessing = false;
    console.log("모니터링 중지");
  };

  window.resetCancelLog = function () {
    Object.keys(cancelDetectedTimes).forEach(key => delete cancelDetectedTimes[key]);
    console.log("감지 기록 초기화");
  };

  function batchCheckAll() {
    if (isProcessing) return;
    isProcessing = true;
    count++;
    scanStartTime = new Date();

    const promises = [];
    const activeRecords = [];

    for (let day = 1; day < CONFIG.maxDays; day++) {
      const checkBeginDe = getFormattedDate(day);
      const checkEndDe = getFormattedDate(day + 1);

      CATEGORIES.forEach(cat => {
        const request = $.ajax({
          url: CONFIG.url,
          type: "POST",
          dataType: "json",
          cache: false,
          data: {
            trrsrtCode: CONFIG.trrsrtCode,
            fcltyCode: cat.code,
            resveNoCode: CONFIG.resveNoCode,
            resveBeginDe: checkBeginDe,
            resveEndDe: checkEndDe
          },
          success: function (res) {
            const list = res && res.value && res.value.childFcltyList;
            if (!Array.isArray(list)) return;

            list.forEach(x => {
              if (!x || x.canclYn !== "N") return;

              const room = makeRoomText(cat, x);
              const capacity = getCapacity(cat, x);
              const key = [checkBeginDe, cat.code, x.fcltyCode || x.fcltyNm || ""].join("|");

              if (!cancelDetectedTimes[key]) {
                cancelDetectedTimes[key] = {
                  date: checkBeginDe,
                  category: cat.name,
                  room,
                  capacity,
                  detected: nowText(),
                  detectedAt: new Date().toISOString()
                };
                beep();
              } else {
                cancelDetectedTimes[key].room = room;
                cancelDetectedTimes[key].capacity = capacity;
              }

              const detected = cancelDetectedTimes[key].detected;
              activeRecords.push({
                date: checkBeginDe,
                category: cat.name,
                room,
                capacity,
                detected,
                detectedAt: cancelDetectedTimes[key].detectedAt,
                expected: addTwoHours(detected)
              });
            });
          },
          error: function () {}
        });
        promises.push(request);
      });
    }

    $.when.apply($, promises).always(function () {
      scanEndTime = new Date();
      scanDuration = ((scanEndTime - scanStartTime) / 1000).toFixed(2);
      cycleDuration = (Number(scanDuration) + CONFIG.intervalSec).toFixed(2);
      previousRefreshTime = currentRefreshTime;
      currentRefreshTime = nowText();
      nextStartTime = new Date(scanEndTime.getTime() + CONFIG.intervalSec * 1000)
        .toLocaleTimeString("ko-KR");

      showScreen(activeRecords, promises.length);
      isProcessing = false;
      window.myWatchTimer = setTimeout(batchCheckAll, CONFIG.intervalSec * 1000);
    });
  }

  console.clear();
  console.log("[객실별 정원 고정매핑 + 최소폭 정렬] 모니터링 시작...");
  batchCheckAll();
})();
