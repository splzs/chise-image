const $ = (id) => document.getElementById(id);

const HISTORY_DB_NAME = "qishi-image-history";
const HISTORY_STORE_NAME = "entries";
const HISTORY_LIMIT = 24;

const ACADEMIC_PRESETS = [
  {
    name: "Nature 图形摘要",
    prompt:
      "Generate a clean Nature-style graphical abstract, white background, precise scientific illustration, balanced composition, labeled modules, publication-ready, high clarity.",
  },
  {
    name: "机制示意图",
    prompt:
      "Create a mechanism diagram for a biomedical research paper, minimal vector-like style, clear arrows, subtle colors, accurate molecular/cellular process, high-resolution academic figure.",
  },
  {
    name: "实验流程图",
    prompt:
      "Design an experimental workflow figure, left-to-right timeline, neat icons, concise labels, journal-ready layout, consistent line weight, white background.",
  },
  {
    name: "论文封面风",
    prompt:
      "Create a high-impact journal cover image, elegant scientific concept art, realistic lighting, refined composition, strong central subject, no text, premium academic visual style.",
  },
  {
    name: "材料结构",
    prompt:
      "Render a scientific material structure visualization, clean 3D molecular or nanoscale composition, depth, soft studio lighting, white background, publication-grade clarity.",
  },
];

const state = {
  files: [],
  refUrls: [],
  history: [],
  downloadUrl: "",
  currentResult: null,
  editSource: null,
  session: null,
};

const promptEl = $("prompt");
const refsEl = $("refs");
const refStripEl = $("refStrip");
const statusPill = $("statusPill");
const resultFigure = $("resultFigure");
const emptyState = $("emptyState");
const loadingState = $("loadingState");
const loadingText = $("loadingText");
const previewPanel = $("previewPanel");
const resultImage = $("resultImage");
const resultTitle = $("resultTitle");
const resultMeta = $("resultMeta");
const errorBox = $("errorBox");
const downloadBtn = $("downloadBtn");
const continueEditBtn = $("continueEditBtn");
const generateBtn = $("generateBtn");
const clearBtn = $("clearBtn");
const clearHistoryBtn = $("clearHistoryBtn");
const pasteBtn = $("pasteBtn");
const pastePanel = $("pastePanel");
const editSourceBanner = $("editSourceBanner");
const cancelEditSourceBtn = $("cancelEditSourceBtn");
const historyListEl = $("historyList");
const historyEmptyEl = $("historyEmpty");
const sizePresetEl = $("sizePreset");
const qualityEl = $("quality");
const formatEl = $("format");
const widthEl = $("width");
const heightEl = $("height");
const modelEl = $("model");
const presetListEl = $("presetList");
const sessionOverlay = $("sessionOverlay");
const sessionForm = $("sessionForm");
const baseUrlInput = $("baseUrlInput");
const apiKeyInput = $("apiKeyInput");
const sessionError = $("sessionError");
const settingsBtn = $("settingsBtn");
const logoutBtn = $("logoutBtn");

let loadingTimer = null;

function setStatus(text, tone = "neutral") {
  statusPill.textContent = text;
  statusPill.dataset.tone = tone;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function showSessionError(message) {
  sessionError.textContent = message;
  sessionError.classList.remove("hidden");
}

function clearSessionError() {
  sessionError.textContent = "";
  sessionError.classList.add("hidden");
}

function getMimeTypeFromFormat(format) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

function formatExpiry(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(timestamp));
}

function setSessionUi(session) {
  state.session = session?.authenticated ? session : null;
  sessionOverlay.classList.toggle("hidden", Boolean(state.session));
  settingsBtn.classList.toggle("hidden", !state.session);
  logoutBtn.classList.toggle("hidden", !state.session);

  if (state.session) {
    baseUrlInput.value = state.session.baseUrl || "";
    setStatus(`已登录 · ${formatExpiry(state.session.expiresAt)} 到期`, "good");
  } else {
    setStatus("需要配置", "bad");
  }
}

