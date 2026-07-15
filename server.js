1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
229
230
231
232
233
234
235
236
237
238
239
240
241
242
243
244
245
246
247
248
249
250
251
252
253
254
255
256
257
258
259
260
261
262
263
264
265
266
267
268
269
270
271
272
273
274
275
276
277
278
279
280
281
282
283
284
285
286
287
288
289
290
291
292
293
294
295
296
297
298
299
300
301
302
303
304
305
306
307
308
309
310
311
312
313
314
315
316
317
318
319
320
321
322
323
324
325
326
327
328
329
330
331
332
333
334
335
336
337
338
339
340
341
342
343
344
345
346
347
348
349
350
351
352
353
354
355
356
357
358
359
360
361
362
363
364
365
366
367
368
369
370
371
372
373
374
375
376
377
378
379
380
381
382
383
384
385
386
387
388
389
390
391
392
393
394
395
396
397
398
399
400
401
402
403
404
405
406
407
408
409
410
411
412
413
414
415
416
417
418
419
420
421
422
423
424
425
426
427
428
429
430
431
432
433
434
435
436
437
438
439
440
441
442
443
444
445
446
447
448
449
450
451
452
453
454
455
456
457
458
459
460
461
462
463
464
465
466
467
468
469
470
471
472
473
474
475
476
477
478
479
480
481
482
483
484
485
486
487
488
489
490
491
492
493
494
495
496
497
498
499
500
501
502
503
504
505
506
507
508
509
510
511
512
513
514
515
516
517
518
519
520
521
522
523
524
525
526
527
528
529
530
531
532
533
534
535
536
537
538
539
540
541
542
543
544
545
546
547
548
549
550
551
552
553
554
555
556
557
558
559
560
561
562
563
564
565
566
567
568
569
570
571
572
573
574
575
576
577
578
579
580
581
582
583
584
585
586
587
588
589
590
591
592
593
594
595
596
597
598
599
600
601
602
603
604
605
606
607
608
609
610
611
612
613
614
615
616
617
618
619
620
621
622
623
624
625
626
627
628
629
630
631
632
633
634
635
636
637
638
639
640
641
642
643
644
645
646
647
648
649
650
651
652
653
654
655
656
657
"use strict";




const http = require("http");
const fs = require("fs");
const path = require("path");




const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, "public"))
  ? path.join(__dirname, "public")
  : __dirname;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "events.json");
