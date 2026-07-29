"use strict";

const CAMPING_ORIGIN = "https://www.campingkorea.or.kr";
const CAMPING_HOME_URL = `${CAMPING_ORIGIN}/index.do`;
const CAMPING_URL = `${CAMPING_ORIGIN}/user/reservation/ND_selectChildFcltyList.do`;

const CATEGORIES = [
  { code: "1300", name: "든바다", resveNoCodes: ["ME", "MC", "MA", "MG", "MD", "MB"] },
  { code: "1400", name: "난바다", resveNoCodes: ["MH", "MB", "MD", "MG", "MI"] },
  { code: "1500", name: "허허바다", resveNoCodes: ["MI", "MF", "MC", "MD", "MB"] },
  { code: "1600", name: "자동차캠핑장", resveNoCodes: ["RR"] }
];

const CONFIG = {
  trrsrtCode: "1000",
  maxDays: Number(process.env.MONITOR_DAYS || 30),
  intervalSec: Number(process.env.MONITOR_INTERVAL_SEC || 5),
  concurrency: Number(process.env.MONITOR_CONCURRENCY || 6),
  requestGapMs: Number(process.env.MONITOR_REQUEST_GAP_MS || 80),
  timeoutMs: Number(process.env.MONITOR_TIMEOUT_MS || 15000)
};

let cookieJar = "";

function setCookieValues(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function storeCookies(headers) {
  const cookies = new Map(
    cookieJar
      .split(";")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf("=");
        return [part.slice(0, index), part.slice(index + 1)];
      })
  );

  for (const raw of setCookieValues(headers)) {
    const [pair] = String(raw).split(";");
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }

  cookieJar = Array.from(cookies, ([key, value]) => `${key}=${value}`).join("; ");
}

async function ensureSession() {
  if (cookieJar) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

  try {
    const response = await fetch(CAMPING_HOME_URL, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
      },
      signal: controller.signal
    });
    storeCookies(response.headers);
  } finally {
    clearTimeout(timeout);
  }
}

