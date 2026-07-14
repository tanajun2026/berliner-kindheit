/* ================================================================
   地図・図版 拡大ビューア（v2）
   - サムネイル／「拡大表示」ボタン（.js-lupe[data-src][data-titel]）から起動
   - ドラッグ＝移動（マウス・タッチ・ペン対応）
   - ホイール／ピンチ＝拡大縮小、＋－・全体・原寸ボタン
   - Esc で閉じる、矢印キーで移動
   依存ライブラリなし。file:// 直開きでも動作。

   v2 での修正：
   - 画像への touch-action:none 指定（タッチ端末でブラウザが
     ジェスチャーを横取りして pointercancel になる問題の修正）
   - 画像の既定ドラッグ（HTML5 DnD）と選択動作の抑止
     （Firefox 等でドラッグ移動が効かない問題の修正）
   - pointerdown/move での preventDefault、window レベルでの
     move/up 監視（ポインタキャプチャ非対応環境への保険）
   ================================================================ */
(function () {
  "use strict";

  var viewer, stage, img, titleEl, loadEl;
  var scale = 1, minScale = 0.05, maxScale = 8;
  var tx = 0, ty = 0;
  var natW = 0, natH = 0;
  var pointers = new Map();
  var lastDist = 0, lastMid = null;
  var lastFocus = null;

  function buildViewer() {
    viewer = document.createElement("div");
    viewer.className = "viewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", "拡大表示");
    viewer.innerHTML =
      '<div class="viewer-kopf">' +
      '  <span class="titel"></span>' +
      '  <button type="button" data-akt="minus" aria-label="縮小">－</button>' +
      '  <button type="button" data-akt="plus" aria-label="拡大">＋</button>' +
      '  <button type="button" data-akt="fit">全体</button>' +
      '  <button type="button" data-akt="voll">原寸</button>' +
      '  <button type="button" data-akt="zu">閉じる ×</button>' +
      "</div>" +
      '<div class="viewer-buehne">' +
      '  <div class="viewer-lade">読み込み中……</div>' +
      "</div>" +
      '<div class="viewer-fuss">ドラッグで移動／ホイール・ピンチで拡大縮小／Esc で閉じる</div>';
    document.body.appendChild(viewer);

    stage = viewer.querySelector(".viewer-buehne");
    titleEl = viewer.querySelector(".titel");
    loadEl = viewer.querySelector(".viewer-lade");

    viewer.querySelector(".viewer-kopf").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var akt = b.getAttribute("data-akt");
      if (akt === "zu") close();
      else if (akt === "plus") zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.35);
      else if (akt === "minus") zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1 / 1.35);
      else if (akt === "fit") fit();
      else if (akt === "voll") setScale(1, stage.clientWidth / 2, stage.clientHeight / 2);
    });

    stage.addEventListener("wheel", function (e) {
      e.preventDefault();
      if (!img) return;
      var r = stage.getBoundingClientRect();
      var f = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      zoomAt(e.clientX - r.left, e.clientY - r.top, f);
    }, { passive: false });

    /* ---- ドラッグ・ピンチ（Pointer Events） ---- */
    stage.addEventListener("pointerdown", function (e) {
      if (!img) return;
      /* 既定動作（画像DnD・選択・タッチジェスチャー）を確実に止める */
      e.preventDefault();
      if (stage.setPointerCapture) {
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) stage.classList.add("greift");
      if (pointers.size === 2) {
        var p = Array.from(pointers.values());
        lastDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        lastMid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      }
    });

    function move(e) {
      if (!pointers.has(e.pointerId)) return;
      if (e.cancelable) e.preventDefault();
      var prev = pointers.get(e.pointerId);
      var cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);

      if (pointers.size === 1) {
        tx += cur.x - prev.x;
        ty += cur.y - prev.y;
        apply();
      } else if (pointers.size === 2) {
        var p = Array.from(pointers.values());
        var dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        var mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
        var r = stage.getBoundingClientRect();
        if (lastDist > 0) zoomAt(mid.x - r.left, mid.y - r.top, dist / lastDist);
        if (lastMid) { tx += mid.x - lastMid.x; ty += mid.y - lastMid.y; apply(); }
        lastDist = dist;
        lastMid = mid;
      }
    }

    function lift(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) { lastDist = 0; lastMid = null; }
      if (pointers.size === 0) stage.classList.remove("greift");
    }

    /* キャプチャが効かない環境でも取りこぼさないよう window でも監視 */
    stage.addEventListener("pointermove", move);
    window.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", lift);
    stage.addEventListener("pointercancel", lift);
    window.addEventListener("pointerup", lift);
    window.addEventListener("pointercancel", lift);

    /* ---- Pointer Events 非対応環境向けのマウス代替 ---- */
    if (!window.PointerEvent) {
      var mDown = false, mPrev = null;
      stage.addEventListener("mousedown", function (e) {
        if (!img) return;
        e.preventDefault();
        mDown = true; mPrev = { x: e.clientX, y: e.clientY };
        stage.classList.add("greift");
      });
      window.addEventListener("mousemove", function (e) {
        if (!mDown) return;
        tx += e.clientX - mPrev.x;
        ty += e.clientY - mPrev.y;
        mPrev = { x: e.clientX, y: e.clientY };
        apply();
      });
      window.addEventListener("mouseup", function () {
        mDown = false;
        stage.classList.remove("greift");
      });
    }

    /* 画像上での HTML5 ドラッグ＆ドロップと選択を全面的に禁止 */
    stage.addEventListener("dragstart", function (e) { e.preventDefault(); });
    stage.addEventListener("selectstart", function (e) { e.preventDefault(); });

    document.addEventListener("keydown", function (e) {
      if (!viewer.classList.contains("offen")) return;
      var step = 60;
      switch (e.key) {
        case "Escape": close(); break;
        case "+": case "=": zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.25); break;
        case "-": case "_": zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 0.8); break;
        case "ArrowLeft": tx += step; apply(); break;
        case "ArrowRight": tx -= step; apply(); break;
        case "ArrowUp": ty += step; apply(); break;
        case "ArrowDown": ty -= step; apply(); break;
        case "0": fit(); break;
        default: return;
      }
      e.preventDefault();
    });

    window.addEventListener("resize", function () {
      if (viewer.classList.contains("offen") && img) apply();
    });
  }

  function apply() {
    clamp();
    img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
  }

  function clamp() {
    if (!img) return;
    var vw = stage.clientWidth, vh = stage.clientHeight;
    var w = natW * scale, h = natH * scale;
    var margin = 80;
    if (w <= vw) tx = (vw - w) / 2;
    else tx = Math.min(margin, Math.max(vw - w - margin, tx));
    if (h <= vh) ty = (vh - h) / 2;
    else ty = Math.min(margin, Math.max(vh - h - margin, ty));
  }

  function setScale(next, cx, cy) {
    next = Math.min(maxScale, Math.max(minScale, next));
    var f = next / scale;
    tx = cx - (cx - tx) * f;
    ty = cy - (cy - ty) * f;
    scale = next;
    apply();
  }

  function zoomAt(cx, cy, factor) { setScale(scale * factor, cx, cy); }

  function fit() {
    if (!img) return;
    var vw = stage.clientWidth, vh = stage.clientHeight;
    scale = Math.min(vw / natW, vh / natH);
    minScale = Math.min(scale * 0.5, 0.05);
    tx = (vw - natW * scale) / 2;
    ty = (vh - natH * scale) / 2;
    apply();
  }

  function open(src, titel, triggerEl) {
    if (!viewer) buildViewer();
    lastFocus = triggerEl || document.activeElement;
    titleEl.textContent = titel || "";
    if (img) { img.remove(); img = null; }
    pointers.clear();
    loadEl.style.display = "flex";
    loadEl.textContent = "読み込み中……";
    viewer.classList.add("offen");
    document.body.style.overflow = "hidden";

    var el = new Image();
    el.alt = titel || "図版";
    el.draggable = false;                    /* Firefox の画像DnD対策 */
    el.style.touchAction = "none";           /* タッチ横取り対策 */
    el.setAttribute("draggable", "false");
    el.onload = function () {
      natW = el.naturalWidth;
      natH = el.naturalHeight;
      img = el;
      stage.appendChild(el);
      loadEl.style.display = "none";
      fit();
    };
    el.onerror = function () {
      loadEl.textContent = "画像を読み込めませんでした（" + src + "）";
    };
    el.src = src;
    viewer.querySelector('[data-akt="zu"]').focus();
  }

  function close() {
    viewer.classList.remove("offen");
    document.body.style.overflow = "";
    pointers.clear();
    stage.classList.remove("greift");
    if (img) { img.remove(); img = null; }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest(".js-lupe");
    if (!t) return;
    e.preventDefault();
    open(t.getAttribute("data-src"), t.getAttribute("data-titel"), t);
  });
})();