const ACTIVE_FILE = path.join(DATA_DIR, "active.json");
const MAX_EVENTS = 2000;
const CONFIG_PASSWORD = process.env.CONFIG_PASSWORD || "6185";
const STATE_SIGNAL_URL = process.env.STATE_SIGNAL_URL || "https://mangsang-alarm-dashboard.onrender.com/api/state";
const LOCAL_REPORT_FRESH_MS = 180 * 1000;
const UI_FIX_CSS = String.raw`
<style id="codex-ui-fixes">
#activeRows .grid-head,
#activeRows .grid-row,
#firstRows.history-grid .grid-head,
#firstRows.history-grid .grid-row {
  grid-template-columns: 50px 62px 46px 48px 62px minmax(92px, 1fr) !important;
  justify-content: stretch !important;
  gap: 5px !important;
  align-items: center !important;
}
#activeRows .grid-head > *, #activeRows .grid-row > *, #firstRows.history-grid .grid-head > *, #firstRows.history-grid .grid-row > * {
  min-width: 0 !important; max-width: 100% !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; text-align: center !important;
}
#activeRows .grid-row .remaining-soon, #activeRows .grid-row span.remaining-soon, .grid-row .remaining-soon, .grid-row span.remaining-soon {
  display: inline-flex !important; align-items: center !important; justify-content: center !important; min-width: 58px !important; min-height: 26px !important; padding: 4px 7px !important; border-radius: 999px !important; background: #d40000 !important; color: #fff !important; font-weight: 950 !important; box-shadow: 0 0 0 2px rgba(212, 0, 0, .12) !important;
}
.facility-status-box { width: 100%; min-height: 54px; border-radius: 2px; background: #000; margin: 0 0 8px; }
.facility-status-box[hidden] { display: none !important; }
#firstRows.history-grid .grid-head span:nth-child(5), #firstRows.history-grid .grid-row span:nth-child(5), #firstRows.history-grid .grid-head span:nth-child(6), #firstRows.history-grid .grid-row span:nth-child(6) { grid-column: auto !important; text-align: center !important; }
#firstRows.history-grid .grid-row .history-kind, #firstRows.history-grid .grid-row span:nth-child(5).history-kind {
  display: inline-flex !important; align-items: center !important; justify-content: center !important; min-width: 0 !important; width: 100% !important; min-height: 26px !important; padding: 0 2px !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; color: #a36300 !important; font-family: var(--sans) !important; font-size: 12px !important; font-weight: 900 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: clip !important;
}
#firstRows.history-grid .grid-row .history-kind.available, #firstRows.history-grid .grid-row span:nth-child(5).history-kind.available { background: transparent !important; color: #08783f !important; }
#firstRows.history-grid .grid-row .history-status {
  display: flex !important; align-items: center !important; justify-content: center !important; min-height: 34px !important; padding: 0 4px !important; border: 0 !important; background: transparent !important; color: #17211b !important; font-family: var(--sans) !important; font-size: 12px !important; font-weight: 850 !important; line-height: 1.2 !important; white-space: normal !important; word-break: keep-all !important; overflow-wrap: anywhere !important;
}
@media (min-width: 760px) { #activeRows .grid-head, #activeRows .grid-row, #firstRows.history-grid .grid-head, #firstRows.history-grid .grid-row { grid-template-columns: 96px 124px 78px 90px 116px minmax(170px, 1fr) !important; gap: 8px !important; } #firstRows.history-grid .grid-row .history-status { font-size: 13px !important; padding: 0 8px !important; } .facility-status-box { min-height: 64px; } }
@media (max-width: 759px) { .facility-status-box { min-height: 42px; } }
</style>
<script id="codex-facility-status-box" defer>
(() => {
  function valueOf(v) { return String(v || "").trim(); }
  function joined(item) { return [item?.event_type, item?.eventType, item?.kind, item?.status, item?.state, item?.message].map(valueOf).join(" "); }
  function isAvailable(item) { return /available|예약\s*가능|예약가능|예약\s*마감|Y/i.test(joined(item)); }
  function isEnded(item) { return /종료|ended|closed|finish|complete/i.test([item?.state, item?.status, item?.message].map(valueOf).join(" ")); }
  function installStatusOverrides() {
    window.historyKind = function historyKind(item) { return isAvailable(item) ? "예약가능" : "취소중"; };
    window.historyKindClass = function historyKindClass(item) { return isAvailable(item) ? "history-kind available" : "history-kind canceling"; };
    window.statusText = function statusText(item) {
      const state = valueOf(item?.state), status = valueOf(item?.status), message = valueOf(item?.message);
      const combined = [state, status, message].filter(Boolean).join(" ");
      const endMatch = combined.match(/종료\s*(?:→|->|-)?\s*([^,|]*)/);
      if (endMatch) { const tail = valueOf(endMatch[1]); return tail ? "종료 → " + tail : "종료"; }
      if (isEnded(item)) return "종료";
      if (isAvailable(item)) return "종료 → 예약 가능";
      if (state && !/^[NY]$/i.test(state) && !/canceling|available/i.test(state)) return state;
      if (status && !/^[NY]$/i.test(status) && !/canceling|available/i.test(status)) return status;
      return "발생";
    };
    if (typeof window.render === "function") window.render();
  }
  function insertFacilityBox() { if (document.querySelector(".facility-status-box")) return; const titles = Array.from(document.querySelectorAll(".field-title")); const facilityTitle = titles.find(title => (title.textContent || "").includes("시설명")); if (!facilityTitle) return; const box = document.createElement("div"); box.className = "facility-status-box"; box.setAttribute("aria-label", "상태 표시 박스"); facilityTitle.insertAdjacentElement("afterend", box); }
  function boot() { installStatusOverrides(); insertFacilityBox(); setTimeout(installStatusOverrides, 1000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
</script>`;




