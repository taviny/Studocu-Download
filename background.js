chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'captureTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' })
      .then(dataUrl => sendResponse({ dataUrl }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.action === 'cleanCookies') {
    cleanAllCookies().then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

async function cleanAllCookies() {
  for (const domain of ['.studocu.com', '.studocu.vn']) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      for (const c of cookies) {
        await chrome.cookies.remove({ url: `https://${c.domain.replace(/^\./, '')}${c.path}`, name: c.name });
      }
    } catch {}
  }
}