const ROOM_META = {
  "1300": {
    DE101: { roomNo: "101", fcltyCode: "DE101", fcltyTyCode: "DEB_E2", resveNoCode: "ME" },
    DE102: { roomNo: "102", fcltyCode: "DE102", fcltyTyCode: "DEB_E1", resveNoCode: "ME" },
    DC103: { roomNo: "103", fcltyCode: "DC103", fcltyTyCode: "DEB_C0", resveNoCode: "MC" },
    DA104: { roomNo: "104", fcltyCode: "DA104", fcltyTyCode: "DEB_A0", resveNoCode: "MA" },
    DA105: { roomNo: "105", fcltyCode: "DA105", fcltyTyCode: "DEB_A0", resveNoCode: "MA" },
    DG106: { roomNo: "106", fcltyCode: "DG106", fcltyTyCode: "DEB_G0", resveNoCode: "MG" },
    DA107: { roomNo: "107", fcltyCode: "DA107", fcltyTyCode: "DEB_A0", resveNoCode: "MA" },
    DA108: { roomNo: "108", fcltyCode: "DA108", fcltyTyCode: "DEB_A0", resveNoCode: "MA" },
    DC109: { roomNo: "109", fcltyCode: "DC109", fcltyTyCode: "DEB_A1", resveNoCode: "MC" },
    DE110: { roomNo: "110", fcltyCode: "DE110", fcltyTyCode: "DEB_A2", resveNoCode: "ME" },
    DE111: { roomNo: "111", fcltyCode: "DE111", fcltyTyCode: "DEB_A3", resveNoCode: "ME" },
    DD112: { roomNo: "112", fcltyCode: "DD112", fcltyTyCode: "DEB_A4", resveNoCode: "MD" },
    DA113: { roomNo: "113", fcltyCode: "DA113", fcltyTyCode: "DEB_A5", resveNoCode: "MA" },
    DA114: { roomNo: "114", fcltyCode: "DA114", fcltyTyCode: "DEB_A6", resveNoCode: "MA" },
    DD115: { roomNo: "115", fcltyCode: "DD115", fcltyTyCode: "DEB_A7", resveNoCode: "MD" },
    DC116: { roomNo: "116", fcltyCode: "DC116", fcltyTyCode: "DEB_A8", resveNoCode: "MC" },
    DA117: { roomNo: "117", fcltyCode: "DA117", fcltyTyCode: "DEB_A9", resveNoCode: "MA" },
    DA118: { roomNo: "118", fcltyCode: "DA118", fcltyTyCode: "DEB_A10", resveNoCode: "MA" },
    DD119: { roomNo: "119", fcltyCode: "DD119", fcltyTyCode: "DEB_A11", resveNoCode: "MD" },
    DB120: { roomNo: "120", fcltyCode: "DB120", fcltyTyCode: "DEB_A12", resveNoCode: "MB" },
    DB121: { roomNo: "121", fcltyCode: "DB121", fcltyTyCode: "DEB_A13", resveNoCode: "MB" },
    DB122: { roomNo: "122", fcltyCode: "DB122", fcltyTyCode: "DEB_A14", resveNoCode: "MB" },
    DB123: { roomNo: "123", fcltyCode: "DB123", fcltyTyCode: "DEB_A15", resveNoCode: "MB" }
  },
  "1400": {
    NF101: { roomNo: "101", fcltyCode: "NF101", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
    NF102: { roomNo: "102", fcltyCode: "NF102", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
    NF103: { roomNo: "103", fcltyCode: "NF103", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
    NB104: { roomNo: "104", fcltyCode: "NB104", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
    ND105: { roomNo: "105", fcltyCode: "ND105", fcltyTyCode: "NAB_D0", resveNoCode: "MD" },
    NG106: { roomNo: "106", fcltyCode: "NG106", fcltyTyCode: "NAB_G0", resveNoCode: "MG" },
    NB107: { roomNo: "107", fcltyCode: "NB107", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
    NB108: { roomNo: "108", fcltyCode: "NB108", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
    NF109: { roomNo: "109", fcltyCode: "NF109", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
    NF110: { roomNo: "110", fcltyCode: "NF110", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
    NB111: { roomNo: "111", fcltyCode: "NB111", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
    NB112: { roomNo: "112", fcltyCode: "NB112", fcltyTyCode: "NAB_B0", resveNoCode: "MB" },
    NF113: { roomNo: "113", fcltyCode: "NF113", fcltyTyCode: "NAB_F2", resveNoCode: "MH" },
    NG114: { roomNo: "114", fcltyCode: "NG114", fcltyTyCode: "NAB_GU", resveNoCode: "MI" },
    NG115: { roomNo: "115", fcltyCode: "NG115", fcltyTyCode: "NAB_GU", resveNoCode: "MI" }
  },
  "1500": {
    HG101: { roomNo: "101", fcltyCode: "HG101", fcltyTyCode: "HHB_GU", resveNoCode: "MI" },
    HE102: { roomNo: "102", fcltyCode: "HE102", fcltyTyCode: "HHB_E2", resveNoCode: "MF" },
    HE103: { roomNo: "103", fcltyCode: "HE103", fcltyTyCode: "HHB_E2", resveNoCode: "MF" },
    HC104: { roomNo: "104", fcltyCode: "HC104", fcltyTyCode: "HHB_C0", resveNoCode: "MC" },
    HD105: { roomNo: "105", fcltyCode: "HD105", fcltyTyCode: "HHB_D0", resveNoCode: "MD" },
    HB106: { roomNo: "106", fcltyCode: "HB106", fcltyTyCode: "HHB_B0", resveNoCode: "MB" },
    HB107: { roomNo: "107", fcltyCode: "HB107", fcltyTyCode: "HHB_B0", resveNoCode: "MB" },
    HG108: { roomNo: "108", fcltyCode: "HG108", fcltyTyCode: "HHB_GU", resveNoCode: "MI" }
  },
  "1600": Object.fromEntries(Array.from({ length: 41 }, (_, index) => {
    const no = String(index + 1);
    const code = String(1601 + index);
    return [code, { roomNo: no, fcltyCode: code, fcltyTyCode: "MA_001", resveNoCode: "RR" }];
  }))
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function getFormattedDate(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

function normalizeFlag(value) {
  return String(value ?? "").trim().toUpperCase();
}

function isYes(value) {
  return value === true || ["Y", "YES", "TRUE", "1"].includes(normalizeFlag(value));
}

function isNo(value) {
  return value === false || ["N", "NO", "FALSE", "0"].includes(normalizeFlag(value));
}

function isCancelingItem(item) {
  return item && isNo(item.canclYn);
}

function isAvailableItem(item) {
  return (
    item &&
    isYes(item.resveAt) &&
    isYes(item.resveYn) &&
    isYes(item.preocpcYn) &&
    isNo(item.imprtyYn) &&
    isYes(item.canclYn)
  );
}

function roomName(category, item, meta) {
  if (meta?.roomNo) return `${meta.roomNo}${category.code === "1600" ? "번" : "호"}`;
  const text = String(item?.fcltyNm || item?.roomName || "").trim();
  if (text) return text;
  const match = String(item?.fcltyCode || "").match(/(\d{1,3})$/);
  return match ? `${Number(match[1])}${category.code === "1600" ? "번" : "호"}` : "객실";
}

function itemId(job, item, meta) {
  return [
    job.checkBeginDe,
    job.category.code,
    job.resveNoCode,
    item?.fcltyCode || meta?.fcltyCode || item?.fcltyNm || ""
  ].join("|");
}

async function requestJob(job) {
  await ensureSession();

  const body = new URLSearchParams({
    trrsrtCode: CONFIG.trrsrtCode,
    fcltyCode: job.category.code,
    resveNoCode: job.resveNoCode,
    resveBeginDe: job.checkBeginDe,
    resveEndDe: job.checkEndDe
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

  try {
    let text = "";
    let response = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(CAMPING_URL, {
        method: "POST",
        headers: {
          accept: "application/json, text/javascript, */*; q=0.01",
          "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          cookie: cookieJar,
          origin: CAMPING_ORIGIN,
          referer: CAMPING_HOME_URL,
          "x-requested-with": "XMLHttpRequest",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
        },
        body,
        signal: controller.signal
      });
      storeCookies(response.headers);
      text = await response.text();
      if (!text.trim().startsWith("<")) break;
      cookieJar = "";
      await ensureSession();
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = JSON.parse(text);
    const list = payload?.value?.childFcltyList;
    return Array.isArray(list) ? list : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function runPool(jobs, handler) {
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      await handler(job);
      if (cursor < jobs.length) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.requestGapMs));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONFIG.concurrency, jobs.length) }, worker));
}

function createJobs() {
  const jobs = [];
  for (let day = 0; day < CONFIG.maxDays; day += 1) {
    const checkBeginDe = getFormattedDate(day);
    const checkEndDe = getFormattedDate(day + 1);
    for (const category of CATEGORIES) {
      for (const resveNoCode of category.resveNoCodes) {
        jobs.push({ category, resveNoCode, checkBeginDe, checkEndDe });
      }
    }
  }
  return jobs;
}

function createRenderMonitor({ applyReportPayload }) {
  let timer = null;
  let running = false;
  let cycle = 0;

  async function scanOnce() {
    if (running) return;
    running = true;

    const jobs = createJobs();
    const active = [];
    const available = [];
    const errors = [];

    try {
      await runPool(jobs, async job => {
        try {
          const list = await requestJob(job);
          for (const item of list) {
            const code = String(item?.fcltyCode || "");
            const codeMeta = ROOM_META[job.category.code]?.[code] || null;
            if (codeMeta && codeMeta.resveNoCode !== job.resveNoCode) continue;
            const meta = codeMeta || null;
            const common = {
              id: itemId(job, item, meta),
              date: job.checkBeginDe,
              category: job.category.name,
              roomName: roomName(job.category, item, meta),
              fcltyCode: item?.fcltyCode || meta?.fcltyCode || "",
              fcltyTyCode: item?.fcltyTyCode || meta?.fcltyTyCode || "",
              resveNoCode: item?.resveNoCode || meta?.resveNoCode || job.resveNoCode,
              detectedAt: new Date().toISOString()
            };
            if (isAvailableItem(item)) available.push(common);
            if (isCancelingItem(item)) active.push(common);
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      });

      const failures = errors.length;
      await applyReportPayload({
        phase: "finished",
        refreshedAt: new Date().toISOString(),
        count: ++cycle,
        totalRequests: jobs.length,
        completedRequests: jobs.length - failures,
        failures,
        monitorError: failures ? [...new Set(errors)].slice(0, 3).join(" / ") : "",
        source: "render-monitor",
        range: `${getFormattedDate(0)} ~ ${getFormattedDate(CONFIG.maxDays - 1)}`,
        intervalSec: CONFIG.intervalSec,
        active,
        available
      });
    } finally {
      running = false;
      timer = setTimeout(scanOnce, CONFIG.intervalSec * 1000);
    }
  }

  return {
    start() {
      if (timer || running) return;
      timer = setTimeout(scanOnce, 1000);
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      running = false;
    }
  };
}

module.exports = { createRenderMonitor };