const state = {
  startedAt: new Date().toISOString(),
  lastReportAt: null,
  lastRefreshAt: null,
  previousRefreshAt: null,
  config: {
    intervalSec: 60
  },
  monitor: {
    count: 0,
    totalRequests: 0,
    activeCount: 0,
    range: "-",
    intervalSec: 60,
    source: "pc-local"
  },
  heartbeat: null,
  active: [],
  events: []
};




let monitorError = "";
let lastStateSyncAt = 0;




function lastReportAgeMs() {
  const time = new Date(state.lastReportAt || 0).getTime();
  return Number.isFinite(time) ? Date.now() - time : Infinity;
}




function hasFreshLocalReport() {
  return state.monitor.source === "reservation-console" && lastReportAgeMs() <= LOCAL_REPORT_FRESH_MS;
}




function normalizeIntervalSec(value) {
  const sec = Number(value);
  return [10, 30, 60, 300].includes(sec) ? sec : 60;
}




function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
  if (!fs.existsSync(ACTIVE_FILE)) fs.writeFileSync(ACTIVE_FILE, "[]", "utf8");
}




function loadEvents() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (Array.isArray(parsed)) state.events = parsed.slice(-MAX_EVENTS);
  } catch {
    state.events = [];
  }
  try {
    const parsedActive = JSON.parse(fs.readFileSync(ACTIVE_FILE, "utf8"));
    if (Array.isArray(parsedActive)) state.active = parsedActive.map(normalizeItem);
  } catch {
    state.active = [];
  }
}




function saveEvents() {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state.events.slice(-MAX_EVENTS), null, 2), "utf8");
}




function saveActive() {
  ensureDataFile();
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify(state.active, null, 2), "utf8");
}




function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}




function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}




function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}




function normalizeCategoryName(value) {
  const name = String(value || "-").trim();
  if (name === "1600") return "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5";
  if (name === "1500") return "\ud5c8\ud5c8\ubc14\ub2e4";
  if (name === "1400") return "\ub09c\ubc14\ub2e4";
  if (name === "1300") return "\ub4e0\ubc14\ub2e4";
  if (name.includes("\uc790\ub3d9\ucc28") || name.includes("\ucea0\ud551")) {
    return "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5";
  }
  if (name.includes("\ud5c8\ud5c8")) return "\ud5c8\ud5c8\ubc14\ub2e4";
  if (name.includes("\ub09c\ubc14\ub2e4")) return "\ub09c\ubc14\ub2e4";
  if (name.includes("\ub4e0\ubc14\ub2e4")) return "\ub4e0\ubc14\ub2e4";
  return name;
}




function normalizeCategoryFromItem(item) {
  const candidates = [
    item.category,
    item.categoryCode,
    item.catCode,
    item.catName,
    item.fcltyCategory,
    item.facility,
    item.facilityName,
    item.fcltyNm,
    item.fcltyCode,
    item.fcltyTyCode,
    item.facilityCode,
    item.facilityTypeCode,
    item.roomName,
    item.room_name,
    item.room,
    item.name,
    item.nameCol,
    item.message,
    item.raw
  ];
  for (const value of candidates) {
    const normalized = normalizeCategoryName(value);
    if (["\ub4e0\ubc14\ub2e4", "\ub09c\ubc14\ub2e4", "\ud5c8\ud5c8\ubc14\ub2e4", "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5"].includes(normalized)) {
      return normalized;
    }
  }
  return normalizeCategoryName(item.category || item.name || item.facility || "-");
}




function normalizeRoomName(value, category) {
  const text = String(value || "-").trim();
  if (category === "\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5") {
    return text.replace(/^\uc790\ub3d9\ucc28\ucea0\ud551\uc7a5\s*/, "");
  }
  return text;
}




