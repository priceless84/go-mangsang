window.stopWatchAll && stopWatchAll();

(function () {
    "use strict";

    const DASHBOARD_URL = "https://go-mangsang.onrender.com";

    const CATEGORIES = [
        { code: "1300", name: "▶든바다" },
        { code: "1400", name: "▷난바다" },
        { code: "1500", name: "★허허바다" },
        { code: "1600", name: "☆자동차" }
    ];

    const CONFIG = {
        url: "/user/reservation/ND_selectChildFcltyList.do",
        trrsrtCode: "1000",
        resveNoCode: "MA",
        maxDays: 40,
        intervalSec: 5
    };

    // =========================================================
    // 객실별 정원 확정 매핑
    // =========================================================

    const ROOM_CAPACITY = {
        "1300": { // 든바다
            "101": 8,
            "102": 4,
            "103": 4,
            "104": 2,
            "105": 2,
            "106": 10,
            "107": 2,
            "108": 2,
            "109": 4,
            "110": 8,
            "111": 4,
            "112": 6,
            "113": 2,
            "114": 2,
            "115": 6,
            "116": 4,
            "117": 2,
            "118": 2,
            "119": 6,
            "120": 4,
            "121": 4,
            "122": 4,
            "123": 4
        },

        "1400": { // 난바다
            "101": 8,
            "102": 6,
            "103": 4,
            "104": 4,
            "105": 6,
            "106": 10,
            "107": 4,
            "108": 4,
            "109": 8,
            "110": 6,
            "111": 4,
            "112": 4,
            "113": 8,
            "114": 6,
            "115": 10
        },

        "1500": { // 허허바다
            "101": 10,
            "102": 8,
            "103": 4,
            "104": 4,
            "105": 6,
            "106": 4,
            "107": 4,
            "108": 10
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

    // =========================================================
    // 날짜 / 시간
    // =========================================================

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

        const match = String(timeStr).match(
            /(오전|오후)?\s*(\d+):(\d+):(\d+)/
        );

        if (match) {
            let h = Number(match[2]);
            const m = Number(match[3]);
            const s = Number(match[4]);

            if (match[1] === "오후" && h < 12) h += 12;
            if (match[1] === "오전" && h === 12) h = 0;

            d.setHours(h, m, s, 0);

            return d;
        }

        const [h, m, s] = String(timeStr)
            .split(":")
            .map(Number);

        d.setHours(h || 0, m || 0, s || 0, 0);

        return d;
    }

    function addTwoHours(timeStr) {
        const d = parseTimeToDate(timeStr);

        d.setHours(d.getHours() + 2);

        return d.toLocaleTimeString("ko-KR");
    }

    // =========================================================
    // 콘솔 표시폭 / 중앙 정렬
    // =========================================================

    function charDisplayWidth(ch) {
        const cp = ch.codePointAt(0);

        // 결합문자 / variation selector는 폭을 차지하지 않음
        if (
            (cp >= 0x0300 && cp <= 0x036f) ||
            (cp >= 0xfe00 && cp <= 0xfe0f) ||
            cp === 0x200d
        ) {
            return 0;
        }

        // 한글·CJK·전각문자·이모지는 2칸
        if (
            (cp >= 0x1100 && cp <= 0x115f) ||
            (cp >= 0x2e80 && cp <= 0xa4cf) ||
            (cp >= 0xac00 && cp <= 0xd7a3) ||
            (cp >= 0xf900 && cp <= 0xfaff) ||
            (cp >= 0xfe10 && cp <= 0xfe6f) ||
            (cp >= 0xff00 && cp <= 0xff60) ||
            (cp >= 0x1f300 && cp <= 0x1faff)
        ) {
            return 2;
        }

        // DevTools 콘솔에서는 ▶ ▷ ★ ☆ 기호가 대부분 2칸으로 표시됨
        // 이 폭을 1칸으로 계산하면 객실 열 이후의 모든 │ 위치가 밀림
        if (["▶", "▷", "★", "☆"].includes(ch)) {
            return 2;
        }

        return 1;
    }

    function displayWidth(value) {
        return Array.from(String(value)).reduce(
            (width, ch) => width + charDisplayWidth(ch),
            0
        );
    }

    function padDisplay(value, targetWidth) {
        const text = String(value);
        const spaces = Math.max(0, targetWidth - displayWidth(text));

        return text + " ".repeat(spaces);
    }

    function centerDisplay(value, targetWidth) {
        const text = String(value);
        const spaces = Math.max(0, targetWidth - displayWidth(text));
        const left = Math.floor(spaces / 2);
        const right = spaces - left;

        return " ".repeat(left) + text + " ".repeat(right);
    }

    function maxDisplayWidth(values) {
        return Math.max(0, ...values.map(displayWidth));
    }

    // =========================================================
    // 객실번호 / 정원
    // =========================================================

    function getRoomNo(x) {
        const source = [
            x?.fcltyNm,
            x?.fcltyCode,
            x?.fcltyNo,
            x?.roomNo
        ]
            .filter(Boolean)
            .join(" ");

        const match = source.match(/(\d{3})/);

        return match
            ? match[1]
            : "";
    }

    function getCapacity(cat, x) {
        const roomNo = getRoomNo(x);

        // 자동차캠핑장은 4인
        if (cat.code === "1600") {
            return 4;
        }

        return ROOM_CAPACITY[cat.code]?.[roomNo] ?? null;
    }

    function makeRoomText(cat, x) {
        const roomName =
            String(x?.fcltyNm || "이름없음").trim();

        const capacity = getCapacity(cat, x);

        return capacity
            ? `${roomName}(${capacity}인)`
            : roomName;
    }

    // =========================================================
    // 알림음
    // =========================================================

    function beep() {
        try {
            new Audio(
                "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
            )
                .play()
                .catch(() => {});
        } catch (e) {}
    }

    // =========================================================
    // 출력 행 생성
    // =========================================================

    function buildRows(activeRecords, historyRecords) {
        const all = [
            ...activeRecords,
            ...historyRecords
        ];

        // 최소폭을 고정하여 조회 내용이 바뀌어도 구분선 위치가 흔들리지 않음
        const dateWidth = Math.max(
            12,
            displayWidth("날짜"),
            maxDisplayWidth(all.map(x => x.date))
        );

        const categoryWidth = Math.max(
            8,
            displayWidth("객실"),
            maxDisplayWidth(all.map(x => x.category))
        );

        const roomWidth = Math.max(
            9,
            displayWidth("호수"),
            maxDisplayWidth(all.map(x => x.room))
        );

        const detectedWidth = Math.max(
            13,
            displayWidth("감지"),
            maxDisplayWidth(all.map(x => x.detected))
        );

        const expectedWidth = Math.max(
            13,
            displayWidth("예상"),
            maxDisplayWidth(all.map(x => x.expected))
        );

        // 구분선 앞뒤 공백을 제거해 정보와 밀착시키고 전체 폭을 축소
        const separator = "│";

        // 헤더 시작 위치를 데이터 행의 "• " 다음 위치와 동일하게 맞춤
        const rowPrefix = "• ";
        const headerPrefix = " ".repeat(displayWidth(rowPrefix));

        const header =
            headerPrefix +
            centerDisplay("날짜", dateWidth) + separator +
            centerDisplay("객실", categoryWidth) + separator +
            centerDisplay("호수", roomWidth) + separator +
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

    // =========================================================
    // 화면 표시
    // =========================================================

    function showScreen(activeRecords, totalRequests) {
        const now = new Date();

        Object.keys(cancelDetectedTimes).forEach(key => {
            const item = cancelDetectedTimes[key];

            const detectTime = parseTimeToDate(
                item.detected
            );

            if (
                Number.isFinite(detectTime.getTime()) &&
                now - detectTime > 7200 * 1000
            ) {
                delete cancelDetectedTimes[key];
            }
        });

        const historyRecords = Object.values(
            cancelDetectedTimes
        ).map(item => ({
            date: item.date,
            category: item.category,
            room: item.room,
            detected: item.detected,
            expected: addTwoHours(item.detected)
        }));

        const rows = buildRows(
            activeRecords,
            historyRecords
        );

        console.clear();

        console.log(`
========================================================
⚡ 망상리조트 4구역×40일 취소 모니터링
⚡ 망상리조트 [4개 구역 X 40일 전체] 일괄 병렬 모니터링
대시보드 : ${DASHBOARD_URL}
감시 범위 : ${getFormattedDate(1)} ~ ${getFormattedDate(CONFIG.maxDays)}
동시 요청수 : 총 ${totalRequests}개 조합 / 조회 횟수 : ${count}회차
현재 시간 : ${nowText()}
이전 갱신 : ${previousRefreshTime}
최근 갱신 : ${currentRefreshTime}
스캔 시작 : ${scanStartTime ? scanStartTime.toLocaleTimeString() : "-"}
스캔 종료 : ${scanEndTime ? scanEndTime.toLocaleTimeString() : "-"}
스캔 소요 : ${scanDuration}초
다음 시작 : ${nextStartTime}
실제 주기 : ${cycleDuration}초
-------------------------------------------------------------
[1] 🚨 현재 취소 진행 시설
${rows.header}
${rows.activeLines.length
    ? rows.activeLines.join("\n")
    : "• 취소분 없음"}

[2] ⏱ 최초 감지 / 예상시간
${rows.header}
${rows.historyLines.length
    ? rows.historyLines.join("\n")
    : "-"}

명령 stopWatchAll()│resetCancelLog()
========================================================
`);
    }

    // =========================================================
    // 중지 / 기록 초기화
    // =========================================================

    async function reportToDashboard(activeRecords, phase, totalRequests) {
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

            const response = await fetch(`${DASHBOARD_URL}/api/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phase,
                    refreshedAt: new Date().toISOString(),
                    count,
                    totalRequests,
                    completedRequests: totalRequests,
                    failures: 0,
                    monitorError: "",
                    source: "campingkorea-console",
                    range: `${getFormattedDate(1)} ~ ${getFormattedDate(CONFIG.maxDays)}`,
                    intervalSec: CONFIG.intervalSec,
                    active,
                    available: []
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.warn("망상그곳 전송 실패:", error.message);
        }
    }

    window.stopWatchAll = function () {
        if (window.myWatchTimer) {
            clearTimeout(window.myWatchTimer);
        }

        window.myWatchTimer = null;
        isProcessing = false;

        console.log("🛑 모니터링 중지");
    };

    window.resetCancelLog = function () {
        Object.keys(cancelDetectedTimes).forEach(key => {
            delete cancelDetectedTimes[key];
        });

        console.log("🧹 감지 기록 초기화");
    };

    // =========================================================
    // 전체 일괄 스캔
    // =========================================================

    function batchCheckAll() {
        if (isProcessing) {
            return;
        }

        isProcessing = true;
        count++;

        scanStartTime = new Date();

        const promises = [];
        const activeRecords = [];

        for (
            let day = 1;
            day < CONFIG.maxDays;
            day++
        ) {
            const checkBeginDe =
                getFormattedDate(day);

            const checkEndDe =
                getFormattedDate(day + 1);

            CATEGORIES.forEach(cat => {
                const request = $.ajax({
                    url: CONFIG.url,
                    type: "POST",
                    dataType: "json",
                    cache: false,

                    data: {
                        trrsrtCode:
                            CONFIG.trrsrtCode,

                        fcltyCode:
                            cat.code,

                        resveNoCode:
                            CONFIG.resveNoCode,

                        resveBeginDe:
                            checkBeginDe,

                        resveEndDe:
                            checkEndDe
                    },

                    success: function (res) {
                        const list =
                            res?.value?.childFcltyList;

                        if (!Array.isArray(list)) {
                            return;
                        }

                        list.forEach(x => {
                            if (
                                !x ||
                                x.canclYn !== "N"
                            ) {
                                return;
                            }

                            const room =
                                makeRoomText(cat, x);

                            const key = [
                                checkBeginDe,
                                cat.code,
                                x.fcltyCode ||
                                x.fcltyNm ||
                                ""
                            ].join("|");

                            if (
                                !cancelDetectedTimes[key]
                            ) {
                                cancelDetectedTimes[key] = {
                                    date:
                                        `[${checkBeginDe}]`,

                                    category:
                                        cat.name,

                                    room,

                                    detected:
                                        nowText()
                                };

                                beep();
                            } else {
                                cancelDetectedTimes[key].room =
                                    room;
                            }

                            const detected =
                                cancelDetectedTimes[key]
                                    .detected;

                            activeRecords.push({
                                id:
                                    key,

                                rawDate:
                                    checkBeginDe,

                                date:
                                    `[${checkBeginDe}]`,

                                category:
                                    cat.name,

                                room,

                                detected,

                                expected:
                                    addTwoHours(detected),

                                fcltyCode:
                                    x.fcltyCode ||
                                    "-",

                                fcltyTyCode:
                                    x.fcltyTyCode ||
                                    "-",

                                resveNoCode:
                                    CONFIG.resveNoCode,

                                detectedAt:
                                    new Date().toISOString()
                            });
                        });
                    },

                    error: function () {}
                });

                promises.push(request);
            });
        }

        $.when
            .apply($, promises)
            .always(function () {
                scanEndTime =
                    new Date();

                scanDuration = (
                    (
                        scanEndTime -
                        scanStartTime
                    ) / 1000
                ).toFixed(2);

                cycleDuration = (
                    Number(scanDuration) +
                    CONFIG.intervalSec
                ).toFixed(2);

                previousRefreshTime =
                    currentRefreshTime;

                currentRefreshTime =
                    nowText();

                nextStartTime = new Date(
                    scanEndTime.getTime() +
                    CONFIG.intervalSec * 1000
                ).toLocaleTimeString("ko-KR");

                showScreen(
                    activeRecords,
                    promises.length
                );

                void reportToDashboard(
                    activeRecords,
                    "finished",
                    promises.length
                );

                isProcessing = false;

                window.myWatchTimer =
                    setTimeout(
                        batchCheckAll,
                        CONFIG.intervalSec * 1000
                    );
            });
    }

    // =========================================================
    // 시작
    // =========================================================

    console.clear();

    console.log(
        "🚀 [구분선 밀착 + 간격 축소 정렬] 모니터링 시작..."
    );

    batchCheckAll();
})();

