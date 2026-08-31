const btnExport = document.getElementById("btn-export-a4");
const btnUnblur = document.getElementById("btn-unblur");
const btnReload = document.getElementById("btn-reload");
const labelStatus = document.getElementById("status-text");
const dot = document.querySelector(".dot");

function setStatus(msg, color = "#a3a3a3") {
  if (labelStatus) labelStatus.textContent = msg;
  if (dot) {
    dot.style.backgroundColor = color;
  }
}

async function sendToActiveTab(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || (!tab.url.includes("studocu.com") && !tab.url.includes("studocu.vn"))) {
    setStatus("Vui lòng mở trang Studocu", "#ef4444");
    return null;
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, { action });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["libs/jspdf.umd.min.js"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["libs/html2canvas.min.js"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      return await chrome.tabs.sendMessage(tab.id, { action });
    } catch {
      setStatus("Vui lòng F5 lại trang", "#ef4444");
      return null;
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url && (tab.url.includes("studocu.com") || tab.url.includes("studocu.vn"))) {
    setStatus("Đang gỡ mờ...", "#10b981");
    sendToActiveTab("bypassBlur");
  } else {
    setStatus("Chưa mở trang Studocu", "#ef4444");
  }
});

btnExport.onclick = async () => {
  setStatus("Đang xuất PDF...", "#3b82f6");
  const res = await sendToActiveTab("smartExport");
  if (res?.success) {
    setStatus("Xuất PDF hoàn tất", "#10b981");
  } else if (res?.error) {
    setStatus(res.error, "#ef4444");
  }
};

btnUnblur.onclick = async () => {
  setStatus("Đang gỡ mờ...", "#3b82f6");
  const res = await sendToActiveTab("bypassBlur");
  if (res?.success) {
    setStatus("Gỡ mờ hoàn tất", "#10b981");
  }
};

btnReload.onclick = async () => {
  setStatus("Đang làm mới...", "#3b82f6");
  await sendToActiveTab("resetSession");
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "progress") {
    setStatus(msg.text || `Đang xử lý ${msg.percent}%...`, "#3b82f6");
    if (msg.percent >= 100) {
      setStatus("Hoàn tất", "#10b981");
    }
  }
});