function normalizeItem(item) {
  const category = normalizeCategoryFromItem(item);
  const roomName = normalizeRoomName(item.roomName || item.room_name || item.room || item.fcltyNm || item.nameCol, category);
  const rawStatus = String(item.status || item.canclYn || item.state || "").trim();
  const rawEventType = String(item.event_type || item.eventType || "").trim();
  const rawMessage = String(item.message || "").trim();
  const inferredAvailable = /available|예약\s*가능|예약가능|예약\s*마감|Y/i.test([rawEventType, rawStatus, rawMessage].join(" "));
  const inferredEventType = rawEventType || (inferredAvailable ? "available" : "canceling");
  const normalizedStatus = rawStatus || (inferredEventType === "available" ? "Y" : "N");
  const id = String(item.id || [item.date || item.target_date || item.beginDate || item.resveBeginDe || "", category, roomName, item.fcltyCode || "", item.fcltyTyCode || "", item.resveNoCode || ""].join("|"));
  const detectedAt = item.detectedAt || item.detected_at || item.time || item.detected || item.detectedTime || item.received_at || new Date().toISOString();
  return { id, date: String(item.date || item.target_date || item.beginDate || item.resveBeginDe || "-"), category, roomName, fcltyCode: String(item.fcltyCode || ""), fcltyTyCode: String(item.fcltyTyCode || ""), resveNoCode: String(item.resveNoCode || ""), status: normalizedStatus, state: String(item.state || ""), event_type: inferredEventType, message: rawMessage, detectedAt };
}


function parseDetailText(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+(\S+)$/);
  if (!match) return { raw };
  return {
    target_date: match[1],
    facility: match[2],
    room: match[3],
    room_name: match[3]
  };
}




function heartbeatCancelingItems(heartbeat) {
  if (!heartbeat || typeof heartbeat !== "object") return [];
  if (Array.isArray(heartbeat.canceling_items)) return heartbeat.canceling_items;
  if (Array.isArray(heartbeat.canceling)) return heartbeat.canceling;
  if (Array.isArray(heartbeat.active)) return heartbeat.active;
  if (Array.isArray(heartbeat.canceling_details)) {
    return heartbeat.canceling_details.map(parseDetailText);
  }
  return [];
}




function normalizeHeartbeat(payload) {
  const heartbeat = payload.heartbeat && typeof payload.heartbeat === "object"
    ? payload.heartbeat
    : payload;
  const now = new Date().toISOString();
  return {
    ...heartbeat,
    received_at: heartbeat.received_at || heartbeat.receivedAt || payload.received_at || now,
    client: heartbeat.client || payload.client || heartbeat.source || payload.source || "state-signal"
  };
}




function eventForState(item) {
  const rawEventType = String(item.event_type || item.eventType || "").trim();
  const rawStatus = String(item.status || "").trim();
  const rawState = String(item.state || "").trim();
  const rawMessage = String(item.message || "").trim();
  const isAvailable = /available|예약\s*가능|예약가능|예약\s*마감|Y/i.test([rawEventType, rawStatus, rawState, rawMessage].join(" "));
  const eventType = rawEventType || (isAvailable ? "available" : "canceling");
  return { client: item.source || state.monitor.source || "go-mangsang", event_type: eventType, status: rawStatus || (isAvailable ? "Y" : "N"), state: rawState || (isAvailable ? "종료 → 예약 가능" : "발생"), target_date: item.date, facility: item.category, room: item.roomName, room_name: item.roomName, detected_at: item.detectedAt, received_at: item.detectedAt, message: rawMessage || [item.date, item.category, item.roomName].join(" ").trim() };
}


