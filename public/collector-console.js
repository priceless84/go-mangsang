window.stopWatchAll && stopWatchAll();

(function () {
    const DASHBOARD_URL = "https://go-mangsang.onrender.com";

    const CATEGORIES = [
        { code: "1300", name: "든바다" },
        { code: "1400", name: "난바다" },
        { code: "1500", name: "허허바다" },
        { code: "1600", name: "자동차" }
    ];

    const CONFIG = {
        url: "/user/reservation/ND_selectChildFcltyList.do",
        trrsrtCode: "1000",
        resveNoCode: "MA",
        maxDays: 40,
        intervalSec: 5,
        requestTimeoutMs: 9000,
        concurrency: 12
    };

    let count = 0;
    let isProcessing = false;
    let previousRefreshTime = "-";
    let currentRefreshTime = "-";
    let completedRequests = 0;
    let totalRequests = 0;

    const cancelDetectedTimes = {};
    window.myWatchTimer = null;

    function getFormattedDate(daysOffset) {
        const date = new Date();
        date.setDate(date.getDate() + daysOffset);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function nowText() {
        return new Date().toLocaleTimeString();
    }

    function displayWidth(value) {
        return [...String(value)].reduce((width, ch) => width + (/[^\u0000-\u00ff]/.test(ch) ? 2 : 1), 0);
    }

    function padDisplay(value, targetWidth) {
        const text = String(value ?? "");
        return text + " ".repeat(Math.max(0, targetWidth - displayWidth(text)));
    }

    function beep() {
        try {
            new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg").play();
        } catch (e) {}
    }

    function pickFirstValue(obj, keys) {
        if (!obj || typeof obj !== "object") return "";
        for (const key of keys) {
            if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
        }
        return "";
    }

    function getActualResveNoCode(site, res) {
        return pickFirstValue(site, [
            "resveNoCode",
            "resveNoCd",
            "resveNo",
            "resveCode",
            "resveSeCode",
            "resveClCode",
            "fcltyResveNoCode",
            "fcltyResveCode",
            "resveTyCode",
            "resveTypeCode"
        ]) || pickFirstValue(res?.value, [
            "resveNoCode",
            "resveNoCd",
            "resveNo",
            "resveCode",
            "resveSeCode",
            "resveClCode"
        ]) || CONFIG.resveNoCode;
    }

    function buildItem(x, cat, checkBeginDe, res) {
        return {
            id: `${checkBeginDe}|${cat.code}|${x.fcltyCode || ""}|${x.fcltyNm || ""}`,
            date: checkBeginDe,
            category: cat.name,
            roomName: x.fcltyNm || "이름없음",
            fcltyCode: x.fcltyCode || "-",
            fcltyTyCode: x.fcltyTyCode || "-",
            resveNoCode: String(getActualResveNoCode(x, res) || "-"),
            detectedAt: new Date().toISOString()
        };
    }

    function itemToLogLine(item) {
        const dateCol = padDisplay(`[${item.date}]`, 14);
        const catCol = padDisplay(item.category, 8);
        const nameCol = padDisplay(item.roomName, 10);
        const codeCol = `(${padDisplay(item.fcltyCode, 8)} / ${padDisplay(item.fcltyTyCode, 10)} / ${item.resveNoCode})`;
        return `${dateCol} │ ${catCol} │ ${nameCol} ${codeCol}`;
    }

    function showScreen(activeItems) {
        const activeCancels = activeItems.map(item => `• ${itemToLogLine(item)}`);

        console.clear();
        console.log(`
=============================================================
⚡ 망상리조트 [4개 구역 X 40일 전체] 모니터링 + 서버 대시보드
대시보드 : ${DASHBOARD_URL}
감시 범위 : ${getFormattedDate(1)} ~ ${getFormattedDate(CONFIG.maxDays)}
진행 상태 : ${completedRequests} / ${totalRequests} 요청 완료
조회 횟수 : ${count}회차
현재 시간 : ${nowText()}
이전 갱신 : ${previousRefreshTime}
최근 갱신 : ${currentRefreshTime}
-------------------------------------------------------------
[1] 🚨 현재 실시간 취소 진행 중인 시설
${activeCancels.length ? activeCancels.join("\n") : "• 현재 대기 중... (취소분 없음)"}

[2] ⏱️ 취소 시설별 최초 감지 기록 누적
${Object.keys(cancelDetectedTimes).length
    ? Object.entries(cancelDetectedTimes).map(([k, t]) => `• ${k} │ ⏱ ${t} 최초감지`).join("\n")
    : "-"}

명령어: 중지 -> stopWatchAll() | 기록리셋 -> resetCancelLog()
=============================================================
`);
    }

    async function reportToDashboard(activeItems, phase) {
        try {
            const res = await fetch(`${DASHBOARD_URL}/api/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phase,
                    refreshedAt: new Date().toISOString(),
                    count,
                    totalRequests,
                    completedRequests,
                    range: `${getFormattedDate(1)} ~ ${getFormattedDate(CONFIG.maxDays)}`,
                    intervalSec: CONFIG.intervalSec,
                    active: activeItems
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
                success: function (res) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve({ ok: true, res });
                },
                error: function (xhr, status, error) {
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

        const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
        await Promise.all(workers);
    }

    window.stopWatchAll = function () {
        window.__mangsangStopRequested = true;
        clearTimeout(window.myWatchTimer);
        window.myWatchTimer = null;
        isProcessing = false;
        console.log("🛑 40일 모니터링이 중지되었습니다.");
    };

    window.resetCancelLog = function () {
        Object.keys(cancelDetectedTimes).forEach(key => delete cancelDetectedTimes[key]);
        console.log("🧹 취소 감지 누적 기록이 초기화되었습니다.");
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

        const tasks = [];
        const activeItems = [];

        for (let day = 1; day < CONFIG.maxDays; day++) {
            const checkBeginDe = getFormattedDate(day);
            const checkEndDe = getFormattedDate(day + 1);

            CATEGORIES.forEach(cat => {
                tasks.push(async () => {
                    const result = await ajaxWithTimeout({
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
                        }
                    }, CONFIG.requestTimeoutMs);

                    completedRequests++;

                    const list = result.res?.value?.childFcltyList;
                    if (!Array.isArray(list)) return;

                    list.forEach(x => {
                        if (x && x.canclYn === "N") {
                            const item = buildItem(x, cat, checkBeginDe, result.res);
                            activeItems.push(item);

                            const logKey = itemToLogLine(item);
                            if (!cancelDetectedTimes[logKey]) {
                                cancelDetectedTimes[logKey] = nowText();
                                beep();
                            }
                        }
                    });
                });
            });
        }

        totalRequests = tasks.length;
        previousRefreshTime = currentRefreshTime;
        currentRefreshTime = nowText();

        showScreen(activeItems);
        await reportToDashboard(activeItems, "started");

        await runLimited(tasks, CONFIG.concurrency, async () => {
            if (completedRequests === 1 || completedRequests % 20 === 0 || completedRequests === totalRequests) {
                currentRefreshTime = nowText();
                showScreen(activeItems);
                await reportToDashboard(activeItems, "progress");
            }
        });

        currentRefreshTime = nowText();
        showScreen(activeItems);
        await reportToDashboard(activeItems, "finished");

        isProcessing = false;
        if (!window.__mangsangStopRequested) {
            window.myWatchTimer = setTimeout(batchCheckAll, CONFIG.intervalSec * 1000);
        }
    }

    console.clear();
    console.log("🚀 4개 구역 X 40일치 전체 일정 스캔 + 서버 대시보드 시작...");
    batchCheckAll();
})();

