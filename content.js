(function () {
  'use strict';
  if (window.__spDocLoaded) return;
  window.__spDocLoaded = true;

  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    const handlers = {
      smartExport,
      bypassBlur,
      resetSession,
      checkStatus: async () => ({ status: 'ready' })
    };
    const fn = handlers[req.action];
    if (fn) {
      fn(req).then(r => { try { sendResponse(r); } catch {} })
            .catch(e => { try { sendResponse({ success: false, error: e.message }); } catch {} });
      return true;
    }
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function progress(text, pct) {
    try { chrome.runtime.sendMessage({ type: 'progress', text, percent: pct }); } catch {}
  }

  async function waitForMath() {
    if (window.MathJax?.typesetPromise) {
      try { await Promise.race([window.MathJax.typesetPromise(), sleep(5000)]); } catch {}
    }
    if (window.MathJax?.Hub?.Queue) {
      await Promise.race([new Promise(r => window.MathJax.Hub.Queue(() => r())), sleep(5000)]);
    }
    try { await Promise.race([document.fonts.ready, sleep(3000)]); } catch {}
    await sleep(300);
  }

  function scrollH() { return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight); }
  function scrollMax() { return scrollH() - window.innerHeight; }

  function clickLoadMore() {
    document.querySelectorAll(
      '[class*="load-more" i],[class*="show-more" i],[class*="see-more" i],[class*="continue-reading" i],button[class*="preview" i]'
    ).forEach(b => { try { b.click(); } catch {} });
  }

  async function autoScrollAll() {
    const STEP = 600, DELAY = 250;
    let stalled = 0, prevTop = -1;

    for (let i = 0; i < 600; i++) {
      window.scrollBy({ top: STEP, behavior: 'instant' });
      await sleep(DELAY);

      const top = window.pageYOffset || document.documentElement.scrollTop;
      const max = scrollMax();
      const pct = max > 0 ? Math.min(top / max * 100, 99) : 99;
      progress(`Đang nạp toàn bộ chữ và trang... ${Math.round(pct)}%`, pct * 0.5);

      if (Math.abs(top - prevTop) < 3) stalled++; else stalled = 0;
      prevTop = top;

      if (top >= max - 10 || stalled >= 8) {
        clickLoadMore();
        await sleep(500);
        if (scrollMax() <= max + 10 || stalled >= 12) break;
        stalled = 0;
      }
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await sleep(400);
  }

  function applyWatermarkOverlay() {
    document.querySelectorAll('.sp-vny-wm').forEach(e => e.remove());
    const pages = document.querySelectorAll('.pf, [data-page-no], [class*="PageCanvas" i], [class*="pageContainer" i], [class*="page-container" i], [class*="page-wrapper" i], [class*="document-page" i]');
    pages.forEach(p => {
      const wm = document.createElement('div');
      wm.className = 'sp-vny-wm';
      wm.textContent = '@vny';
      p.style.position = 'relative';
      p.appendChild(wm);
    });
  }

  async function smartExport() {
    progress('Bước 1/3 — Đang cuộn nạp văn bản gốc...', 10);
    await autoScrollAll();

    progress('Bước 2/3 — Đang hoàn thiện công thức & gỡ khóa...', 60);
    await bypassBlur();
    await waitForMath();
    applyWatermarkOverlay();

    progress('Bước 3/3 — Đang khởi tạo PDF có thể bôi đen chữ...', 90);

    let st = document.getElementById('sp-vector-print');
    if (st) st.remove();
    st = document.createElement('style');
    st.id = 'sp-vector-print';
    st.textContent = `
      @page {
        size: A4 portrait;
        margin: 8mm;
      }
      @media print {
        header, footer, nav, [class*="sidebar" i], [class*="Sidebar" i],
        [class*="banner" i], [class*="advertisement" i], [class*="ad-" i],
        [class*="cookie" i], [class*="notification" i], [class*="popup" i],
        [class*="promo" i], [class*="cta" i], [class*="social" i],
        [class*="related" i], [class*="suggestion" i], [class*="comment" i],
        [class*="breadcrumb" i], [class*="toolbar" i], [class*="sticky" i],
        [class*="overlay" i], [class*="modal" i], [class*="backdrop" i],
        [class*="watermark" i]:not(.sp-vny-wm), [role="banner"], [role="navigation"],
        iframe, [id*="google_ads"], button {
          display: none !important;
        }

        body, html {
          background: white !important;
          color: black !important;
          overflow: visible !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        [class*="document" i], [class*="viewer" i], [class*="content" i],
        [class*="page-wrapper" i], [role="document"], main {
          margin: 0 !important;
          padding: 0 !important;
          left: 0 !important;
          max-width: 100% !important;
          overflow: visible !important;
        }

        .pf, [data-page-no], [class*="pageContainer" i], [class*="page-container" i], [class*="document-page" i] {
          page-break-after: always !important;
          break-after: page !important;
          margin: 0 auto !important;
          box-shadow: none !important;
          border: none !important;
          overflow: visible !important;
        }

        .sp-vny-wm {
          display: block !important;
          position: absolute !important;
          bottom: 15px !important;
          left: 20px !important;
          font-size: 12px !important;
          color: #d1d5db !important;
          font-family: sans-serif !important;
          z-index: 999999 !important;
          pointer-events: none !important;
        }

        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          user-select: text !important;
          -webkit-user-select: text !important;
        }
      }
    `;
    document.head.appendChild(st);

    await sleep(400);
    window.print();
    setTimeout(() => document.getElementById('sp-vector-print')?.remove(), 3000);

    progress('Hoàn tất!', 100);
    return { success: true };
  }

  async function bypassBlur() {
    let count = 0;
    document.querySelectorAll(
      '[class*="blur" i],[class*="locked" i],[class*="paywall" i],[class*="premium" i],[style*="blur"]'
    ).forEach(el => {
      for (const p of ['filter','webkitFilter','backdropFilter'])
        el.style.setProperty(p, 'none', 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('pointer-events', 'auto', 'important');
      el.style.setProperty('user-select', 'auto', 'important');
      [...el.classList].filter(c => /blur|locked|paywall/i.test(c)).forEach(c => el.classList.remove(c));
      count++;
    });

    document.querySelectorAll(
      '[class*="overlay" i],[class*="paywall" i],[class*="gate" i],[class*="upsell" i],[class*="premium-wall" i],[class*="lock-overlay" i],[class*="signup-wall" i],[class*="content-gate" i],[class*="banner-premium" i]'
    ).forEach(el => {
      if (el.closest('nav') || el.closest('header')) return;
      const s = getComputedStyle(el);
      if (['fixed','absolute','sticky'].includes(s.position) ||
          /premium|unlock|sign.?up|đăng ký|subscribe|upgrade/i.test(el.textContent)) {
        el.style.setProperty('display', 'none', 'important'); count++;
      }
    });

    document.querySelectorAll('[class*="watermark" i]:not(.sp-vny-wm),[id*="watermark" i]').forEach(el => { el.remove(); count++; });

    document.querySelectorAll('[class*="hidden-page" i],[class*="premium-content" i],[class*="restricted" i]').forEach(el => {
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('overflow', 'visible', 'important');
      el.style.setProperty('height', 'auto', 'important');
      count++;
    });

    document.querySelectorAll(
      '[class*="modal" i],[class*="dialog" i],[role="dialog"],[class*="popup" i],[class*="signup" i],[class*="login-prompt" i],[class*="backdrop" i],[class*="dimmer" i]'
    ).forEach(el => {
      const s = getComputedStyle(el);
      if (s.position === 'fixed' || parseInt(s.zIndex) > 100) {
        el.style.setProperty('display', 'none', 'important'); count++;
      }
    });

    let st = document.getElementById('sp-antiblur');
    if (st) st.remove();
    st = document.createElement('style'); st.id = 'sp-antiblur';
    st.textContent = `
      [class*="blur" i]{filter:none!important;backdrop-filter:none!important}
      [class*="watermark" i]:not(.sp-vny-wm){display:none!important}
      [class*="paywall" i],[class*="content-gate" i],[class*="upsell" i],[class*="lock-overlay" i]{display:none!important}
      body,html{overflow:auto!important;position:static!important}
      *{user-select:auto!important;-webkit-user-select:auto!important}
    `;
    document.head.appendChild(st);
    document.body.style.setProperty('overflow', 'auto', 'important');
    return { success: true, actionsPerformed: count };
  }

  async function resetSession() {
    try { chrome.runtime.sendMessage({ action: 'cleanCookies' }); } catch {}
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
    return { success: true };
  }
})();