async function loadSession() {
  try {
    const response = await fetch("/api/session");
    const data = await response.json();
    if (!data.ok) throw new Error("bad session response");
    setSessionUi(data.session);
  } catch {
    setSessionUi(null);
  }
}

async function saveSession(event) {
  event.preventDefault();
  clearSessionError();

  const baseUrl = baseUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  if (!baseUrl || !apiKey) {
    showSessionError("请填写网关地址和 API Key。");
    return;
  }

  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        OPENAI_BASE_URL: baseUrl,
        OPENAI_API_KEY: apiKey,
      }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "保存失败");

    apiKeyInput.value = "";
    setSessionUi({
      authenticated: true,
      baseUrl: data.session.baseUrl,
      expiresAt: data.session.expiresAt,
    });
    setStatus("已登录", "good");
  } catch (error) {
    showSessionError(error.message || "配置保存失败。");
  }
}

async function logoutSession() {
  await fetch("/api/session", { method: "DELETE" });
  setSessionUi(null);
}

function revokeRefUrls() {
  for (const url of state.refUrls) URL.revokeObjectURL(url);
  state.refUrls = [];
}

function revokeDownloadUrl() {
  if (state.downloadUrl.startsWith("blob:")) {
    URL.revokeObjectURL(state.downloadUrl);
  }
  state.downloadUrl = "";
}

function syncNativeFileInput() {
  const transfer = new DataTransfer();
  for (const file of state.files) transfer.items.add(file);
  refsEl.files = transfer.files;
}

function normalizeClipboardFile(file, index = 0) {
  const ext = (file.type || "image/png").split("/")[1] || "png";
  const fallbackName = `clipboard-${Date.now()}-${index}.${ext}`;
  const name = file.name && file.name !== "image.png" ? file.name : fallbackName;
  return new File([file], name, {
    type: file.type || "image/png",
    lastModified: Date.now(),
  });
}

function renderRefs() {
  revokeRefUrls();
  refStripEl.innerHTML = "";

  state.files.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "ref-thumb";

    const img = document.createElement("img");
    img.alt = file.name;
    const objectUrl = URL.createObjectURL(file);
    state.refUrls.push(objectUrl);
    img.src = objectUrl;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `移除 ${file.name}`);
    remove.addEventListener("click", () => {
      state.files.splice(index, 1);
      syncNativeFileInput();
      renderRefs();
      setStatus(state.files.length ? `已载入 ${state.files.length} 张图` : "参考图已清空", "good");
    });

    item.append(img, remove);
    refStripEl.appendChild(item);
  });
}

