window.stopWatchAll && stopWatchAll();

(function () {
    "use strict";

    const DASHBOARD_URL = "https://go-mangsang.onrender.com";

    const CATEGORIES = [
        { code: "1300", name: "▶든바다", resveNoCodes: ["ME", "MC", "MA", "MG", "MD", "MB"] },
        { code: "1400", name: "▷난바다", resveNoCodes: ["MH", "MB", "MD", "MG", "MI"] },
        { code: "1500", name: "★허허바다", resveNoCodes: ["MI", "MF", "MC", "MD", "MB"] },
        { code: "1600", name: "☆자동차", resveNoCodes: ["RR"] }
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

    const ROOM_META = {
        "1300": {
            "DE101": { roomNo: "101", fcltyCode: "DE101", fcltyTyCode: "DEB_E2", resveNoCode: "ME" },
            "DE102": { roomNo: "102", fcltyCode: "DE102", fcltyTyCode: "DEB_E1", resveNoCode: "ME" },
            "DC103": { roomNo: "103", fcltyCode: "DC103", fcltyTyCode: "DEB_C0", resveNoCode: "MC" },
            "DA104": { roomNo: "104", fcltyCode: "DA104", fcltyTyCode: "DEB_A0", resveNoCode: "MA" },
            "DA105": { roomNo: "105", fcltyCode: "DA105", fcltyTyCode: "DEB_A0", resveNoCode: "MA" },
            "DG106": { roomNo: "106", fcltyCode: "DG106", fcltyTyCode: "DEB_G0", resveNoCode: "MG" },
            "DA107": { roomNo: "107", fcltyCode: "DA107", fcltyTyCode: "DEB_A0", resveNoCode: "MA" },
            "DA108": { roomNo: "108", fcltyCode: "DA108", fcltyTyCode: "DEB_A0", resveNoCode: "MA" },
            "DC109": { roomNo: "109", fcltyCode: "DC109", fcltyTyCode: "DEB_A1", resveNoCode: "MC" },
            "DE110": { roomNo: "110", fcltyCode: "DE110", fcltyTyCode: "DEB_A2", resveNoCode: "ME" },
            "DE111": { roomNo: "111", fcltyCode: "DE111", fcltyTyCode: "DEB_A3", resveNoCode: "ME" },
            "DD112": { roomNo: "112", fcltyCode: "DD112", fcltyTyCode: "DEB_A4", resveNoCode: "MD" },
            "DA113": { roomNo: "113", fcltyCode: "DA113", fcltyTyCode: "DEB_A5", resveNoCode: "MA" },
            "DA114": { roomNo: "114", fcltyCode: "DA114", fcltyTyCode: "DEB_A6", resveNoCode: "MA" },
            "DD115": { roomNo: "115", fcltyCode: "DD115", fcltyTyCode: "DEB_A7", resveNoCode: "MD" },
            "DC116": { roomNo: "116", fcltyCode: "DC116", fcltyTyCode: "DEB_A8", resveNoCode: "MC" },
            "DA117": { roomNo: "117", fcltyCode: "DA117", fcltyTyCode: "DEB_A9", resveNoCode: "MA" },
            "DA118": { roomNo: "118", fcltyCode: "DA118", fcltyTyCode: "DEB_A10", resveNoCode: "MA" },
            "DD119": { roomNo: "119", fcltyCode: "DD119", fcltyTyCode: "DEB_A11", resveNoCode: "MD" },
            "DB120": { roomNo: "120", fcltyCode: "DB120", fcltyTyCode: "DEB_A12", resveNoCode: "MB" },
            "DB121": { roomNo: "121", fcltyCode: "DB121", fcltyTyCode: "DEB_A13", resveNoCode: "MB" },
            "DB122": { roomNo: "122", fcltyCode: "DB122", fcltyTyCode: "DEB_A14", resveNoCode: "MB" },
            "DB123": { roomNo: "123", fcltyCode: "DB123", fcltyTyCode: "DEB_A15", resveNoCode: "MB" }
        },
        "1400": {
            "NF101": { roomNo: "101", fcltyCode: "NF101", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
            "NF102": { roomNo: "102", fcltyCode: "NF102", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
            "NF103": { roomNo: "103", fcltyCode: "NF103", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
            "NB104": { roomNo: "104", fcltyCode: "NB104", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
            "ND105": { roomNo: "105", fcltyCode: "ND105", fcltyTyCode: "NAB_D0", resveNoCode: "MD" },
            "NG106": { roomNo: "106", fcltyCode: "NG106", fcltyTyCode: "NAB_G0", resveNoCode: "MG" },
            "NB107": { roomNo: "107", fcltyCode: "NB107", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
            "NB108": { roomNo: "108", fcltyCode: "NB108", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
            "NF109": { roomNo: "109", fcltyCode: "NF109", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
            "NF110": { roomNo: "110", fcltyCode: "NF110", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
            "NB111": { roomNo: "111", fcltyCode: "NB111", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
            "NB112": { roomNo: "112", fcltyCode: "NB112", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
            "NF113": { roomNo: "113", fcltyCode: "NF113", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
            "NG114": { roomNo: "114", fcltyCode: "NG114", fcltyTyCode: "NAB_GU", resveNoCode: "MI" },
            "NG115": { roomNo: "115", fcltyCode: "NG115", fcltyTyCode: "NAB_GU", resveNoCode: "MI" }
        },
        "1500": {
            "HG101": { roomNo: "101", fcltyCode: "HG101", fcltyTyCode: "HHB_GU", resveNoCode: "MI" },
            "HE102": { roomNo: "102", fcltyCode: "HE102", fcltyTyCode: "HHB_E2", resveNoCode: "MF" },
            "HE103": { roomNo: "103", fcltyCode: "HE103", fcltyTyCode: "HHB_E2", resveNoCode: "MF" },
            "HC104": { roomNo: "104", fcltyCode: "HC104", fcltyTyCode: "HHB_C0", resveNoCode: "MC" },
            "HD105": { roomNo: "105", fcltyCode: "HD105", fcltyTyCode: "HHB_D0", resveNoCode: "MD" },
            "HB106": { roomNo: "106", fcltyCode: "HB106", fcltyTyCode: "HHB_B0", resveNoCode: "MB" },
            "HB107": { roomNo: "107", fcltyCode: "HB107", fcltyTyCode: "HHB_B0", resveNoCode: "MB" },
            "HG108": { roomNo: "108", fcltyCode: "HG108", fcltyTyCode: "HHB_GU", resveNoCode: "MI" }
        },
        "1600": Object.fromEntries(Array.from({ length: 41 }, (_, index) => {
            const no = String(index + 1);
            const code = String(1601 + index);
            return [code, { roomNo: no, fcltyCode: code, fcltyTyCode: "MA_001", resveNoCode: "RR" }];
        }))
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

    function getRoomMeta(cat, x, resveNoCode) {
        const code = String(x?.fcltyCode || "");
        const meta = ROOM_META[cat.code]?.[code];
        if (!meta || meta.resveNoCode !== resveNoCode) {
            return null;
        }
        return meta;
    }

    function getCapacity(cat, x, meta) {
        const roomNo = meta?.roomNo || getRoomNo(x);

        // 자동차캠핑장은 4인
        if (cat.code === "1600") {
            return 4;
        }

        return ROOM_CAPACITY[cat.code]?.[roomNo] ?? null;
    }

    function makeRoomText(cat, x, meta) {
        const roomName =
            String(x?.fcltyNm || "이름없음").trim();

        const capacity = getCapacity(cat, x, meta);

        return capacity
            ? `${roomName}(${capacity}인)`
            : roomName;
    }

    function isCancelingItem(x) {
        return x && x.canclYn === "N";
    }

    function isAvailableItem(x) {
        if (!x) {
            return false;
        }

        return (
            x.resveAt === "Y" &&
            x.resveYn === "Y" &&
            x.preocpcYn === "Y" &&
            x.imprtyYn === "N" &&
            x.canclYn === "Y"
        );
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

    async function reportToDashboard(activeRecords, availableRecords, phase, totalRequests, failures) {
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
                    completedRequests: totalRequests,
                    failures,
                    monitorError: "",
                    source: "campingkorea-console",
                    range: `${getFormattedDate(1)} ~ ${getFormattedDate(CONFIG.maxDays)}`,
                    intervalSec: CONFIG.intervalSec,
                    active,
                    available
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
        const availableRecords = [];
        let failures = 0;

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
                const resveNoCodes =
                    Array.isArray(cat.resveNoCodes) && cat.resveNoCodes.length
                        ? cat.resveNoCodes
                        : [CONFIG.resveNoCode];

                resveNoCodes.forEach(resveNoCode => {
                const request = new Promise(resolve => {
                    $.ajax({
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
                                resveNoCode,

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
                                const meta =
                                    getRoomMeta(cat, x, resveNoCode);

                                if (ROOM_META[cat.code] && !meta) {
                                    return;
                                }

                                const room =
                                    makeRoomText(cat, x, meta);

                                const key = [
                                    checkBeginDe,
                                    cat.code,
                                    resveNoCode,
                                    x.fcltyCode ||
                                    x.fcltyNm ||
                                    ""
                                ].join("|");

                                if (isAvailableItem(x)) {
                                    availableRecords.push({
                                        id:
                                            key,

                                        rawDate:
                                            checkBeginDe,

                                        date:
                                            `[${checkBeginDe}]`,

                                        category:
                                            cat.name,

                                        room,

                                        fcltyCode:
                                            x.fcltyCode || "",

                                        fcltyTyCode:
                                            x.fcltyTyCode || meta?.fcltyTyCode || "",

                                        resveNoCode:
                                            x.resveNoCode || meta?.resveNoCode || resveNoCode,

                                        detectedAt:
                                            new Date().toISOString()
                                    });
                                }

                                if (!isCancelingItem(x)) {
                                    return;
                                }

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
                                        x.fcltyCode || "",

                                    fcltyTyCode:
                                        x.fcltyTyCode || meta?.fcltyTyCode || "",

                                    resveNoCode:
                                        x.resveNoCode || meta?.resveNoCode || resveNoCode,

                                    detectedAt:
                                        new Date().toISOString()
                                });
                            });
                        },

                        error: function () {
                            failures++;
                        },

                        complete: function () {
                            resolve();
                        }
                    });
                });

                promises.push(request);
                });
            });
        }

        Promise.all(promises)
            .then(function () {
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
                    availableRecords,
                    "finished",
                    promises.length,
                    failures
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

