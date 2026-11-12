/* 100대 명산 도장깨기 — 서버 없이 브라우저에서만 동작하는 한 페이지 앱
 * - 기록(날짜/메모): localStorage
 * - 인증 사진: IndexedDB (업로드 전에 리사이즈 + WebP/JPEG 압축)
 */
(() => {
  "use strict";

  const MOUNTAINS = window.MOUNTAINS;
  const BY_ID = new Map(MOUNTAINS.map((m) => [m.id, m]));
  const REGIONS = ["수도권", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  const REC_KEY = "m100.records.v1";

  // ===== 사진 압축 설정 =====
  const PHOTO = {
    maxSide: 1080,        // 긴 변 최대 픽셀
    targetBytes: 150 * 1024, // 목표 용량 (약 150KB)
    startQuality: 0.72,
    minQuality: 0.4,
    thumbSide: 360,       // 목록용 썸네일
  };

  // ===== 경험치 / 레벨 =====
  const XP_BASE = 100;
  const XP_ISLAND = 200;
  const LEVEL_STEP = 150; // 레벨 L 도달에 필요한 누적 XP = 150 * L * (L - 1)
  const TITLES = [
    [1, "등린이"], [3, "동네 뒷산러"], [5, "주말 산행러"], [8, "능선 탐험가"],
    [11, "봉우리 사냥꾼"], [14, "백두대간 순례자"], [17, "산악 고수"],
    [20, "명산 마스터"], [23, "산신령"], [26, "전설의 산악인"],
  ];
  const CHEERS = [
    "정상의 바람은 언제나 옳다!", "다리는 후들, 마음은 뿌듯!", "오늘도 한 걸음 더 높이!",
    "하산까지가 등산입니다. 조심히 내려가세요!", "인증샷 각도 완벽해요 📸",
    "다음 산이 벌써 부르고 있어요.", "땀 흘린 만큼 풍경이 보답했죠?",
  ];

  const xpOf = (m) => m.h + XP_BASE + (m.island ? XP_ISLAND : 0);
  const levelOf = (xp) => Math.floor((1 + Math.sqrt(1 + (4 * xp) / LEVEL_STEP)) / 2);
  const xpAtLevel = (L) => LEVEL_STEP * L * (L - 1);
  const titleOf = (L) => TITLES.filter(([l]) => L >= l).pop()[1];

  // ===== 배지 =====
  const HIGH_PEAKS = MOUNTAINS.filter((m) => m.h >= 1500).map((m) => m.id);
  const ISLANDS = MOUNTAINS.filter((m) => m.island).map((m) => m.id);
  const TOP3 = ["한라산", "지리산", "설악산"].map((n) => MOUNTAINS.find((m) => m.n === n).id);

  const BADGES = [
    { id: "c1", ico: "👣", nm: "첫 발자국", desc: "첫 번째 명산 완등", test: (s) => s.count >= 1 },
    { id: "c10", ico: "🥉", nm: "10座", desc: "10개 산 완등", test: (s) => s.count >= 10 },
    { id: "c30", ico: "🥈", nm: "30座", desc: "30개 산 완등", test: (s) => s.count >= 30 },
    { id: "c50", ico: "🥇", nm: "반백 명산", desc: "50개 산 완등", test: (s) => s.count >= 50 },
    { id: "c70", ico: "💎", nm: "70座", desc: "70개 산 완등", test: (s) => s.count >= 70 },
    { id: "c100", ico: "👑", nm: "100대 명산 완등", desc: "100개 산 모두 완등!", test: (s) => s.count >= 100 },
    { id: "top3", ico: "🗻", nm: "3대 명산", desc: "한라산·지리산·설악산 완등", test: (s) => TOP3.every((id) => s.ids.has(id)) },
    { id: "high", ico: "☁️", nm: "구름 위 산책", desc: "1500m 이상 산 3개 완등", test: (s) => HIGH_PEAKS.filter((id) => s.ids.has(id)).length >= 3 },
    { id: "highAll", ico: "🦅", nm: "고산 정복자", desc: `1500m 이상 ${HIGH_PEAKS.length}개 산 모두 완등`, test: (s) => HIGH_PEAKS.every((id) => s.ids.has(id)) },
    { id: "island", ico: "🏝️", nm: "섬 산행", desc: "섬에 있는 산 3개 완등", test: (s) => ISLANDS.filter((id) => s.ids.has(id)).length >= 3 },
    { id: "islandAll", ico: "⛵", nm: "섬 정복자", desc: `섬 산 ${ISLANDS.length}개 모두 완등`, test: (s) => ISLANDS.every((id) => s.ids.has(id)) },
    { id: "everest", ico: "🏔️", nm: "에베레스트 돌파", desc: "누적 고도 8,849m 돌파", test: (s) => s.height >= 8849 },
    { id: "everest5", ico: "🚀", nm: "에베레스트 x5", desc: "누적 고도 44,245m 돌파", test: (s) => s.height >= 44245 },
    { id: "double", ico: "⚡", nm: "더블 헤더", desc: "하루에 2개 산 완등", test: (s) => s.maxPerDay >= 2 },
    { id: "month5", ico: "🔥", nm: "불꽃 산행", desc: "한 달에 5개 산 완등", test: (s) => s.maxPerMonth >= 5 },
    { id: "season", ico: "🍂", nm: "사계절 산꾼", desc: "봄·여름·가을·겨울 모두 완등 기록", test: (s) => s.seasons.size >= 4 },
    { id: "winter", ico: "❄️", nm: "설산 러버", desc: "겨울(12~2월)에 5개 산 완등", test: (s) => s.winterCount >= 5 },
    ...REGIONS.map((r) => ({
      id: "r_" + r, ico: "🗺️", nm: `${r} 정복`,
      desc: `${r} 권역 ${MOUNTAINS.filter((m) => m.r === r).length}개 산 모두 완등`,
      test: (s) => MOUNTAINS.filter((m) => m.r === r).every((m) => s.ids.has(m.id)),
    })),
  ];

  // ===== 저장소 =====
  const loadRecords = () => {
    try { return JSON.parse(localStorage.getItem(REC_KEY)) || {}; } catch { return {}; }
  };
  let records = loadRecords();
  const saveRecords = () => {
    try { localStorage.setItem(REC_KEY, JSON.stringify(records)); }
    catch (e) { toast("저장 공간이 부족해요. 백업 후 정리해 주세요."); }
  };

  const db = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const req = indexedDB.open("m100", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("photos");
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    }));
    const tx = async (mode, fn) => {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction("photos", mode);
        const st = t.objectStore("photos");
        const r = fn(st);
        t.oncomplete = () => res(r && r.result);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      get: (k) => tx("readonly", (s) => s.get(k)),
      put: (k, v) => tx("readwrite", (s) => s.put(v, k)),
      del: (k) => tx("readwrite", (s) => s.delete(k)),
      clear: () => tx("readwrite", (s) => s.clear()),
    };
  })();

  // 썸네일/원본 object URL 캐시
  const urlCache = new Map();
  async function photoURL(key) {
    if (urlCache.has(key)) return urlCache.get(key);
    const blob = await db.get(key).catch(() => null);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(key, url);
    return url;
  }
  function dropURL(key) {
    if (urlCache.has(key)) { URL.revokeObjectURL(urlCache.get(key)); urlCache.delete(key); }
  }

  // ===== 이미지 압축 =====
  async function decode(file) {
    if ("createImageBitmap" in window) {
      try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
    }
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("이미지를 읽을 수 없어요"));
      img.src = URL.createObjectURL(file);
    });
  }

  const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
  let webpOK = null;
  async function supportsWebP() {
    if (webpOK !== null) return webpOK;
    const c = document.createElement("canvas"); c.width = c.height = 2;
    const b = await toBlob(c, "image/webp", 0.8);
    return (webpOK = !!b && b.type === "image/webp");
  }

  function draw(src, maxSide) {
    const w0 = src.width, h0 = src.height;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    return c;
  }

  // 목표 용량 이하가 될 때까지 품질 → 해상도 순으로 낮춤. EXIF(위치정보 등)는 자동 제거됨.
  async function compress(file, maxSide = PHOTO.maxSide, target = PHOTO.targetBytes) {
    const src = await decode(file);
    const type = (await supportsWebP()) ? "image/webp" : "image/jpeg";
    let side = maxSide, blob, canvas;
    for (let round = 0; round < 4; round++) {
      canvas = draw(src, side);
      for (let q = PHOTO.startQuality; q >= PHOTO.minQuality - 1e-9; q -= 0.08) {
        blob = await toBlob(canvas, type, q);
        if (blob.size <= target) break;
      }
      if (blob.size <= target) break;
      side = Math.round(side * 0.8);
    }
    if (src.close) src.close();
    return { blob, width: canvas.width, height: canvas.height };
  }

  // ===== 통계 =====
  function computeStats() {
    const ids = new Set(Object.keys(records).map(Number).filter((id) => BY_ID.has(id)));
    const list = [...ids].map((id) => ({ m: BY_ID.get(id), r: records[id] }));
    const perDay = {}, perMonth = {}, seasons = new Set();
    let height = 0, xp = 0, winterCount = 0, thisYear = 0;
    const yr = String(new Date().getFullYear());
    for (const { m, r } of list) {
      height += m.h; xp += xpOf(m);
      const d = r.date || "";
      perDay[d] = (perDay[d] || 0) + 1;
      perMonth[d.slice(0, 7)] = (perMonth[d.slice(0, 7)] || 0) + 1;
      const mo = Number(d.slice(5, 7));
      if (mo) {
        seasons.add(mo >= 3 && mo <= 5 ? "봄" : mo <= 8 && mo >= 6 ? "여름" : mo >= 9 && mo <= 11 ? "가을" : "겨울");
        if (mo === 12 || mo <= 2) winterCount++;
      }
      if (d.startsWith(yr)) thisYear++;
    }
    const s = {
      ids, count: ids.size, height, xp, seasons, winterCount, thisYear,
      maxPerDay: Math.max(0, ...Object.values(perDay)),
      maxPerMonth: Math.max(0, ...Object.values(perMonth)),
    };
    s.level = levelOf(xp);
    s.badges = BADGES.filter((b) => b.test(s)).map((b) => b.id);
    return s;
  }

  // ===== 화면 상태 =====
  const $ = (q) => document.querySelector(q);
  const state = { status: "all", region: "전체", q: "", sort: "name" };
  try { Object.assign(state, JSON.parse(localStorage.getItem("m100.ui")) || {}); } catch {}
  const saveUI = () => { try { localStorage.setItem("m100.ui", JSON.stringify(state)); } catch {} };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtKB = (n) => (n / 1024).toFixed(0) + "KB";
  const today = () => {
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const dateFrom = (ts) => {
    const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };

  // ===== 렌더링 =====
  function renderHeader(s) {
    $("#doneCount").textContent = s.count;
    $("#ringFg").style.strokeDashoffset = String(326.7 * (1 - s.count / 100));
    const L = s.level, cur = xpAtLevel(L), next = xpAtLevel(L + 1);
    $("#lvNum").textContent = "Lv." + L;
    $("#lvTitle").textContent = titleOf(L);
    $("#xpFill").style.width = Math.min(100, ((s.xp - cur) / (next - cur)) * 100) + "%";
    $("#xpText").textContent = `${s.xp.toLocaleString()} XP · 다음 레벨까지 ${(next - s.xp).toLocaleString()} XP`;
    $("#statHeight").textContent = s.height.toLocaleString();
    $("#statBadges").textContent = s.badges.length;
    $("#statYear").textContent = s.thisYear;
  }

  function renderBadges(s) {
    const got = new Set(s.badges);
    const sorted = [...BADGES].sort((a, b) => got.has(b.id) - got.has(a.id));
    $("#badges").innerHTML = sorted.map((b) => `
      <button class="badge ${got.has(b.id) ? "got" : "locked"}" data-badge="${b.id}" title="${esc(b.desc)}">
        <div class="ico">${b.ico}</div><div class="nm">${esc(b.nm)}</div>
      </button>`).join("");
    $("#badgeSummary").textContent = `${got.size} / ${BADGES.length}`;
  }

  function renderRegions(s) {
    const items = ["전체", ...REGIONS];
    $("#regionChips").innerHTML = items.map((r) => {
      const all = r === "전체" ? MOUNTAINS : MOUNTAINS.filter((m) => m.r === r);
      const done = all.filter((m) => s.ids.has(m.id)).length;
      return `<button class="chip ${state.region === r ? "active" : ""}" data-region="${r}">${r}<span class="cnt">${done}/${all.length}</span></button>`;
    }).join("");
    document.querySelectorAll("#statusChips .chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.status === state.status));
    $("#sort").value = state.sort;
  }

  function stampHTML(rec, pop) {
    const d = rec.date ? rec.date.slice(2).replace(/-/g, ".") : "";
    return `<div class="stamp ${pop ? "pop" : ""}">완등<small>${d}</small></div>`;
  }

  function renderGrid(s, popId) {
    const q = state.q.trim();
    let list = MOUNTAINS.filter((m) => {
      if (state.region !== "전체" && m.r !== state.region) return false;
      const done = s.ids.has(m.id);
      if (state.status === "done" && !done) return false;
      if (state.status === "todo" && done) return false;
      if (q && !(m.n.includes(q) || m.loc.includes(q))) return false;
      return true;
    });
    const sorters = {
      name: (a, b) => a.id - b.id,
      high: (a, b) => b.h - a.h,
      low: (a, b) => a.h - b.h,
      recent: (a, b) => ((records[b.id]?.ts || 0) - (records[a.id]?.ts || 0)) || a.id - b.id,
    };
    list.sort(sorters[state.sort] || sorters.name);

    if (!list.length) { $("#grid").innerHTML = `<div class="empty">조건에 맞는 산이 없어요 🌲</div>`; return; }

    $("#grid").innerHTML = list.map((m) => {
      const rec = records[m.id];
      return `<button class="card" data-id="${m.id}">
        <div class="thumb">${rec ? `<img data-thumb="${m.id}" alt="${esc(m.n)} 인증 사진" loading="lazy">` : `<span class="peak">⛰️</span>`}</div>
        ${rec ? stampHTML(rec, m.id === popId) : ""}
        <div class="info">
          <div class="no">No.${String(m.id).padStart(3, "0")} · ${m.r}${m.island ? " · 🏝️" : ""}</div>
          <div class="name">${esc(m.n)}</div>
          <div class="meta">${m.h.toLocaleString()}m · ${esc(m.loc)}</div>
        </div>
      </button>`;
    }).join("");

    document.querySelectorAll("img[data-thumb]").forEach(async (img) => {
      const id = Number(img.dataset.thumb);
      const url = (await photoURL("t" + id)) || (await photoURL("p" + id));
      if (url) img.src = url; else img.remove();
    });
  }

  function render(popId) {
    const s = computeStats();
    renderHeader(s); renderBadges(s); renderRegions(s); renderGrid(s, popId);
    return s;
  }

  // ===== 상세 / 인증 모달 =====
  const dlg = $("#dlg");
  let pending = null; // { blob, thumb, width, height }

  async function openMountain(id) {
    const m = BY_ID.get(id);
    const rec = records[id];
    pending = null;
    const head = `<h3>${esc(m.n)} ${m.island ? "🏝️" : ""}</h3>
      <div class="detail-meta">${m.h.toLocaleString()}m · ${esc(m.loc)} · 완등 시 <b>+${xpOf(m).toLocaleString()} XP</b></div>`;

    if (rec) {
      dlg.querySelector("#dlgBody").innerHTML = `${head}
        <div class="photo-box"><img id="fullPhoto" alt="${esc(m.n)} 인증 사진">${stampHTML(rec, false)}</div>
        <div class="detail-meta">📅 ${esc(rec.date)} 완등 ${rec.size ? `· 사진 ${fmtKB(rec.size)}` : ""}</div>
        ${rec.memo ? `<div class="memo">${esc(rec.memo)}</div>` : ""}
        <div class="row">
          <button type="button" class="btn ghost" data-act="edit">✏️ 수정</button>
          <button type="button" class="btn danger" data-act="delete">완등 취소</button>
        </div>`;
      const url = await photoURL("p" + id);
      const img = dlg.querySelector("#fullPhoto");
      if (url && img) img.src = url; else img?.parentElement.remove();
    } else {
      renderUploadForm(m);
    }
    dlg.dataset.id = id;
    if (!dlg.open) dlg.showModal();
  }

  function renderUploadForm(m, rec) {
    dlg.querySelector("#dlgBody").innerHTML = `
      <h3>${esc(m.n)} ${rec ? "기록 수정" : "정상 인증"}</h3>
      <div class="detail-meta">${m.h.toLocaleString()}m · ${esc(m.loc)}</div>
      <label class="upload" id="uploadBox">
        <span class="big">📸</span>
        <b>${rec ? "사진 바꾸기 (선택)" : "정상 인증 사진 올리기"}</b>
        <span class="muted small">자동으로 약 ${PHOTO.targetBytes / 1024}KB 이하로 압축돼요 · 위치정보(EXIF)는 지워져요</span>
        <input type="file" id="photoInput" accept="image/*" hidden>
      </label>
      <div class="preview" id="preview" hidden></div>
      <label class="field"><span>완등 날짜</span><input type="date" id="dateInput" value="${esc(rec?.date || today())}" max="${today()}"></label>
      <label class="field"><span>한 줄 메모 (선택)</span><textarea id="memoInput" maxlength="300" placeholder="코스, 소요 시간, 날씨, 같이 간 사람…">${esc(rec?.memo || "")}</textarea></label>
      <button type="button" class="btn" id="btnSave" ${rec ? "" : "disabled"}>${rec ? "💾 저장" : "🚩 완등 도장 찍기"}</button>`;
  }

  async function onPhotoPicked(file) {
    const box = dlg.querySelector("#preview");
    const btn = dlg.querySelector("#btnSave");
    box.hidden = false;
    box.innerHTML = `<div class="muted">사진 압축 중… ⏳</div>`;
    btn.disabled = true;
    try {
      const [main, thumb] = await Promise.all([
        compress(file),
        compress(file, PHOTO.thumbSide, 30 * 1024),
      ]);
      pending = { ...main, thumb: thumb.blob };
      const url = URL.createObjectURL(main.blob);
      box.innerHTML = `<img src="${url}" alt="미리보기">
        <div class="size">원본 ${fmtKB(file.size)} → <b>${fmtKB(main.blob.size)}</b> (${main.width}×${main.height}, ${main.blob.type.split("/")[1].toUpperCase()}) · ${Math.max(0, Math.round((1 - main.blob.size / file.size) * 100))}% 절약</div>`;
      // 사진 촬영 시각이 있으면 날짜 자동 입력 (카메라 사진은 보통 lastModified = 촬영 시각)
      if (file.lastModified && !records[dlg.dataset.id]) {
        const d = dateFrom(file.lastModified);
        if (d <= today()) dlg.querySelector("#dateInput").value = d;
      }
      btn.disabled = false;
    } catch (e) {
      console.error(e);
      box.innerHTML = `<div class="muted">사진을 처리하지 못했어요. 다른 사진(JPG/PNG)으로 시도해 주세요.</div>`;
      pending = null;
      btn.disabled = !records[dlg.dataset.id];
    }
  }

  async function save() {
    const id = Number(dlg.dataset.id);
    const m = BY_ID.get(id);
    const wasDone = !!records[id];
    const before = computeStats();
    const date = dlg.querySelector("#dateInput").value || today();
    const memo = dlg.querySelector("#memoInput").value.trim();
    const btn = dlg.querySelector("#btnSave");
    btn.disabled = true;

    try {
      const rec = records[id] || { ts: Date.now() };
      if (pending) {
        await db.put("p" + id, pending.blob);
        await db.put("t" + id, pending.thumb);
        dropURL("p" + id); dropURL("t" + id);
        Object.assign(rec, { size: pending.blob.size, w: pending.width, h: pending.height });
      }
      Object.assign(rec, { date, memo });
      records[id] = rec;
      saveRecords();
    } catch (e) {
      console.error(e);
      toast("저장에 실패했어요. 저장 공간을 확인해 주세요.");
      btn.disabled = false;
      return;
    }
    pending = null;

    if (wasDone) {
      const s = render();
      toast("기록을 수정했어요 ✏️");
      openMountain(id);
      return s;
    }
    const after = render(id);
    celebrate(m, before, after);
  }

  function celebrate(m, before, after) {
    const newBadges = BADGES.filter((b) => after.badges.includes(b.id) && !before.badges.includes(b.id));
    const levelUp = after.level > before.level;
    const left = 100 - after.count;
    dlg.querySelector("#dlgBody").innerHTML = `
      <div class="celebrate">
        <div class="big">${after.count === 100 ? "👑" : "🎉"}</div>
        <h3>${esc(m.n)} 완등!</h3>
        <div class="muted">${CHEERS[Math.floor(Math.random() * CHEERS.length)]}</div>
      </div>
      <div class="reward">
        <div class="hl">✨ +${xpOf(m).toLocaleString()} XP ${m.island ? "(섬 보너스 포함)" : ""}</div>
        ${levelUp ? `<div class="hl">⬆️ 레벨 업! Lv.${before.level} → <b>Lv.${after.level} ${titleOf(after.level)}</b></div>` : ""}
        ${newBadges.map((b) => `<div class="hl">${b.ico} 새 배지: <b>${esc(b.nm)}</b> — ${esc(b.desc)}</div>`).join("")}
        <div>⛰️ ${after.count}번째 명산 · 누적 고도 ${after.height.toLocaleString()}m</div>
        <div>${left ? `🎯 남은 명산 ${left}개! ${nextHint(after)}` : "🏆 100대 명산을 모두 완등했어요. 진정한 산신령!"}</div>
      </div>
      <button type="button" class="btn" value="cancel" data-act="close">확인</button>`;
    confetti(levelUp || newBadges.length ? 260 : 140);
  }

  // 같은 권역에서 남은 산 하나 추천
  function nextHint(s) {
    const id = Number(dlg.dataset.id);
    const r = BY_ID.get(id).r;
    const left = MOUNTAINS.filter((m) => m.r === r && !s.ids.has(m.id));
    if (!left.length) return `${r} 권역 정복 완료!`;
    const pick = left[Math.floor(Math.random() * left.length)];
    return `근처 ${pick.n}(${pick.h}m)은 어때요?`;
  }

  async function removeRecord(id) {
    const m = BY_ID.get(id);
    if (!confirm(`${m.n} 완등 기록과 사진을 삭제할까요?`)) return;
    delete records[id];
    saveRecords();
    await db.del("p" + id).catch(() => {});
    await db.del("t" + id).catch(() => {});
    dropURL("p" + id); dropURL("t" + id);
    dlg.close();
    render();
    toast(`${m.n} 기록을 삭제했어요`);
  }

  // ===== 백업 / 복원 =====
  const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  const dataURLToBlob = async (u) => (await fetch(u)).blob();

  async function exportBackup() {
    const photos = {};
    for (const id of Object.keys(records)) {
      for (const k of ["p" + id, "t" + id]) {
        const b = await db.get(k).catch(() => null);
        if (b) photos[k] = await blobToDataURL(b);
      }
    }
    const data = { app: "m100", version: 1, exportedAt: new Date().toISOString(), records, photos };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `100대명산_백업_${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`백업 완료 (${fmtKB(blob.size)})`);
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "m100" || typeof data.records !== "object") throw new Error("형식 오류");
      if (!confirm(`백업의 완등 기록 ${Object.keys(data.records).length}개를 불러올까요?\n지금 기기의 기록은 백업 내용으로 바뀝니다.`)) return;
      await db.clear();
      urlCache.forEach((u) => URL.revokeObjectURL(u)); urlCache.clear();
      for (const [k, u] of Object.entries(data.photos || {})) await db.put(k, await dataURLToBlob(u));
      records = data.records;
      saveRecords();
      render();
      $("#menu").close();
      toast("백업을 불러왔어요 ✅");
    } catch (e) {
      console.error(e);
      toast("백업 파일을 읽지 못했어요");
    }
  }

  async function resetAll() {
    if (!confirm("모든 완등 기록과 사진을 삭제할까요? 되돌릴 수 없어요.")) return;
    if (!confirm("정말요? 백업은 해두셨나요?")) return;
    records = {}; saveRecords();
    await db.clear();
    urlCache.forEach((u) => URL.revokeObjectURL(u)); urlCache.clear();
    render();
    $("#menu").close();
    toast("초기화했어요");
  }

  async function showStorage() {
    const el = $("#storageInfo");
    const sizes = Object.values(records).reduce((a, r) => a + (r.size || 0), 0);
    let txt = `사진 ${Object.keys(records).length}장 · 약 ${(sizes / 1024 / 1024).toFixed(2)}MB 사용`;
    if (navigator.storage?.estimate) {
      const { quota } = await navigator.storage.estimate();
      if (quota) txt += ` (가용 ${(quota / 1024 / 1024 / 1024).toFixed(1)}GB)`;
    }
    el.textContent = txt;
  }

  // ===== 토스트 / 꽃가루 =====
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  function confetti(n) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = $("#confetti"), ctx = cv.getContext("2d");
    const W = (cv.width = innerWidth * devicePixelRatio), H = (cv.height = innerHeight * devicePixelRatio);
    const colors = ["#ffd36b", "#2f9466", "#e8a33d", "#c8352b", "#4aa3df", "#ffffff"];
    const parts = Array.from({ length: n }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
      vx: (Math.random() - 0.5) * 18 * devicePixelRatio, vy: (-Math.random() * 18 - 6) * devicePixelRatio,
      s: (Math.random() * 6 + 4) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.5 * devicePixelRatio; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      }
      if (t - start < 3200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(start);
  }

  // ===== 이벤트 =====
  $("#grid").addEventListener("click", (e) => {
    const c = e.target.closest(".card");
    if (c) openMountain(Number(c.dataset.id));
  });
  $("#badges").addEventListener("click", (e) => {
    const b = e.target.closest(".badge");
    if (!b) return;
    const badge = BADGES.find((x) => x.id === b.dataset.badge);
    toast(`${badge.ico} ${badge.nm} — ${badge.desc}${b.classList.contains("got") ? " ✅" : " 🔒"}`);
  });
  $("#statusChips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    state.status = c.dataset.status; saveUI(); render();
  });
  $("#regionChips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    state.region = c.dataset.region; saveUI(); render();
  });
  $("#search").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; saveUI(); render(); });

  dlg.addEventListener("change", (e) => {
    if (e.target.id === "photoInput" && e.target.files[0]) onPhotoPicked(e.target.files[0]);
  });
  dlg.addEventListener("click", (e) => {
    const id = Number(dlg.dataset.id);
    if (e.target === dlg) return dlg.close(); // 바깥 클릭
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (e.target.closest("#btnSave")) save();
    else if (act === "edit") renderUploadForm(BY_ID.get(id), records[id]);
    else if (act === "delete") removeRecord(id);
    else if (act === "close") dlg.close();
  });
  // 폼 엔터키 제출 방지
  $("#dlgForm").addEventListener("submit", (e) => { if (e.submitter?.value !== "cancel") e.preventDefault(); });

  $("#btnMenu").addEventListener("click", () => { showStorage(); $("#menu").showModal(); });
  $("#menu").addEventListener("click", (e) => { if (e.target.id === "menu") e.target.close(); });
  $("#btnExport").addEventListener("click", exportBackup);
  $("#importFile").addEventListener("change", (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ""; });
  $("#btnReset").addEventListener("click", resetAll);

  // 브라우저가 저장소를 임의로 비우지 않도록 요청
  navigator.storage?.persist?.().catch(() => {});

  render();
})();