function parseSize() {
  const match = sizePresetEl.value.match(/^(\d+)x(\d+)$/);
  if (!match) return { width: 1024, height: 1024 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function syncSizeFields() {
  const { width, height } = parseSize();
  widthEl.value = String(width);
  heightEl.value = String(height);
}

function addReferenceFiles(files) {
  const images = files
    .filter((file) => file && String(file.type || "").startsWith("image/"))
    .map((file, index) => normalizeClipboardFile(file, index));

  if (!images.length) {
    showError("没有检测到图片。");
    setStatus("没有可用图片", "bad");
    return;
  }

  clearError();
  state.files.push(...images);
  syncNativeFileInput();
  renderRefs();
  setStatus(`已载入 ${state.files.length} 张图`, "good");
}

async function readClipboardImages() {
  if (!navigator.clipboard?.read) {
    showError("当前浏览器不支持直接读取剪贴板，请点击粘贴区后按 Ctrl+V。");
    setStatus("剪贴板不可读", "bad");
    return;
  }

  try {
    const items = await navigator.clipboard.read();
    const files = [];

    for (const item of items) {
      for (const type of item.types) {
        if (!type.startsWith("image/")) continue;
        const blob = await item.getType(type);
        files.push(
          new File([blob], `clipboard-${Date.now()}.${type.split("/")[1] || "png"}`, {
            type,
          })
        );
      }
    }

    addReferenceFiles(files);
  } catch (error) {
    showError(error?.message || "读取剪贴板失败。");
    setStatus("读取失败", "bad");
  }
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();
    if (!data.ok) throw new Error("bad config response");
    modelEl.value = data.config?.model || "gpt-image-2";
  } catch {
    setStatus("离线", "bad");
  }
}

function openHistoryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getHistoryEntries() {
  const db = await openHistoryDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, "readonly");
    const store = transaction.objectStore(HISTORY_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve([...request.result].sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function putHistoryEntry(entry) {
  const db = await openHistoryDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, "readwrite");
    transaction.objectStore(HISTORY_STORE_NAME).put(entry);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteHistoryEntry(id) {
  const db = await openHistoryDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, "readwrite");
    transaction.objectStore(HISTORY_STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function clearHistoryEntries() {
  const db = await openHistoryDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, "readwrite");
    transaction.objectStore(HISTORY_STORE_NAME).clear();
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function trimHistory() {
  const entries = await getHistoryEntries();
  if (entries.length <= HISTORY_LIMIT) return;
  await Promise.all(entries.slice(HISTORY_LIMIT).map((entry) => deleteHistoryEntry(entry.id)));
}

function formatHistoryTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function dataUrlToFile(dataUrl, filename) {
  const [meta, body] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

function setEditSource(source) {
  state.editSource = source;
  editSourceBanner.classList.toggle("hidden", !source);
}

function clearEditSource() {
  setEditSource(null);
}

function syncResultMode() {
  continueEditBtn.classList.toggle("hidden", !state.currentResult);
}

function setGenerating(isGenerating, editMode = false) {
  generateBtn.disabled = isGenerating;
  generateBtn.classList.toggle("is-loading", isGenerating);
  previewPanel.classList.toggle("is-generating", isGenerating);
  loadingState.classList.toggle("hidden", !isGenerating);

  if (isGenerating) {
    emptyState.classList.add("hidden");
    resultFigure.classList.add("hidden");
    const steps = editMode
      ? ["正在读取当前结果", "正在融合修改意图", "正在生成新版本"]
      : ["正在理解提示词", "正在组织画面", "正在渲染结果"];
    let index = 0;
    loadingText.textContent = steps[index];
    loadingTimer = window.setInterval(() => {
      index = (index + 1) % steps.length;
      loadingText.textContent = steps[index];
    }, 1800);
  } else {
    window.clearInterval(loadingTimer);
    loadingTimer = null;
    loadingState.classList.add("hidden");
  }
}

function displayResult({ dataUrl, title, metaText, width, height, format }) {
  resultImage.src = dataUrl;
  resultTitle.textContent = title || "生成完成";
  resultMeta.textContent = metaText || `${width} × ${height}`;
  emptyState.classList.add("hidden");
  resultFigure.classList.remove("hidden");
  downloadBtn.classList.remove("hidden");
  state.currentResult = { dataUrl, width, height, format };
  syncResultMode();
}

function applyHistoryEntry(entry) {
  promptEl.value = entry.prompt;
  displayResult({
    dataUrl: entry.imageDataUrl,
    title: "历史结果",
    metaText: entry.metaText || `${entry.width} × ${entry.height}`,
    width: entry.width,
    height: entry.height,
    format: entry.format || "png",
  });
  revokeDownloadUrl();
  state.downloadUrl = entry.imageDataUrl;
  clearEditSource();
  setStatus("已载入历史记录", "good");
}

function createHistoryCard(entry) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "history-card";

  const thumb = document.createElement("img");
  thumb.className = "history-thumb";
  thumb.src = entry.thumbDataUrl || entry.imageDataUrl;
  thumb.alt = entry.prompt;

  const copy = document.createElement("div");
  copy.className = "history-copy";

  const title = document.createElement("strong");
  title.textContent = entry.metaLabel || "历史结果";

  const prompt = document.createElement("p");
  prompt.textContent = entry.prompt;

  const time = document.createElement("time");
  time.dateTime = new Date(entry.createdAt).toISOString();
  time.textContent = formatHistoryTime(entry.createdAt);

  copy.append(title, prompt, time);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "history-remove";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "删除历史记录");
  remove.addEventListener("click", async (event) => {
    event.stopPropagation();
    await deleteHistoryEntry(entry.id);
    state.history = state.history.filter((item) => item.id !== entry.id);
    renderHistory();
    setStatus("历史记录已删除", "good");
  });

  card.addEventListener("click", () => applyHistoryEntry(entry));
  card.append(thumb, copy, remove);
  return card;
}

function renderHistory() {
  historyListEl.innerHTML = "";
  const hasHistory = state.history.length > 0;
  historyEmptyEl.classList.toggle("hidden", hasHistory);
  clearHistoryBtn.classList.toggle("hidden", !hasHistory);

  for (const entry of state.history) {
    historyListEl.appendChild(createHistoryCard(entry));
  }
}

async function refreshHistory() {
  state.history = await getHistoryEntries();
  renderHistory();
}

async function saveHistoryEntry(entry) {
  await putHistoryEntry(entry);
  await trimHistory();
  await refreshHistory();
}

function currentResultToDataUrl(format, base64, fallbackUrl = "") {
  if (base64) return `data:${getMimeTypeFromFormat(format)};base64,${base64}`;
  return fallbackUrl;
}

function setDownloadSource(format, imageBase64, imageUrl) {
  revokeDownloadUrl();

  if (imageBase64) {
    const bytes = Uint8Array.from(atob(imageBase64), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: getMimeTypeFromFormat(format) });
    state.downloadUrl = URL.createObjectURL(blob);
    resultImage.src = state.downloadUrl;
    return;
  }

  state.downloadUrl = imageUrl || "";
  resultImage.src = state.downloadUrl;
}

async function generateImage() {
  clearError();

  if (!state.session) {
    setSessionUi(null);
    return;
  }

  const prompt = promptEl.value.trim();
  if (!prompt) {
    showError("请输入提示词。");
    return;
  }

  syncSizeFields();

  const format = formatEl.value;
  const shouldEditFromCurrent = Boolean(state.editSource?.dataUrl);
  const formData = new FormData();
  formData.set("prompt", prompt);
  formData.set("model", modelEl.value || "gpt-image-2");
  formData.set("quality", qualityEl.value);
  formData.set("format", format);
  formData.set("width", widthEl.value);
  formData.set("height", heightEl.value);
  formData.set("background", "auto");
  formData.set("action", shouldEditFromCurrent || state.files.length ? "edit" : "generate");
  formData.set("compression", "100");

  if (shouldEditFromCurrent) {
    const sourceFile = dataUrlToFile(
      state.editSource.dataUrl,
      `current-result.${state.editSource.format || "png"}`
    );
    formData.append("reference_images", sourceFile, sourceFile.name);
  }

  for (const file of state.files) {
    formData.append("reference_images", file, file.name);
  }

  setGenerating(true, shouldEditFromCurrent);
  setStatus(shouldEditFromCurrent ? "修改中" : "生成中");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "生成失败");

    const dataUrl = currentResultToDataUrl(format, data.imageBase64, data.imageUrl);
    setDownloadSource(format, data.imageBase64, data.imageUrl);

    displayResult({
      dataUrl,
      title: "生成完成",
      metaText: data.revisedPrompt || `${data.width || widthEl.value} × ${data.height || heightEl.value}`,
      width: data.width || Number(widthEl.value),
      height: data.height || Number(heightEl.value),
      format,
    });

    if (shouldEditFromCurrent && state.currentResult) {
      setEditSource(state.currentResult);
    } else {
      clearEditSource();
    }

    setStatus("已完成", "good");

    await saveHistoryEntry({
      id: `history-${Date.now()}`,
      prompt,
      imageDataUrl: dataUrl,
      thumbDataUrl: dataUrl,
      width: data.width || Number(widthEl.value),
      height: data.height || Number(heightEl.value),
      format,
      metaText: resultMeta.textContent,
      metaLabel: `${sizePresetEl.options[sizePresetEl.selectedIndex]?.text || "图片"} · ${qualityEl.selectedOptions[0]?.textContent || "自动"}`,
      createdAt: Date.now(),
    });
  } catch (error) {
    showError(error.message || "生成失败。");
    setStatus("失败", "bad");
    if (state.currentResult) {
      resultFigure.classList.remove("hidden");
    } else {
      emptyState.classList.remove("hidden");
    }
  } finally {
    setGenerating(false);
  }
}

