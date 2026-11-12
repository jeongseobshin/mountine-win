/* 앱 설치 안내 팝업 + 앱 아이콘 바꾸기
 * - Android/PC 크롬·삼성인터넷·엣지: 설치 버튼 한 번으로 설치
 * - iPhone/iPad 사파리: "공유 → 홈 화면에 추가" 안내
 * - 카카오톡 등 앱 안의 브라우저: 외부 브라우저로 열기 안내
 * - 아이콘: 기본 아이콘 / 이모지 프리셋 / 내 사진 → 이 기기에만 저장
 */
(() => {
  "use strict";
  const $ = (q) => document.querySelector(q);
  const ICON_KEY = "m100.icon.v1";
  const DISMISS_KEY = "m100.install.dismissed";
  const ua = navigator.userAgent;

  const isStandalone = () =>
    matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isInApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|everytimeApp|DaumApps/i.test(ua);
  const isKakao = /KAKAOTALK/i.test(ua);

  // ===== 서비스 워커 (설치 + 오프라인) =====
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // ===== 앱 아이콘 =====
  // 프리셋: [이모지, 배경색1, 배경색2]
  const PRESETS = [
    ["⛰️", "#1f6f4a", "#4aa37a"], ["🏔️", "#1d4e89", "#5aa0d8"], ["🥾", "#7a4a1f", "#d79a52"],
    ["🚩", "#2b2b2b", "#5a5a5a"], ["🌲", "#14532d", "#3f9a5e"], ["🌄", "#f08a24", "#f7c948"],
    ["🦅", "#3b2f63", "#7b68c4"], ["🧗", "#b4234a", "#f0718f"], ["🏕️", "#0f5257", "#3fb0a8"],
  ];

  function canvasIcon(size, drawFn) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    drawFn(c.getContext("2d"), size);
    return c.toDataURL("image/png");
  }

  function presetIcon([emoji, c1, c2], size) {
    return canvasIcon(size, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      ctx.font = `${Math.round(s * 0.56)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(emoji, s / 2, s * 0.54);
    });
  }

  // 사진 가운데를 정사각형으로 잘라서 아이콘으로
  async function photoIcon(file, size) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(async () => {
      const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img;
    });
    const side = Math.min(bmp.width, bmp.height);
    const sx = (bmp.width - side) / 2, sy = (bmp.height - side) / 2;
    return canvasIcon(size, (ctx, s) => {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, sx, sy, side, side, 0, 0, s, s);
    });
  }

  const loadIcon = () => { try { return JSON.parse(localStorage.getItem(ICON_KEY)); } catch { return null; } };
  const saveIcon = (v) => {
    try { v ? localStorage.setItem(ICON_KEY, JSON.stringify(v)) : localStorage.removeItem(ICON_KEY); return true; }
    catch { return false; }
  };

  // 사용자 아이콘이 있으면 파비콘·애플 아이콘·매니페스트를 그 아이콘으로 바꿔요
  function applyIcon(icon) {
    const set = (sel, href) => { const el = document.querySelector(sel); if (el) el.href = href; };
    if (!icon) {
      set('link[rel="icon"]', "icons/favicon-32.png");
      set('link[rel="apple-touch-icon"]', "icons/apple-touch-icon.png");
      set('link[rel="manifest"]', "manifest.webmanifest");
      return;
    }
    set('link[rel="icon"]', icon.i192);
    set('link[rel="apple-touch-icon"]', icon.i512);
    const base = new URL("./", location.href).href;
    const manifest = {
      name: "100대 명산 도장깨기", short_name: "명산도장", lang: "ko",
      start_url: base, scope: base, display: "standalone", orientation: "portrait",
      background_color: "#f4f1ea", theme_color: "#1f6f4a",
      icons: [
        { src: icon.i192, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon.i512, sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    };
    set('link[rel="manifest"]', URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" })));
  }
  applyIcon(loadIcon());

  function renderIconPicker() {
    const cur = loadIcon();
    const box = $("#iconPicker");
    if (!box) return;
    const items = [
      `<button type="button" class="icon-opt ${!cur ? "on" : ""}" data-icon="default" title="기본 아이콘"><img src="icons/icon-192.png" alt="기본"></button>`,
      ...PRESETS.map((p, i) => `<button type="button" class="icon-opt ${cur?.key === "p" + i ? "on" : ""}" data-icon="p${i}" title="${p[0]}"><img src="${presetIcon(p, 96)}" alt="${p[0]}"></button>`),
      `<label class="icon-opt photo ${cur?.key === "photo" ? "on" : ""}" title="내 사진으로">${cur?.key === "photo" ? `<img src="${cur.i192}" alt="내 사진">` : "<span>📷<br>내 사진</span>"}<input type="file" accept="image/*" id="iconFile" hidden></label>`,
    ];
    box.innerHTML = items.join("");
    $("#iconPreview").src = cur ? cur.i192 : "icons/icon-192.png";
  }

  function setIcon(icon, msg) {
    if (icon && !saveIcon(icon)) return toast("저장 공간이 부족해서 아이콘을 저장하지 못했어요");
    if (!icon) saveIcon(null);
    applyIcon(icon);
    renderIconPicker();
    toast(msg + (isStandalone() ? " · 이미 설치했다면 앱을 지우고 다시 설치해야 홈 화면 아이콘이 바뀌어요" : ""));
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest(".icon-opt[data-icon]");
    if (!b) return;
    const k = b.dataset.icon;
    if (k === "default") return setIcon(null, "기본 아이콘으로 바꿨어요");
    const p = PRESETS[Number(k.slice(1))];
    setIcon({ key: k, i192: presetIcon(p, 192), i512: presetIcon(p, 512) }, `${p[0]} 아이콘으로 바꿨어요`);
  });
  document.addEventListener("change", async (e) => {
    if (e.target.id !== "iconFile" || !e.target.files[0]) return;
    try {
      const f = e.target.files[0];
      const [i192, i512] = await Promise.all([photoIcon(f, 192), photoIcon(f, 512)]);
      setIcon({ key: "photo", i192, i512 }, "내 사진으로 아이콘을 바꿨어요");
    } catch { toast("사진을 읽지 못했어요"); }
    e.target.value = "";
  });

  // ===== 설치 안내 팝업 =====
  let deferred = null;
  const dlg = $("#installDlg");

  function installContent() {
    const icon = loadIcon()?.i192 || "icons/icon-192.png";
    let body, actions;
    if (isInApp) {
      body = `<p>지금은 ${isKakao ? "카카오톡" : "앱"} 안의 브라우저라 설치가 안 돼요.<br>
        <b>${isIOS ? "사파리" : "크롬"}</b>으로 열어서 설치해 주세요.</p>
        <ol class="steps"><li>오른쪽 아래(또는 위) <b>⋯ 메뉴</b> 누르기</li><li><b>다른 브라우저로 열기</b> 선택</li></ol>`;
      actions = isKakao
        ? `<button type="button" class="btn" data-install="external">🌐 외부 브라우저로 열기</button>`
        : `<button type="button" class="btn" data-install="copy">🔗 주소 복사하기</button>`;
    } else if (deferred) {
      body = `<p>홈 화면에 앱으로 설치하면 더 빠르고, <b>산 위에서 인터넷이 약해도</b> 열려요.</p>`;
      actions = `<button type="button" class="btn" data-install="go">📲 앱 설치하기</button>`;
    } else if (isIOS) {
      body = `<p>아이폰은 사파리에서 이렇게 설치해요.</p>
        <ol class="steps">
          <li>아래쪽 <b>공유 버튼</b> <span class="kbd">⬆︎</span> 누르기</li>
          <li><b>홈 화면에 추가</b> <span class="kbd">＋</span> 선택</li>
          <li>오른쪽 위 <b>추가</b> 누르기</li>
        </ol>`;
      actions = "";
    } else {
      body = `<p>브라우저 메뉴(<b>⋮</b>)에서 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러 주세요.</p>`;
      actions = "";
    }
    $("#installBody").innerHTML = `
      <div class="install-head"><img src="${icon}" alt="앱 아이콘"><div><h3>명산도장 앱 설치</h3><div class="muted small">100대 명산 도장깨기</div></div></div>
      ${body}
      <div class="menu-actions">${actions}
        <button type="button" class="btn ghost" data-install="icon">🎨 설치 전에 아이콘 바꾸기</button>
        <button type="button" class="btn ghost" data-install="later">나중에 할게요</button>
      </div>`;
  }

  function openInstall(force) {
    if (!dlg || dlg.open) return;
    if (!force) {
      if (isStandalone()) return;
      const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (Date.now() - t < 3 * 24 * 3600 * 1000) return; // 닫으면 3일 동안 안 띄움
      if (document.querySelector("dialog[open]")) return;
    }
    installContent();
    dlg.showModal();
  }
  window.m100OpenInstall = () => openInstall(true);

  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    $("#btnInstall")?.removeAttribute("hidden");
    if (dlg?.open) installContent(); else setTimeout(() => openInstall(false), 1200);
  });
  addEventListener("appinstalled", () => {
    deferred = null;
    dlg?.open && dlg.close();
    toast("설치 완료! 홈 화면에서 명산도장을 열어보세요 ⛰️");
  });

  // 설치 이벤트가 없는 브라우저(iOS·인앱 등)는 잠시 뒤 안내 팝업
  if (!isStandalone()) {
    setTimeout(() => { if (!deferred) openInstall(false); }, 2500);
    $("#btnInstall")?.removeAttribute("hidden");
  }

  dlg?.addEventListener("click", async (e) => {
    if (e.target === dlg) { localStorage.setItem(DISMISS_KEY, Date.now()); return dlg.close(); }
    const act = e.target.closest("[data-install]")?.dataset.install;
    if (!act) return;
    if (act === "go" && deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice.catch(() => ({}));
      deferred = null;
      dlg.close();
      if (outcome !== "accepted") localStorage.setItem(DISMISS_KEY, Date.now());
    } else if (act === "external") {
      location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
    } else if (act === "copy") {
      try { await navigator.clipboard.writeText(location.href); toast("주소를 복사했어요. 크롬/사파리에 붙여넣어 주세요"); }
      catch { prompt("이 주소를 복사해서 크롬/사파리에서 열어주세요", location.href); }
    } else if (act === "icon") {
      dlg.close();
      openMenu();
      setTimeout(() => $("#iconSection")?.scrollIntoView({ behavior: "smooth" }), 100);
    } else if (act === "later") {
      localStorage.setItem(DISMISS_KEY, Date.now());
      dlg.close();
    }
  });

  function openMenu() { renderIconPicker(); if (!$("#menu").open) $("#btnMenu").click(); }
  $("#btnMenu")?.addEventListener("click", renderIconPicker);
  $("#btnInstall")?.addEventListener("click", () => { $("#menu").close(); openInstall(true); });

  function toast(msg) {
    const t = $("#toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 3200);
  }
})();