function handleHeartbeatPayload(payload) {
  const heartbeat = normalizeHeartbeat(payload || {});
  const rawCanceling = heartbeatCancelingItems(heartbeat);
  const active = rawCanceling
    .map(item => normalizeItem({
      ...item,
      status: "N",
      event_type: "canceling",
      detectedAt: item.detectedAt || item.detected_at || heartbeat.received_at
    }))
    .filter(item => item.date !== "-" && item.category !== "-" && item.roomName !== "-");
  const uniqueActive = Array.from(new Map(active.map(item => [item.id, item])).values());




  state.heartbeat = {
    ...heartbeat,
    canceling_count: uniqueActive.length,
    canceling_items: uniqueActive.map(eventForState)
  };
  state.previousRefreshAt = state.lastRefreshAt;
  state.lastRefreshAt = heartbeat.received_at;
  state.lastReportAt = new Date().toISOString();
  state.monitor = {
    ...state.monitor,
    count: Number(heartbeat.count || state.monitor.count || 0),
    activeCount: uniqueActive.length,
    source: String(heartbeat.client || "state-signal")
  };
  monitorError = String(heartbeat.error || heartbeat.monitorError || heartbeat.message || "");




  if (Array.isArray(heartbeat.canceling_items) || Array.isArray(heartbeat.canceling) || Array.isArray(heartbeat.active) || Array.isArray(heartbeat.canceling_details)) {
    state.active = uniqueActive;
    saveActive();
  }
  if (uniqueActive.length > 0) upsertEvents(uniqueActive);
  return uniqueActive;
}




function stateEventsForApi() {
  return state.events.map(eventForState);
}




function heartbeatForApi() {
  if (state.heartbeat) return state.heartbeat;
  const active = activeForView();
  return {
    received_at: state.lastRefreshAt || state.lastReportAt || state.startedAt,
    status: "running",
    client: state.monitor.source || "go-mangsang",
    canceling_count: active.length,
    canceling_items: active.map(eventForState),
    available_count: 0,
    available_items: []
  };
}




async function syncStateSignal() {
  if (hasFreshLocalReport()) return;
  if (!STATE_SIGNAL_URL || Date.now() - lastStateSyncAt < 5000) return;
  lastStateSyncAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(STATE_SIGNAL_URL, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "go-mangsang-state-sync/1.0" }
    });
    clearTimeout(timer);
    if (!response.ok) return;
    const payload = await response.json();
    if (payload && payload.heartbeat) {
      handleHeartbeatPayload(payload);
    }
  } catch (error) {}
}




function upsertEvents(items) {
  const map = new Map(state.events.map(item => [item.id, item]));
  for (const item of items) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  state.events = Array.from(map.values())
    .sort((a, b) => new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime())
    .slice(-MAX_EVENTS);
  saveEvents();
}




function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml; charset=utf-8",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";
}




function safeJoinPublic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const target = path.join(PUBLIC_DIR, normalized === "/" ? "index.html" : normalized);
  if (!target.startsWith(PUBLIC_DIR)) return null;
  return target;
}




function patchHtmlResponse(filePath, content) {
  if (path.basename(filePath) !== "index.html") return content;
  const html = content.toString("utf8");
  if (html.includes("codex-facility-status-box") || !html.includes("</head>")) return html;
  return html.replace("</head>", `${UI_FIX_CSS}\n</head>`);
}




function sendStatic(req, res) {
  const filePath = safeJoinPublic(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }




  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(res, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not Found" : "Server Error");
      return;
    }
    const responseType = contentTypeFor(filePath);
    const responseBody = responseType.startsWith("text/html") ? patchHtmlResponse(filePath, content) : content;
    res.writeHead(200, {
      "Content-Type": responseType,
      "Cache-Control": "no-store"
    });
    res.end(responseBody);
  });
}




function activeForView() {
  if (state.monitor.source === "reservation-console" && lastReportAgeMs() > LOCAL_REPORT_FRESH_MS) {
    return [];
  }
  return state.active.slice().sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.category.localeCompare(b.category, "ko") ||
    a.roomName.localeCompare(b.roomName, "ko")
  );
}




loadEvents();