function renderPresets() {
  presetListEl.innerHTML = "";
  for (const preset of ACADEMIC_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-button";
    button.textContent = preset.name;
    button.addEventListener("click", () => {
      const current = promptEl.value.trim();
      promptEl.value = current ? `${current}\n\n${preset.prompt}` : preset.prompt;
      promptEl.focus();
      setStatus(`已加入：${preset.name}`, "good");
    });
    presetListEl.appendChild(button);
  }
}

downloadBtn.addEventListener("click", () => {
  if (!state.downloadUrl) return;
  const anchor = document.createElement("a");
  anchor.href = state.downloadUrl;
  anchor.download = `image-${Date.now()}.${formatEl.value || "png"}`;
  anchor.click();
});

refsEl.addEventListener("change", () => {
  state.files = [...refsEl.files];
  renderRefs();
  if (state.files.length) {
    setStatus(`已载入 ${state.files.length} 张图`, "good");
  }
});

clearBtn.addEventListener("click", () => {
  state.files = [];
  refsEl.value = "";
  renderRefs();
  setStatus("参考图已清空", "good");
});

clearHistoryBtn.addEventListener("click", async () => {
  await clearHistoryEntries();
  state.history = [];
  renderHistory();
  setStatus("历史记录已清空", "good");
});

pasteBtn.addEventListener("click", readClipboardImages);

