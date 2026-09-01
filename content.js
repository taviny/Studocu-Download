
(function () {
  'use strict';
  if (window.__sp27) return;
  window.__sp27 = true;

  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    const handlers = {
      smartExport, bypassBlur, copyText, downloadImages,
      readingMode, printPDF, resetSession,
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

  function docTitle() {
    const el = document.querySelector('h1') || document.querySelector('[class*="title" i]');
    const raw = el?.textContent?.trim() || document.title;
    return raw.replace(/[<>:"/\\|?*\n\r]/g, '').replace(/\s+/g, ' ').substring(0, 80) || 'studocu-doc';
  }

  async function captureViewport() {
    const resp = await chrome.runtime.sendMessage({ action: 'captureTab' });
    return resp?.dataUrl || null;
  }

  function cropImage(dataUrl, cropX, cropY, cropW, cropH, dpr = 1, isFinal = false) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const safeX = Math.max(0, cropX);
        const safeY = Math.max(0, cropY);
        const safeW = Math.max(1, Math.min(cropW, img.width - safeX));
        const safeH = Math.max(1, Math.min(cropH, img.height - safeY));

        const canvas = document.createElement('canvas');
        canvas.width = safeW;
        canvas.height = safeH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, safeW, safeH);
        ctx.drawImage(img, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);

        if (isFinal) {
          const fontSize = Math.floor(16 * dpr);
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.fillStyle = '#555555';
          ctx.fillText('@vny', fontSize, safeH - fontSize);
        }

        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 1.0),
          width: safeW,
          height: safeH
        });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function findContentArea() {
    const selectors = [
      '[class*="viewer-content" i]',
      '[class*="ViewerContent" i]',
      '[class*="DocumentViewer" i]',
      '[class*="document-viewer" i]',
      '[class*="page-viewer" i]',
      '[class*="PageViewer" i]',
      '[role="document"]',
      '[class*="doc-content" i]',
      'main [class*="content" i]',
      'main'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetWidth > 200 && el.offsetHeight > 200) {
        return el;
      }
    }

    const candidates = document.querySelectorAll('main, article, section, [class*="content" i]');
    let best = null, bestArea = 0;
    for (const el of candidates) {
      const area = el.offsetWidth * el.offsetHeight;
      if (area > bestArea && el.offsetWidth > 300) {
        best = el;
        bestArea = area;
      }
    }
    return best || document.body;
  }

  function findPageElements() {
    const selectors = [
      '.pf',
      '[data-page-no]',
      '[data-page-number]',
      '[data-page-index]',
      '[class*="PageCanvas" i]',
      '[class*="page_view" i]',
      '[class*="PageView" i]',
      '[class*="pageContainer" i]',
      '[class*="page-container" i]',
      '[class*="page-wrapper" i]',
      '[class*="DocumentPage" i]',
      '[class*="document-page" i]',
      '[class*="page-content" i]',
      '[id^="pf"]',
      '[id^="page-"]',
      '.page'
    ];

    for (const sel of selectors) {
      const list = Array.from(document.querySelectorAll(sel)).filter(el => {
        const rect = el.getBoundingClientRect();
        const h = el.offsetHeight || rect.height;
        const w = el.offsetWidth || rect.width;
        return h > 200 && w > 200;
      });
      if (list.length > 0) {
        console.log(`Studocu PRO: Found ${list.length} pages using selector "${sel}"`);
        return list;
      }
    }

    const viewer = findContentArea();
    if (viewer && viewer !== document.body) {
      const children = Array.from(viewer.children).filter(el => {
        const h = el.offsetHeight;
        const w = el.offsetWidth;
        return h > 300 && w > 200;
      });
      if (children.length > 0) {
        console.log(`Studocu PRO: Found ${children.length} direct viewer children pages`);
        return children;
      }
    }

    return [];
  }

  // ============================================
  // MATH WAIT
  // ============================================

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

  async function autoScrollAll() {
    const STEP = 600, DELAY = 250;
    let stalled = 0, prevTop = -1;

    for (let i = 0; i < 600; i++) {
      window.scrollBy({ top: STEP, behavior: 'instant' });
      await sleep(DELAY);

      const top = window.pageYOffset || document.documentElement.scrollTop;
      const max = scrollMax();
      const pct = max > 0 ? Math.min(top / max * 100, 99) : 99;
      progress(`Đang cuộn tải trang... ${Math.round(pct)}%`, pct * 0.30);

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

  function scrollH() { return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight); }
  function scrollMax() { return scrollH() - window.innerHeight; }

  function clickLoadMore() {
    document.querySelectorAll(
      '[class*="load-more" i],[class*="show-more" i],[class*="see-more" i],[class*="continue-reading" i],button[class*="preview" i]'
    ).forEach(b => { try { b.click(); } catch {} });
  }


  function enterCaptureMode() {
    let st = document.getElementById('sp-capture');
    if (st) st.remove();
    st = document.createElement('style');
    st.id = 'sp-capture';
    st.textContent = `
      header, footer, nav,
      [class*="sidebar" i], [class*="Sidebar" i],
      [class*="banner" i], [class*="advertisement" i],
      [class*="ad-" i], [class*="cookie" i],
      [class*="notification" i], [class*="popup" i],
      [class*="promo" i], [class*="cta" i],
      [class*="social" i], [class*="related" i],
      [class*="suggestion" i], [class*="comment" i],
      [class*="breadcrumb" i], [class*="toolbar" i],
      [class*="sticky-header" i], [class*="StickyHeader" i],
      [class*="flash-message" i],
      [class*="overlay" i], [class*="modal" i],
      [class*="backdrop" i], [class*="dimmer" i],
      [role="banner"], [role="navigation"],
      [class*="watermark" i],
      iframe[src*="ad"], [id*="google_ads"],
      [class*="upsell" i], [class*="paywall" i],
      [class*="content-gate" i] {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }

      [class*="blur" i] {
        filter: none !important;
        -webkit-filter: none !important;
        backdrop-filter: none !important;
      }

      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: white !important;
        overflow-x: auto !important;
        width: 100% !important;
      }

      [class*="document" i],
      [class*="viewer" i],
      [class*="content" i],
      [class*="page-wrapper" i],
      [role="document"],
      main, section, article {
        margin-left: 0 !important;
        margin-right: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        left: 0 !important;
        max-width: 100% !important;
        overflow: visible !important;
      }

      .pf, [data-page-no], [class*="PageCanvas" i], [class*="PageView" i], [class*="pageContainer" i], [class*="page-container" i] {
        margin-left: 0 !important;
        left: 0 !important;
        position: relative !important;
        overflow: visible !important;
      }

      mjx-container, .MathJax, .katex, .katex-display {
        visibility: visible !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(st);
  }

  function exitCaptureMode() {
    document.getElementById('sp-capture')?.remove();
  }



  async function capturePageElement(pageEl, dpr) {
    window.scrollTo({ left: 0 });
    pageEl.scrollIntoView({ behavior: 'instant', block: 'start', inline: 'start' });
    await sleep(300);

    const pageBounding = pageEl.getBoundingClientRect();
    const pageAbsTop = window.pageYOffset + pageBounding.top;

    const fullW = Math.max(pageEl.scrollWidth, pageEl.offsetWidth, pageBounding.width);
    const fullH = Math.max(pageEl.scrollHeight, pageEl.offsetHeight, pageBounding.height);

    const viewH = window.innerHeight;

    if (fullH <= viewH) {
      window.scrollTo({ top: Math.max(0, pageAbsTop), left: 0, behavior: 'instant' });
      await sleep(300);

      const curRect = pageEl.getBoundingClientRect();
      const raw = await captureViewport();
      if (!raw) return null;

      const cropX = Math.max(0, Math.floor(curRect.left * dpr));
      const cropW = Math.floor((fullW + 10) * dpr);
      const cropH = Math.floor(fullH * dpr);

      return await cropImage(raw, cropX, Math.max(0, Math.floor(curRect.top * dpr)), cropW, cropH, dpr, true);
    }

    const numSteps = Math.ceil(fullH / viewH);
    const slices = [];

    for (let s = 0; s < numSteps; s++) {
      const stepScrollTop = pageAbsTop + s * viewH;
      window.scrollTo({ top: stepScrollTop, left: 0, behavior: 'instant' });
      await sleep(300);

      const curRect = pageEl.getBoundingClientRect();
      const curSliceH = Math.min(viewH, fullH - s * viewH);

      const raw = await captureViewport();
      if (raw) {
        const sliceCropY = (s === 0) ? Math.max(0, Math.floor(curRect.top * dpr)) : 0;
        const cropX = Math.max(0, Math.floor(curRect.left * dpr));
        const cropW = Math.floor((fullW + 10) * dpr);

        const sliceCrop = await cropImage(
          raw,
          cropX,
          sliceCropY,
          cropW,
          Math.floor(curSliceH * dpr),
          dpr,
          false
        );
        if (sliceCrop) slices.push(sliceCrop);
      }
    }

    if (slices.length === 0) return null;
    if (slices.length === 1) return slices[0];

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = slices[0].width;
    fullCanvas.height = Math.floor(fullH * dpr);
    const ctx = fullCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

    let curY = 0;
    for (const sl of slices) {
      const img = await loadImage(sl.dataUrl);
      if (img) {
        ctx.drawImage(img, 0, curY);
        curY += sl.height;
      }
    }

    const fontSize = Math.floor(16 * dpr);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = '#555555';
    ctx.fillText('@vny', fontSize, fullCanvas.height - fontSize);

    return {
      dataUrl: fullCanvas.toDataURL('image/jpeg', 1.0),
      width: fullCanvas.width,
      height: fullCanvas.height
    };
  }


  function findCleanCutY(ctx, width, targetY, maxSearch = 90) {
    const startY = Math.max(10, Math.floor(targetY - maxSearch));
    const endY = Math.min(ctx.canvas.height - 10, Math.floor(targetY + maxSearch / 2));

    let bestY = targetY;
    let maxWhite = -1;

    for (let y = startY; y <= endY; y += 2) {
      try {
        const row = ctx.getImageData(0, y, width, 1).data;
        let whiteCount = 0;
        for (let i = 0; i < row.length; i += 4) {
          if (row[i] > 240 && row[i + 1] > 240 && row[i + 2] > 240) {
            whiteCount++;
          }
        }
        if (whiteCount > maxWhite) {
          maxWhite = whiteCount;
          bestY = y;
          if (whiteCount >= width * 0.98) {
            return y;
          }
        }
      } catch (e) {
        break;
      }
    }
    return bestY;
  }

  async function captureContinuousPages(contentEl, dpr) {
    window.scrollTo({ left: 0 });
    const contentRect = contentEl.getBoundingClientRect();
    const fullW = Math.max(contentEl.scrollWidth, contentEl.offsetWidth, contentRect.width);

    const cropX = Math.max(0, Math.floor(contentRect.left * dpr));
    const cropW = Math.floor((fullW + 10) * dpr);

    const viewH = window.innerHeight;
    const totalH = scrollH();
    const numSlices = Math.max(1, Math.ceil(totalH / viewH));

    const rawSlices = [];
    for (let i = 0; i < numSlices; i++) {
      window.scrollTo({ top: i * viewH, left: 0, behavior: 'instant' });
      await sleep(350);

      progress(`Đang quét phần ${i + 1}/${numSlices}...`, 35 + (i / numSlices) * 45);
      const raw = await captureViewport();
      if (!raw) continue;

      const sliceH = Math.min(viewH, totalH - i * viewH);
      const cropped = await cropImage(raw, cropX, 0, cropW, Math.floor(sliceH * dpr), dpr, false);
      if (cropped) rawSlices.push(cropped);
    }

    if (rawSlices.length === 0) return [];

    const stitchedCanvas = document.createElement('canvas');
    stitchedCanvas.width = rawSlices[0].width;
    let totalCanvasH = 0;
    rawSlices.forEach(s => totalCanvasH += s.height);
    stitchedCanvas.height = totalCanvasH;

    const ctx = stitchedCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, stitchedCanvas.width, totalCanvasH);

    let curY = 0;
    for (const s of rawSlices) {
      const img = await loadImage(s.dataUrl);
      if (img) {
        ctx.drawImage(img, 0, curY);
        curY += s.height;
      }
    }

    const a4Ratio = 297 / 210;
    const targetSliceH = Math.floor(stitchedCanvas.width * a4Ratio);
    const finalPages = [];
    const fontSize = Math.floor(16 * dpr);

    let currentSliceTop = 0;
    while (currentSliceTop < totalCanvasH) {
      let idealBottom = currentSliceTop + targetSliceH;

      if (idealBottom >= totalCanvasH) {
        const actualH = totalCanvasH - currentSliceTop;
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = stitchedCanvas.width;
        pageCanvas.height = targetSliceH;
        const pCtx = pageCanvas.getContext('2d');
        pCtx.fillStyle = '#ffffff';
        pCtx.fillRect(0, 0, stitchedCanvas.width, targetSliceH);
        pCtx.drawImage(stitchedCanvas, 0, currentSliceTop, stitchedCanvas.width, actualH, 0, 0, stitchedCanvas.width, actualH);

        pCtx.font = `bold ${fontSize}px sans-serif`;
        pCtx.fillStyle = '#555555';
        pCtx.fillText('@vny', fontSize, targetSliceH - fontSize);

        finalPages.push({
          dataUrl: pageCanvas.toDataURL('image/jpeg', 1.0),
          width: stitchedCanvas.width,
          height: targetSliceH
        });
        break;
      }

      const cleanBottom = findCleanCutY(ctx, stitchedCanvas.width, idealBottom, Math.floor(targetSliceH * 0.12));
      const actualH = cleanBottom - currentSliceTop;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = stitchedCanvas.width;
      pageCanvas.height = targetSliceH;
      const pCtx = pageCanvas.getContext('2d');
      pCtx.fillStyle = '#ffffff';
      pCtx.fillRect(0, 0, stitchedCanvas.width, targetSliceH);
      pCtx.drawImage(stitchedCanvas, 0, currentSliceTop, stitchedCanvas.width, actualH, 0, 0, stitchedCanvas.width, actualH);

      pCtx.font = `bold ${fontSize}px sans-serif`;
      pCtx.fillStyle = '#555555';
      pCtx.fillText('@vny', fontSize, targetSliceH - fontSize);

      finalPages.push({
        dataUrl: pageCanvas.toDataURL('image/jpeg', 1.0),
        width: stitchedCanvas.width,
        height: targetSliceH
      });

      currentSliceTop = cleanBottom;
    }

    return finalPages;
  }



  async function smartExport() {
    const jsPDFLib = (typeof jspdf !== 'undefined') ? jspdf : window.jspdf;
    if (!jsPDFLib?.jsPDF) return { success: false, error: 'jsPDF chưa sẵn sàng. Tải lại trang (F5).' };
    const { jsPDF } = jsPDFLib;

    progress('Bước 1/4 — Đang cuộn tải nội dung...', 2);
    await autoScrollAll();

    progress('Bước 2/4 — Đang chờ công thức toán...', 30);
    await waitForMath();

    progress('Bước 3/4 — Đang chuẩn bị chụp...', 33);
    enterCaptureMode();
    await sleep(600);

    const dpr = window.devicePixelRatio || 1;
    const pageEls = findPageElements();
    let capturedPages = [];

    if (pageEls.length > 0) {
      console.log(`Studocu PRO: Capturing ${pageEls.length} individual document pages`);
      for (let i = 0; i < pageEls.length; i++) {
        const pct = 35 + (i / pageEls.length) * 55;
        progress(`Đang chụp trang ${i + 1}/${pageEls.length}...`, pct);

        const pageImg = await capturePageElement(pageEls[i], dpr);
        if (pageImg) {
          capturedPages.push(pageImg);
        } else {
          console.warn(`Studocu PRO: Failed to capture page ${i + 1}`);
        }
      }
    } else {
      console.log('Studocu PRO: Using smart whitespace A4 continuous slicer');
      const contentEl = findContentArea();
      capturedPages = await captureContinuousPages(contentEl, dpr);
    }

    exitCaptureMode();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

    if (capturedPages.length === 0) {
      return { success: false, error: 'Không chụp được trang nào. Thử "In PDF Chính Xác" thay thế.' };
    }

    progress(`Bước 4/4 — Đang tạo PDF A4 dọc (${capturedPages.length} trang)...`, 92);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 5;

    const availW = pageWidth - margin * 2;
    const availH = pageHeight - margin * 2;

    for (let i = 0; i < capturedPages.length; i++) {
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }

      const img = capturedPages[i];
      const ratio = Math.min(availW / img.width, availH / img.height);
      const imgW = img.width * ratio;
      const imgH = img.height * ratio;

      const posX = margin + (availW - imgW) / 2;
      const posY = margin + (availH - imgH) / 2;

      pdf.addImage(img.dataUrl, 'JPEG', posX, posY, imgW, imgH, undefined, 'FAST');
      
      pdf.link(posX, posY + imgH - 10, 20, 10, { url: 'https://github.com/taviny/Studocu-Download' });
    }

    progress('Đang lưu file...', 98);
    pdf.save(`${docTitle()}.pdf`);
    progress('Hoàn thành!', 100);
    return { success: true };
  }


  async function bypassBlur() {
    let count = 0;
    progress('Đang xoá mờ...', 15);
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

    progress('Đang xoá overlay...', 40);
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

    progress('Đang xoá watermark...', 55);
    document.querySelectorAll('[class*="watermark" i],[id*="watermark" i]').forEach(el => { el.remove(); count++; });

    progress('Đang hiện nội dung ẩn...', 70);
    document.querySelectorAll('[class*="hidden-page" i],[class*="premium-content" i],[class*="restricted" i]').forEach(el => {
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('overflow', 'visible', 'important');
      el.style.setProperty('height', 'auto', 'important');
      count++;
    });

    progress('Đang xoá popup...', 85);
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
      [class*="watermark" i]{display:none!important}
      [class*="paywall" i],[class*="content-gate" i],[class*="upsell" i],[class*="lock-overlay" i]{display:none!important}
      body,html{overflow:auto!important;position:static!important}
      *{user-select:auto!important;-webkit-user-select:auto!important}
    `;
    document.head.appendChild(st);
    document.body.style.setProperty('overflow', 'auto', 'important');
    progress('Dọn cookies...', 95);
    cleanStorage();
    progress('Hoàn thành!', 100);
    return { success: true, actionsPerformed: count };
  }

  // ============================================
  // 3. COPY TEXT
  // ============================================

  async function copyText() {
    progress('Đang trích xuất...', 30);
    const viewer = findContentArea();
    let text = extractText(viewer).trim();
    if (!text) return { success: false, error: 'Không tìm thấy văn bản.' };
    progress('Đang copy...', 80);
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    progress('Hoàn thành!', 100);
    return { success: true, charCount: text.length };
  }

  function extractText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('script,style,noscript').forEach(s => s.remove());
    c.querySelectorAll('mjx-container,.MathJax').forEach(m => {
      const alt = m.getAttribute('aria-label') || m.getAttribute('alt') || m.textContent;
      const s = document.createElement('span'); s.textContent = ` ${alt} `; m.replaceWith(s);
    });
    c.querySelectorAll('.katex').forEach(k => {
      const a = k.querySelector('annotation');
      if (a) { const s = document.createElement('span'); s.textContent = ` ${a.textContent} `; k.replaceWith(s); }
    });
    return c.textContent || c.innerText || '';
  }

  async function downloadImages() {
    await waitForMath();
    enterCaptureMode();
    await sleep(500);

    const dpr = window.devicePixelRatio || 1;
    const pageEls = findPageElements();
    const title = docTitle();
    let count = 0;

    if (pageEls.length > 0) {
      for (let i = 0; i < pageEls.length; i++) {
        progress(`Đang chụp trang ${i + 1}/${pageEls.length}...`, (i / pageEls.length) * 90 + 5);
        const pageImg = await capturePageElement(pageEls[i], dpr);
        if (pageImg) {
          const a = document.createElement('a');
          a.download = `${title}_trang_${i + 1}.png`;
          a.href = pageImg.dataUrl;
          document.body.appendChild(a); a.click(); a.remove();
          count++;
          await sleep(300);
        }
      }
    } else {
      const contentEl = findContentArea();
      const pages = await captureContinuousPages(contentEl, dpr);
      for (let i = 0; i < pages.length; i++) {
        const a = document.createElement('a');
        a.download = `${title}_trang_${i + 1}.png`;
        a.href = pages[i].dataUrl;
        document.body.appendChild(a); a.click(); a.remove();
        count++;
        await sleep(300);
      }
    }

    exitCaptureMode();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    progress('Hoàn thành!', 100);
    return { success: true, count };
  }

  let readingOn = false;
  async function readingMode() {
    readingOn = !readingOn;
    let st = document.getElementById('sp-readmode');
    if (readingOn) {
      if (st) st.remove();
      st = document.createElement('style'); st.id = 'sp-readmode';
      st.textContent = `
        header,footer,nav,[class*="sidebar" i],[class*="banner" i],[class*="advertisement" i],
        [class*="ad-" i],[class*="cookie" i],[class*="notification" i],[class*="popup" i],
        [class*="promo" i],[class*="cta" i],[class*="social" i],[class*="related" i],
        [class*="suggestion" i],[class*="comment" i],[class*="breadcrumb" i],
        [class*="toolbar" i]:not([class*="document"]),
        [role="banner"],[role="navigation"],
        [class*="sticky-header" i]{display:none!important}
        body{background:#fafafa!important;overflow:auto!important}
        [class*="document" i],[class*="viewer" i],main{max-width:100%!important;margin:0 auto!important;padding:20px!important;width:100%!important}
        *[style*="position: fixed"],*[style*="position:fixed"]{position:static!important}
      `;
      document.head.appendChild(st);
    } else { if (st) st.remove(); }
    return { success: true, enabled: readingOn };
  }



  async function printPDF() {
    progress('Đang chuẩn bị in A4 dọc...', 20);
    await waitForMath();
    const st = document.createElement('style'); st.id = 'sp-print';
    st.textContent = `
      @page {
        size: A4 portrait;
        margin: 10mm;
      }
      @media print{
        header,footer,nav,[class*="sidebar" i],[class*="banner" i],
        [class*="overlay" i],[class*="modal" i],[class*="popup" i],
        [class*="advertisement" i],[class*="cookie" i],[class*="toolbar" i],
        [class*="breadcrumb" i],[class*="sticky" i],button,
        [role="banner"],[role="navigation"]{display:none!important}
        body{background:white!important;overflow:visible!important}
        [class*="blur" i]{filter:none!important}
        [class*="watermark" i]{display:none!important}
        *{color-adjust:exact!important;-webkit-print-color-adjust:exact!important}
      }
    `;
    document.head.appendChild(st);
    await sleep(200);
    window.print();
    setTimeout(() => document.getElementById('sp-print')?.remove(), 3000);
    return { success: true };
  }



  async function resetSession() {
    progress('Đang dọn dẹp...', 30);
    cleanStorage();
    try { chrome.runtime.sendMessage({ action: 'cleanCookies' }); } catch {}
    progress('Đang tải lại...', 80);
    await sleep(500);
    window.location.reload();
    return { success: true };
  }

  function cleanStorage() {
    document.cookie.split(';').forEach(c => {
      const n = c.split('=')[0].trim();
      if (!n) return;
      ['.studocu.com','.studocu.vn',''].forEach(d => {
        document.cookie = `${n}=;expires=Thu,01 Jan 1970 00:00:00 UTC;path=/;${d?'domain='+d+';':''}`;
      });
    });
    const kw = ['premium','paywall','gate','views','limit','counter','quota','session','auth','token'];
    [localStorage, sessionStorage].forEach(s => {
      try {
        for (let i = s.length - 1; i >= 0; i--) {
          const k = s.key(i);
          if (k && kw.some(w => k.toLowerCase().includes(w))) s.removeItem(k);
        }
      } catch {}
    });
  }

  console.log('Studocu Download @vny');
})();