const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);




    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }




    if (req.method === "GET" && url.pathname === "/api/status") {
      await syncStateSignal();
      sendJson(res, 200, { ok: true, ...state, eventCount: state.events.length, monitorError, monitorRunning: false });
      return;
    }




    if (req.method === "GET" && url.pathname === "/api/events") {
      await syncStateSignal();
      sendJson(res, 200, {
        ok: true,
        active: activeForView(),
        events: state.events.slice().reverse(),
        config: state.config,
        monitorError,
        status: {
          startedAt: state.startedAt,
          lastReportAt: state.lastReportAt,
          lastRefreshAt: state.lastRefreshAt,
          previousRefreshAt: state.previousRefreshAt,
          monitor: state.monitor
        }
      });
      return;
    }




    if (req.method === "GET" && url.pathname === "/api/state") {
      await syncStateSignal();
      sendJson(res, 200, {
        ok: true,
        heartbeat: heartbeatForApi(),
        events: stateEventsForApi()
      });
      return;
    }




    if (req.method === "GET" && url.pathname === "/api/config") {
      sendJson(res, 200, { ok: true, config: state.config });
      return;
    }




    if (req.method === "POST" && url.pathname === "/api/config") {
      const payload = JSON.parse((await readBody(req)) || "{}");
      if (String(payload.password || "") !== CONFIG_PASSWORD) {
        sendJson(res, 403, { ok: false, error: "bad password" });
        return;
      }
      state.config.intervalSec = normalizeIntervalSec(payload.intervalSec);
      state.monitor.intervalSec = state.config.intervalSec;
      sendJson(res, 200, { ok: true, config: state.config });
      return;
    }




    if (req.method === "POST" && (url.pathname === "/api/heartbeat" || url.pathname === "/api/state")) {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const active = handleHeartbeatPayload(payload);
      sendJson(res, 200, {
        ok: true,
        activeCount: active.length,
        eventCount: state.events.length,
        heartbeat: state.heartbeat
      });
      return;
    }




    if (req.method === "POST" && url.pathname === "/api/report") {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const now = new Date().toISOString();
      const rawActive = Array.isArray(payload.active) ? payload.active.map(normalizeItem) : [];
      const rawEvents = Array.isArray(payload.events) ? payload.events.map(normalizeItem) : [];
      const active = Array.from(new Map(rawActive.map(item => [item.id, item])).values());
      const reportedEvents = Array.from(new Map(rawEvents.map(item => [item.id, item])).values());




      state.previousRefreshAt = state.lastRefreshAt;
      state.lastRefreshAt = payload.refreshedAt || now;
      state.lastReportAt = now;
      const allRequestsFailed = Number(payload.totalRequests || 0) > 0 && Number(payload.failures || 0) >= Number(payload.totalRequests || 0);
      state.active = allRequestsFailed ? [] : active;
      saveActive();
      state.monitor = {
        count: Number(payload.count || 0),
        totalRequests: Number(payload.totalRequests || 0),
        activeCount: state.active.length,
        range: String(payload.range || "-"),
        intervalSec: Number(payload.intervalSec || state.config.intervalSec),
        source: String(payload.source || "pc-local"),
        failures: Number(payload.failures || 0)
      };
      monitorError = String(payload.monitorError || payload.error || "");
      if (!monitorError && state.monitor.totalRequests > 0 && state.monitor.failures >= state.monitor.totalRequests) {
        monitorError = "캠핑코리아 조회 실패";
      }
      if (active.length > 0) upsertEvents(active);
      if (reportedEvents.length > 0) upsertEvents(reportedEvents);




      sendJson(res, 200, { ok: true, activeCount: state.active.length, eventCount: state.events.length });
      return;
    }




    if (req.method === "POST" && url.pathname === "/api/reset") {
      state.active = [];
      state.events = [];
      state.monitor.activeCount = 0;
      saveActive();
      saveEvents();
      sendJson(res, 200, { ok: true });
      return;
    }




    if (req.method === "GET" && url.pathname === "/api/presence") {
      sendJson(res, 200, { ok: true, online: 1 });
      return;
    }




    if (req.method === "POST" && url.pathname === "/api/presence") {
      sendJson(res, 200, { ok: true, online: 1 });
      return;
    }




    if (req.method === "GET") {
      sendStatic(req, res);
      return;
    }




    sendText(res, 405, "Method Not Allowed");
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || String(error) });
  }
});




server.listen(PORT, HOST, () => {
  console.log(`go-mangsang dashboard listening on http://${HOST}:${PORT}`);
});





