continueEditBtn.addEventListener("click", () => {
  if (!state.currentResult?.dataUrl) return;
  setEditSource(state.currentResult);
  promptEl.focus();
  setStatus("下一次将基于当前结果修改", "good");
});

cancelEditSourceBtn.addEventListener("click", () => {
  clearEditSource();
  setStatus("已取消继续修改", "good");
});

settingsBtn.addEventListener("click", () => {
  sessionOverlay.classList.remove("hidden");
});

logoutBtn.addEventListener("click", logoutSession);
sessionForm.addEventListener("submit", saveSession);

pastePanel.addEventListener("click", () => {
  pastePanel.focus();
});

pastePanel.addEventListener("focus", () => {
  pastePanel.classList.add("is-active");
});

pastePanel.addEventListener("blur", () => {
  pastePanel.classList.remove("is-active");
});

pastePanel.addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.files || [])];
  if (!files.length) return;
  event.preventDefault();
  addReferenceFiles(files);
});

pastePanel.addEventListener("dragover", (event) => {
  event.preventDefault();
  pastePanel.classList.add("is-active");
});

pastePanel.addEventListener("dragleave", () => {
  pastePanel.classList.remove("is-active");
});

pastePanel.addEventListener("drop", (event) => {
  event.preventDefault();
  pastePanel.classList.remove("is-active");
  const files = [...(event.dataTransfer?.files || [])];
  addReferenceFiles(files);
});

document.addEventListener("paste", (event) => {
  const active = document.activeElement;
  const editingText =
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && active.type !== "file") ||
    active?.isContentEditable;

  if (editingText) return;

  const files = [...(event.clipboardData?.files || [])];
  if (!files.length) return;
  event.preventDefault();
  addReferenceFiles(files);
  pastePanel.focus();
});

sizePresetEl.addEventListener("change", syncSizeFields);
generateBtn.addEventListener("click", generateImage);

syncSizeFields();
renderPresets();
loadConfig();
loadSession();
refreshHistory().catch(() => {
  setStatus("历史不可用", "bad");
});
