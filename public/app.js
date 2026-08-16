const $ = (id) => document.getElementById(id);

const HISTORY_DB_NAME = "qishi-image-history";
const HISTORY_STORE_NAME = "entries";
const HISTORY_LIMIT = 24;
const PROMPT_PRESETS_KEY = "qishi-image-prompt-presets";
const HIDDEN_PROMPT_PRESETS_KEY = "qishi-image-hidden-prompt-presets";
const HISTORY_COLLAPSED_KEY = "qishi-image-history-collapsed";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_SIZE = "1024x1024";
const DEFAULT_QUALITY = "auto";
const DEFAULT_FORMAT = "png";

const SIZE_OPTIONS = [
  { value: "1024x1024", label: "1024×1024", ratioLabel: "1:1", width: 1024, height: 1024 },
  { value: "1536x1024", label: "1536×1024", ratioLabel: "3:2", width: 1536, height: 1024 },
  { value: "1024x1536", label: "1024×1536", ratioLabel: "2:3", width: 1024, height: 1536 },
  { value: "1792x1024", label: "1792×1024", ratioLabel: "7:4", width: 1792, height: 1024 },
  { value: "1024x1792", label: "1024×1792", ratioLabel: "4:7", width: 1024, height: 1792 },
];

const DEFAULT_PROMPT_PRESETS = [
  {
    name: "产品海报",
    prompt:
      "生成一张简洁高级的产品海报，主体清晰，留白舒适，适合商业展示。",
  },
  {
    name: "真实摄影",
    prompt:
      "生成真实摄影风格图片，光线自然，细节清晰，画面干净。",
  },
  {
    name: "科技感",
    prompt:
      "生成现代科技感视觉，构图简洁，蓝白配色，质感高级。",
  },
  {
    name: "极简插画",
    prompt:
      "生成极简插画风格图片，线条干净，色彩克制，主体明确。",
  },
];

const state = {
  files: [],
  refUrls: [],
  history: [],
  promptPresets: [],
  historyCollapsed: false,
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
const retouchBtn = $("retouchBtn");
const generateBtn = $("generateBtn");
const clearBtn = $("clearBtn");
const clearHistoryBtn = $("clearHistoryBtn");
const exportHistoryBtn = $("exportHistoryBtn");
const importHistoryBtn = $("importHistoryBtn");
const historyImportInput = $("historyImportInput");
const pasteBtn = $("pasteBtn");
const pastePanel = $("pastePanel");
const editSourceBanner = $("editSourceBanner");
const cancelEditSourceBtn = $("cancelEditSourceBtn");
const historyListEl = $("historyList");
const historyEmptyEl = $("historyEmpty");
const toggleHistoryBtn = $("toggleHistoryBtn");
const sizePresetEl = $("sizePreset");
const qualityEl = $("quality");
const formatEl = $("format");
const widthEl = $("width");
const heightEl = $("height");
const modelEl = $("model");
const presetListEl = $("presetList");
const addPresetBtn = $("addPresetBtn");
const sessionOverlay = $("sessionOverlay");
const sessionForm = $("sessionForm");
const baseUrlInput = $("baseUrlInput");
const apiKeyInput = $("apiKeyInput");
const sessionError = $("sessionError");
const settingsBtn = $("settingsBtn");
const logoutBtn = $("logoutBtn");
const sizePickerButton = $("sizePickerButton");
const sizePickerLabel = $("sizePickerLabel");
const sizePickerHint = $("sizePickerHint");
const sizePickerMenu = $("sizePickerMenu");
const generateBtnLabel = $("generateBtnLabel");
const cutoutModeEl = $("cutoutMode");
const retouchOverlay = $("retouchOverlay");
const retouchCloseBtn = $("retouchCloseBtn");
const retouchCancelBtn = $("retouchCancelBtn");
const retouchApplyBtn = $("retouchApplyBtn");
const retouchClearBtn = $("retouchClearBtn");
const retouchBrushRange = $("retouchBrushRange");
const retouchPromptEl = $("retouchPrompt");
const retouchCanvas = $("retouchCanvas");
const retouchOverlayCanvas = $("retouchOverlayCanvas");
const retouchError = $("retouchError");

let loadingTimer = null;
let sizePickerOpen = false;
let retouchState = null;
let retouchMaskCanvas = null;
let retouchMaskCtx = null;

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

function isCutoutModeEnabled() {
  return cutoutModeEl?.getAttribute("aria-pressed") === "true";
}

function setCutoutMode(enabled, announce = false) {
  if (!cutoutModeEl) return;
  cutoutModeEl.classList.toggle("is-active", enabled);
  cutoutModeEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  if (enabled) formatEl.value = "png";
  if (announce) {
    setStatus(enabled ? "透明 PNG 已开启" : "透明 PNG 已关闭", enabled ? "good" : "neutral");
  }
}

function toggleCutoutMode() {
  setCutoutMode(!isCutoutModeEnabled(), true);
}

function showSessionError(message) {
  sessionError.textContent = message;
  sessionError.classList.remove("hidden");
}

function clearSessionError() {
  sessionError.textContent = "";
  sessionError.classList.add("hidden");
}

function showRetouchError(message) {
  retouchError.textContent = message;
  retouchError.classList.remove("hidden");
}

function clearRetouchError() {
  retouchError.textContent = "";
  retouchError.classList.add("hidden");
}

function formatExpiry(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(timestamp));
}

function loadPromptPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROMPT_PRESETS_KEY) || "[]");
    const hidden = JSON.parse(localStorage.getItem(HIDDEN_PROMPT_PRESETS_KEY) || "[]");
    const custom = Array.isArray(saved) ? saved : [];
    const hiddenPrompts = new Set(Array.isArray(hidden) ? hidden : []);
    state.promptPresets = [...DEFAULT_PROMPT_PRESETS, ...custom].filter(
      (preset) => preset?.name && preset?.prompt && !hiddenPrompts.has(preset.prompt)
    );
  } catch {
    state.promptPresets = [...DEFAULT_PROMPT_PRESETS];
  }
}

function saveCustomPromptPreset(preset) {
  let custom = [];
  try {
    const saved = JSON.parse(localStorage.getItem(PROMPT_PRESETS_KEY) || "[]");
    custom = Array.isArray(saved) ? saved : [];
  } catch {
    custom = [];
  }
  const exists =
    custom.some((item) => item.prompt === preset.prompt) ||
    DEFAULT_PROMPT_PRESETS.some((item) => item.prompt === preset.prompt);
  if (!exists) {
    custom.unshift(preset);
    localStorage.setItem(PROMPT_PRESETS_KEY, JSON.stringify(custom.slice(0, 18)));
  }
  loadPromptPresets();
  renderPresets();
}

function deletePromptPreset(preset) {
  const confirmed = window.confirm(`确定删除常用提示「${preset.name}」吗？`);
  if (!confirmed) return;

  let custom = [];
  let hidden = [];
  try {
    const saved = JSON.parse(localStorage.getItem(PROMPT_PRESETS_KEY) || "[]");
    custom = Array.isArray(saved) ? saved : [];
  } catch {
    custom = [];
  }
  try {
    const savedHidden = JSON.parse(localStorage.getItem(HIDDEN_PROMPT_PRESETS_KEY) || "[]");
    hidden = Array.isArray(savedHidden) ? savedHidden : [];
  } catch {
    hidden = [];
  }

  const nextCustom = custom.filter((item) => item.prompt !== preset.prompt);
  const isDefaultPreset = DEFAULT_PROMPT_PRESETS.some((item) => item.prompt === preset.prompt);
  if (isDefaultPreset && !hidden.includes(preset.prompt)) {
    hidden.push(preset.prompt);
  }

  localStorage.setItem(PROMPT_PRESETS_KEY, JSON.stringify(nextCustom));
  localStorage.setItem(HIDDEN_PROMPT_PRESETS_KEY, JSON.stringify(hidden));
  loadPromptPresets();
  renderPresets();
  setStatus("常用提示已删除", "good");
}

function loadHistoryCollapsed() {
  state.historyCollapsed = localStorage.getItem(HISTORY_COLLAPSED_KEY) === "true";
}

function setHistoryCollapsed(collapsed) {
  state.historyCollapsed = collapsed;
  localStorage.setItem(HISTORY_COLLAPSED_KEY, collapsed ? "true" : "false");
  renderHistory();
}

function getSelectedSizeOption() {
  return SIZE_OPTIONS.find((option) => option.value === sizePresetEl.value) || SIZE_OPTIONS[0];
}

function getSelectedFormat() {
  const value = String(formatEl.value || DEFAULT_FORMAT).trim().toLowerCase();
  if (value === "webp" || value === "jpeg" || value === "svg") return value;
  return DEFAULT_FORMAT;
}

function getRequestedMimeType(format) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  if (format === "svg") return "image/svg+xml";
  return "image/png";
}

function getNormalizedMimeType(format) {
  return getRequestedMimeType(format === "svg" ? DEFAULT_FORMAT : format);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSvgMarkup(imageDataUrl, width, height) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="${escapeXml(imageDataUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />`,
    "</svg>",
  ].join("");
}

function toSvgDataUrl(imageDataUrl, width, height) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSvgMarkup(imageDataUrl, width, height))}`;
}

function dataUrlToBlob(dataUrl) {
  const [meta, body] = String(dataUrl).split(",");
  const mimeMatch = meta?.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(body || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function createObjectUrlFromDataUrl(dataUrl) {
  return URL.createObjectURL(dataUrlToBlob(dataUrl));
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

function syncNativeFileInput() {
  const transfer = new DataTransfer();
  for (const file of state.files) transfer.items.add(file);
  refsEl.files = transfer.files;
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

function setSessionUi(session) {
  state.session = session?.authenticated ? session : null;
  sessionOverlay.classList.toggle("hidden", Boolean(state.session));
  settingsBtn.classList.toggle("hidden", !state.session);
  logoutBtn.classList.toggle("hidden", !state.session);

  if (state.session) {
    baseUrlInput.value = state.session.baseUrl || "";
    setStatus(`已登录 · ${formatExpiry(state.session.expiresAt)} 到期`, "good");
  } else {
    setStatus("需要配置网关", "bad");
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
    showSessionError("请填写 OPENAI_BASE_URL 和 OPENAI_API_KEY。");
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
  setStatus(`已加入 ${state.files.length} 张图`, "good");
}

async function readClipboardImages() {
  if (!navigator.clipboard?.read) {
    showError("当前浏览器不支持直接读取剪贴板图片，请点击粘贴区域后按 Ctrl+V。");
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
      setStatus(state.files.length ? `已加入 ${state.files.length} 张图` : "参考图已清空", "good");
    });

    item.append(img, remove);
    refStripEl.appendChild(item);
  });
}

function parseSizeValue(value = sizePresetEl.value) {
  const match = String(value).match(/^(\d+)x(\d+)$/);
  if (!match) return { width: 1024, height: 1024 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function syncSizeFields() {
  const option = getSelectedSizeOption();
  const { width, height } = parseSizeValue(option.value);
  sizePresetEl.value = option.value;
  widthEl.value = String(width);
  heightEl.value = String(height);
  sizePickerLabel.textContent = option.label;
  sizePickerHint.textContent = option.ratioLabel;
  sizePickerMenu.querySelectorAll(".size-option").forEach((item) => {
    const selected = item.dataset.value === option.value;
    item.classList.toggle("is-selected", selected);
    item.setAttribute("aria-selected", selected ? "true" : "false");
  });
}

function closeSizePicker() {
  sizePickerOpen = false;
  sizePickerMenu.classList.add("hidden");
  sizePickerButton.setAttribute("aria-expanded", "false");
}

function openSizePicker() {
  sizePickerOpen = true;
  sizePickerMenu.classList.remove("hidden");
  sizePickerButton.setAttribute("aria-expanded", "true");
}

function toggleSizePicker() {
  if (sizePickerOpen) {
    closeSizePicker();
  } else {
    openSizePicker();
  }
}

function renderSizePicker() {
  sizePickerMenu.innerHTML = "";

  for (const option of SIZE_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "size-option";
    button.setAttribute("role", "option");
    button.dataset.value = option.value;

    const swatch = document.createElement("span");
    swatch.className = "size-option-swatch";
    swatch.style.aspectRatio = `${option.width} / ${option.height}`;

    const copy = document.createElement("span");
    copy.className = "size-option-copy";

    const title = document.createElement("strong");
    title.textContent = option.label;

    const meta = document.createElement("small");
    meta.textContent = option.ratioLabel;

    copy.append(title, meta);
    button.append(swatch, copy);
    button.addEventListener("click", () => {
      sizePresetEl.value = option.value;
      syncSizeFields();
      closeSizePicker();
    });

    sizePickerMenu.appendChild(button);
  }

  syncSizeFields();
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

async function sourceToFile(sourceUrl, filename) {
  if (String(sourceUrl || "").startsWith("data:")) {
    return dataUrlToFile(sourceUrl, filename);
  }

  const response = await fetch(sourceUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

async function removeGreenBackground(dataUrl) {
  const image = await loadImageToCanvas(dataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const maxDistance = 180;
  const minDistance = 30;

  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const a = pixels[index + 3];
    const distance = Math.sqrt((r * r) + ((g - 255) * (g - 255)) + (b * b));
    const alpha = Math.max(0, Math.min(1, (distance - minDistance) / (maxDistance - minDistance)));
    const spill = Math.min(1, Math.max(0, (g - Math.max(r, b)) / 255));

    pixels[index] = Math.round(r * (1 - spill * 0.1));
    pixels[index + 1] = Math.round(g * alpha);
    pixels[index + 2] = Math.round(b * (1 - spill * 0.1));
    pixels[index + 3] = Math.round(a * alpha);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function readJsonResponse(response, label = "请求") {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`${label} 返回的不是 JSON，可能是服务器路由、代理或网关返回了 HTML 页面。片段：${preview}`);
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

function normalizeHistoryEntry(entry, { forceNewId = false } = {}) {
  if (!entry || typeof entry !== "object") return null;
  const createdAt = Number(entry.createdAt || Date.now());
  const imageDataUrl = String(entry.imageDataUrl || entry.displayDataUrl || "").trim();
  if (!imageDataUrl) return null;

  return {
    id: forceNewId
      ? `history-${createdAt}-${Math.random().toString(36).slice(2, 8)}`
      : String(entry.id || `history-${createdAt}-${Math.random().toString(36).slice(2, 8)}`),
    prompt: String(entry.prompt || "").trim(),
    imageDataUrl,
    sourceDataUrl: String(entry.sourceDataUrl || entry.rawDataUrl || imageDataUrl),
    thumbDataUrl: String(entry.thumbDataUrl || imageDataUrl),
    width: Number(entry.width || 0) || 1024,
    height: Number(entry.height || 0) || 1024,
    format: String(entry.format || "png"),
    metaText: String(entry.metaText || ""),
    metaLabel: String(entry.metaLabel || ""),
    createdAt,
  };
}

async function exportHistory() {
  const payload = {
    app: "qishi-image",
    exportedAt: Date.now(),
    entries: state.history,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `qishi-image-history-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function importHistoryFile(file) {
  const raw = await file.text();
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.entries)
      ? parsed.entries
      : [];

  if (!entries.length) {
    throw new Error("文件里没有可导入的历史记录。");
  }

  for (const entry of entries) {
    const normalized = normalizeHistoryEntry(entry, { forceNewId: true });
    if (!normalized) continue;
    await putHistoryEntry(normalized);
  }

  await trimHistory();
  await refreshHistory();
}

function setEditSource(source) {
  state.editSource = source;
  editSourceBanner.classList.toggle("hidden", !source);
}

function clearEditSource() {
  setEditSource(null);
}

function syncResultButtons() {
  const visible = Boolean(state.currentResult);
  continueEditBtn.classList.toggle("hidden", !visible);
  downloadBtn.classList.toggle("hidden", !visible);
  generateBtnLabel.textContent = visible ? "清空当前内容" : "生成图片";
}

function clearCurrentContent() {
  state.files = [];
  refsEl.value = "";
  renderRefs();
  promptEl.value = "";
  clearEditSource();
  revokeDownloadUrl();
  state.currentResult = null;
  resultFigure.classList.add("hidden");
  emptyState.classList.remove("hidden");
  errorBox.classList.add("hidden");
  retouchOverlay.classList.add("hidden");
  setStatus("已清空当前内容", "good");
  syncResultButtons();
}

function setGenerating(isGenerating, editMode = false, cutoutMode = false) {
  generateBtn.disabled = isGenerating;
  generateBtn.classList.toggle("is-loading", isGenerating);
  previewPanel.classList.toggle("is-generating", isGenerating);
  loadingState.classList.toggle("hidden", !isGenerating);

  if (isGenerating) {
    emptyState.classList.add("hidden");
    resultFigure.classList.add("hidden");
    const steps = cutoutMode
      ? ["正在生成主体", "正在去背景", "正在输出透明 PNG"]
      : editMode
        ? ["正在读取当前结果", "正在准备局部修改", "正在生成新版本"]
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

function buildEffectivePrompt(input) {
  const trimmed = String(input || "").trim();
  const size = getSelectedSizeOption();
  const qualityLabel = qualityEl.options[qualityEl.selectedIndex]?.textContent?.trim() || "自动";
  const formatLabel = formatEl.options[formatEl.selectedIndex]?.textContent?.trim() || "PNG";
  const cutoutSuffix = isCutoutModeEnabled()
    ? " 生成时请把主体放在纯 #00FF00 单色背景上，不要棋盘格、透明示意背景、灰白方格、阴影、渐变、纹理或反光；主体边缘清晰完整，便于后续去背景并导出透明 PNG。"
    : "";

  if (trimmed) return `${trimmed}${cutoutSuffix}`;

  return `Create a clean, polished image. Match the ${size.label} composition, ${qualityLabel} quality, and ${formatLabel} output.${cutoutSuffix}`;
}

function buildImageArtifacts({ requestedFormat, outputFormat, imageBase64, imageUrl, width, height }) {
  const rawFormat = outputFormat || requestedFormat || DEFAULT_FORMAT;
  const rawDataUrl = imageBase64
    ? `data:${getNormalizedMimeType(rawFormat)};base64,${imageBase64}`
    : imageUrl || "";

  const displayDataUrl =
    requestedFormat === "svg" && rawDataUrl
      ? toSvgDataUrl(rawDataUrl, width, height)
      : rawDataUrl;

  let downloadUrl = "";
  if (requestedFormat === "svg" && rawDataUrl) {
    const blob = new Blob([buildSvgMarkup(rawDataUrl, width, height)], {
      type: "image/svg+xml;charset=utf-8",
    });
    downloadUrl = URL.createObjectURL(blob);
  } else if (rawDataUrl.startsWith("data:")) {
    downloadUrl = createObjectUrlFromDataUrl(rawDataUrl);
  } else {
    downloadUrl = imageUrl || "";
  }

  return {
    rawFormat,
    rawDataUrl,
    displayDataUrl,
    downloadUrl,
  };
}

function displayResult({
  displayDataUrl,
  rawDataUrl,
  downloadUrl,
  title,
  metaText,
  width,
  height,
  format,
  rawFormat,
}) {
  resultImage.src = displayDataUrl;
  resultTitle.textContent = title || "生成完成";
  resultMeta.textContent = metaText || `${width} × ${height}`;
  emptyState.classList.add("hidden");
  resultFigure.classList.remove("hidden");
  downloadBtn.classList.remove("hidden");
  revokeDownloadUrl();
  state.downloadUrl = downloadUrl || rawDataUrl || "";
  state.currentResult = {
    dataUrl: displayDataUrl,
    rawDataUrl: rawDataUrl || displayDataUrl,
    downloadUrl: state.downloadUrl,
    width,
    height,
    format,
    rawFormat: rawFormat || format,
  };
  syncResultButtons();
}

function applyHistoryEntry(entry) {
  promptEl.value = entry.prompt;
  const displayDataUrl = entry.imageDataUrl || entry.thumbDataUrl || "";
  const rawDataUrl = entry.sourceDataUrl || displayDataUrl;
  const downloadUrl = String(rawDataUrl).startsWith("data:")
    ? createObjectUrlFromDataUrl(rawDataUrl)
    : rawDataUrl;
  displayResult({
    displayDataUrl,
    rawDataUrl,
    downloadUrl,
    title: "历史结果",
    metaText: entry.metaText || `${entry.width} × ${entry.height}`,
    width: entry.width,
    height: entry.height,
    format: entry.format || "png",
    rawFormat: entry.format || "png",
  });
  setEditSource({
    dataUrl: displayDataUrl,
    rawDataUrl,
    width: entry.width,
    height: entry.height,
    format: entry.format || "png",
  });
  setStatus("已载入历史记录", "good");
}

function createHistoryCard(entry) {
  const card = document.createElement("article");
  card.className = "history-card";

  const open = document.createElement("button");
  open.type = "button";
  open.className = "history-open";

  const thumb = document.createElement("img");
  thumb.className = "history-thumb";
  thumb.src = entry.thumbDataUrl || entry.imageDataUrl;
  thumb.alt = entry.prompt || "历史结果";

  const copy = document.createElement("div");
  copy.className = "history-copy";

  const title = document.createElement("strong");
  title.textContent = entry.metaLabel || "历史结果";

  const prompt = document.createElement("p");
  prompt.textContent = entry.prompt || "无提示词";

  const time = document.createElement("time");
  time.dateTime = new Date(entry.createdAt).toISOString();
  time.textContent = formatHistoryTime(entry.createdAt);

  copy.append(title, prompt, time);
  open.append(thumb, copy);

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

  open.addEventListener("click", () => applyHistoryEntry(entry));
  card.append(open, remove);
  return card;
}

function renderHistory() {
  historyListEl.innerHTML = "";
  const hasHistory = state.history.length > 0;
  historyEmptyEl.classList.toggle("hidden", hasHistory || state.historyCollapsed);
  historyListEl.classList.toggle("hidden", state.historyCollapsed);
  toggleHistoryBtn.textContent = state.historyCollapsed ? "展开" : "收起";
  clearHistoryBtn.classList.toggle("hidden", !hasHistory);
  exportHistoryBtn.classList.toggle("hidden", !hasHistory);
  importHistoryBtn.classList.remove("hidden");

  for (const entry of state.history) {
    historyListEl.appendChild(createHistoryCard(entry));
  }
}

async function refreshHistory() {
  state.history = await getHistoryEntries();
  renderHistory();
}

async function saveHistoryEntry(entry) {
  const normalized = normalizeHistoryEntry(entry);
  if (!normalized) return;
  await putHistoryEntry(normalized);
  await trimHistory();
  await refreshHistory();
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();
    if (!data.ok) throw new Error("bad config response");
    modelEl.value = data.config?.model || DEFAULT_MODEL;
  } catch {
    setStatus("离线", "bad");
  }
}

function renderPresets() {
  presetListEl.innerHTML = "";
  for (const preset of state.promptPresets) {
    const chip = document.createElement("span");
    chip.className = "preset-chip";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-button";
    button.textContent = preset.name;
    button.addEventListener("click", () => {
      const current = promptEl.value.trim();
      promptEl.value = current ? `${current}\n\n${preset.prompt}` : preset.prompt;
      promptEl.focus();
      setStatus(`已插入：${preset.name}`, "good");
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "preset-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `删除常用提示 ${preset.name}`);
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      deletePromptPreset(preset);
    });

    chip.append(button, remove);
    presetListEl.appendChild(chip);
  }
}

function setDownloadState(format, imageBase64, imageUrl, outputFormat, width, height) {
  const artifacts = buildImageArtifacts({
    requestedFormat: format,
    outputFormat,
    imageBase64,
    imageUrl,
    width,
    height,
  });
  return artifacts;
}

async function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("无法生成遮罩文件。"));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

async function loadImageToCanvas(sourceUrl) {
  const image = new Image();
  image.decoding = "async";
  image.src = sourceUrl;
  await image.decode();
  return image;
}

function ensureRetouchCanvas() {
  if (!retouchMaskCanvas) {
    retouchMaskCanvas = document.createElement("canvas");
    retouchMaskCtx = retouchMaskCanvas.getContext("2d", { willReadFrequently: true });
  }
  return {
    baseCanvas: retouchCanvas,
    baseCtx: retouchCanvas.getContext("2d"),
    overlayCanvas: retouchOverlayCanvas,
    overlayCtx: retouchOverlayCanvas.getContext("2d"),
    maskCanvas: retouchMaskCanvas,
    maskCtx: retouchMaskCtx,
  };
}

function resetMaskCanvas(maskCtx, width, height) {
  maskCtx.globalCompositeOperation = "source-over";
  maskCtx.clearRect(0, 0, width, height);
  maskCtx.fillStyle = "#000";
  maskCtx.fillRect(0, 0, width, height);
}

function clearRetouchOverlay() {
  if (!retouchState) return;
  const { overlayCtx, maskCtx, width, height } = retouchState;
  overlayCtx.clearRect(0, 0, width, height);
  resetMaskCanvas(maskCtx, width, height);
  retouchState.hasPaint = false;
}

function drawRetouchStroke(ctx, from, to, size, color, composite = "source-over") {
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function drawRetouchDot(ctx, point, size, color, composite = "source-over") {
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function openRetouchEditor() {
  if (!state.currentResult?.rawDataUrl) return;
  clearRetouchError();
  retouchPromptEl.value = promptEl.value.trim();
  retouchOverlay.classList.remove("hidden");
  retouchOverlay.setAttribute("aria-hidden", "false");
}

async function prepareRetouchEditor() {
  if (!state.currentResult?.rawDataUrl) return;
  const sourceUrl = state.currentResult.rawDataUrl || state.currentResult.dataUrl;
  const image = await loadImageToCanvas(sourceUrl);
  const { baseCtx, overlayCtx, maskCtx, baseCanvas, overlayCanvas, maskCanvas } = ensureRetouchCanvas();
  const width = image.naturalWidth || state.currentResult.width || 1024;
  const height = image.naturalHeight || state.currentResult.height || 1024;

  baseCanvas.width = overlayCanvas.width = maskCanvas.width = width;
  baseCanvas.height = overlayCanvas.height = maskCanvas.height = height;

  baseCtx.clearRect(0, 0, width, height);
  baseCtx.drawImage(image, 0, 0, width, height);
  overlayCtx.clearRect(0, 0, width, height);
  resetMaskCanvas(maskCtx, width, height);

  retouchState = {
    width,
    height,
    baseCtx,
    overlayCtx,
    maskCtx,
    baseCanvas,
    overlayCanvas,
    maskCanvas,
    image,
    sourceDataUrl: sourceUrl,
    drawing: false,
    lastPoint: null,
    hasPaint: false,
  };

  retouchBrushRange.value = String(Number(retouchBrushRange.value) || 36);
  retouchError.classList.add("hidden");
}

function closeRetouchEditor() {
  retouchOverlay.classList.add("hidden");
  retouchOverlay.setAttribute("aria-hidden", "true");
  retouchState = null;
  clearRetouchError();
}

async function applyRetouch() {
  if (!retouchState?.hasPaint) {
    showRetouchError("请先圈出需要修改的局部。");
    return;
  }

  const retouchPrompt = retouchPromptEl.value.trim();
  if (!retouchPrompt) {
    showRetouchError("请输入这次局部修改的新提示词。");
    retouchPromptEl.focus();
    return;
  }
  promptEl.value = retouchPrompt;

  const maskBlob = await canvasToBlob(retouchState.maskCanvas, "image/png");
  const sourceFile = await sourceToFile(
    retouchState.sourceDataUrl,
    `retouch-source.${retouchState.sourceDataUrl.startsWith("data:image/jpeg") ? "jpg" : "png"}`
  );
  const maskFile = new File([maskBlob], "mask.png", { type: "image/png" });

  closeRetouchEditor();
  await submitGeneration({
    sourceImageFile: sourceFile,
    maskFile,
    editMode: true,
    promptOverride: retouchPrompt,
  });
}

async function submitGeneration({ sourceImageFile = null, maskFile = null, editMode = false, promptOverride = "" } = {}) {
  clearError();

  if (!state.session) {
    setSessionUi(null);
    return;
  }

  const cutoutEnabled = isCutoutModeEnabled();
  if (cutoutEnabled) {
    formatEl.value = "png";
  }

  const effectivePrompt = buildEffectivePrompt(promptOverride || promptEl.value);
  syncSizeFields();

  const format = cutoutEnabled ? "png" : getSelectedFormat();
  const { width, height } = parseSizeValue(sizePresetEl.value);
  const hasEditSource = Boolean(sourceImageFile || state.editSource);
  const formData = new FormData();
  formData.set("prompt", effectivePrompt);
  formData.set("model", modelEl.value || DEFAULT_MODEL);
  formData.set("quality", qualityEl.value || DEFAULT_QUALITY);
  formData.set("format", format);
  formData.set("width", String(width));
  formData.set("height", String(height));
  formData.set("background", "auto");
  formData.set("compression", "100");
  formData.set("action", hasEditSource || state.files.length || maskFile ? "edit" : "generate");

  if (sourceImageFile) {
    formData.append("reference_images", sourceImageFile, sourceImageFile.name);
  } else if (state.editSource?.rawDataUrl || state.editSource?.dataUrl) {
    const source = state.editSource.rawDataUrl || state.editSource.dataUrl;
    const sourceFile = await sourceToFile(
      source,
      `current-result.${state.editSource.rawFormat || state.editSource.format || "png"}`
    );
    formData.append("reference_images", sourceFile, sourceFile.name);
  }

  for (const file of state.files) {
    formData.append("reference_images", file, file.name);
  }

  if (maskFile) {
    formData.set("mask", maskFile, maskFile.name || "mask.png");
  }

  setGenerating(true, editMode || Boolean(maskFile) || hasEditSource, cutoutEnabled);
  setStatus(cutoutEnabled ? "抛图中" : editMode || Boolean(maskFile) || hasEditSource ? "修改中" : "生成中");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      body: formData,
    });
    const data = await readJsonResponse(response, "/api/generate");
    if (!data.ok) throw new Error(data.error || "生成失败");

    const artifacts = setDownloadState(
      format,
      data.imageBase64,
      data.imageUrl,
      data.outputFormat || format,
      data.width || width,
      data.height || height
    );

    let displayDataUrl = artifacts.displayDataUrl;
    let rawDataUrl = artifacts.rawDataUrl;
    let downloadUrl = artifacts.downloadUrl;
    let finalFormat = format;

    if (cutoutEnabled) {
      const cutoutDataUrl = await removeGreenBackground(displayDataUrl || rawDataUrl);
      displayDataUrl = cutoutDataUrl;
      rawDataUrl = cutoutDataUrl;
      downloadUrl = createObjectUrlFromDataUrl(cutoutDataUrl);
      finalFormat = "png";
    }

    displayResult({
      displayDataUrl,
      rawDataUrl,
      downloadUrl,
      title: "生成完成",
      metaText: data.revisedPrompt || `${data.width || width} ? ${data.height || height}`,
      width: data.width || width,
      height: data.height || height,
      format: finalFormat,
      rawFormat: data.outputFormat || artifacts.rawFormat || finalFormat,
    });

    if (hasEditSource || maskFile || cutoutEnabled) {
      setEditSource(state.currentResult);
    } else {
      clearEditSource();
    }

    setStatus("已完成", "good");

    await saveHistoryEntry({
      id: `history-${Date.now()}`,
      prompt: effectivePrompt,
      imageDataUrl: displayDataUrl,
      sourceDataUrl: rawDataUrl,
      thumbDataUrl: displayDataUrl,
      width: data.width || width,
      height: data.height || height,
      format: finalFormat,
      metaText: resultMeta.textContent,
      metaLabel: `${sizePresetEl.value} ? ${qualityEl.selectedOptions[0]?.textContent || "自动"} ? ${formatEl.selectedOptions[0]?.textContent || "PNG"}${cutoutEnabled ? " ? 抛图" : ""}`,
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

async function generateImage() {
  await submitGeneration();
}

function initRetouchInteractions() {
  const overlayCtx = retouchOverlayCanvas.getContext("2d");
  retouchOverlayCanvas.style.touchAction = "none";

  const getSize = () => Number(retouchBrushRange.value) || 36;
  const overlayColor = "rgba(10, 132, 255, 0.3)";
  const maskColor = "rgba(0, 0, 0, 1)";

  const paintPoint = (point, lastPoint) => {
    if (!retouchState) return;
    const brush = getSize();
    if (lastPoint) {
      drawRetouchStroke(overlayCtx, lastPoint, point, brush, overlayColor);
      drawRetouchStroke(retouchState.maskCtx, lastPoint, point, brush, maskColor, "destination-out");
    } else {
      drawRetouchDot(overlayCtx, point, brush, overlayColor);
      drawRetouchDot(retouchState.maskCtx, point, brush, maskColor, "destination-out");
    }
    retouchState.hasPaint = true;
  };

  retouchOverlayCanvas.addEventListener("pointerdown", (event) => {
    if (!retouchState) return;
    event.preventDefault();
    retouchOverlayCanvas.setPointerCapture(event.pointerId);
    retouchState.drawing = true;
    const point = getCanvasPoint(event, retouchOverlayCanvas);
    retouchState.lastPoint = point;
    paintPoint(point, null);
  });

  retouchOverlayCanvas.addEventListener("pointermove", (event) => {
    if (!retouchState?.drawing) return;
    event.preventDefault();
    const point = getCanvasPoint(event, retouchOverlayCanvas);
    paintPoint(point, retouchState.lastPoint);
    retouchState.lastPoint = point;
  });

  const stopPaint = () => {
    if (!retouchState) return;
    retouchState.drawing = false;
    retouchState.lastPoint = null;
  };

  retouchOverlayCanvas.addEventListener("pointerup", stopPaint);
  retouchOverlayCanvas.addEventListener("pointercancel", stopPaint);
  retouchOverlayCanvas.addEventListener("pointerleave", stopPaint);

  retouchClearBtn.addEventListener("click", () => {
    if (!retouchState) return;
    overlayCtx.clearRect(0, 0, retouchState.width, retouchState.height);
    retouchState.baseCtx.clearRect(0, 0, retouchState.width, retouchState.height);
    retouchState.baseCtx.drawImage(retouchState.image, 0, 0, retouchState.width, retouchState.height);
    resetMaskCanvas(retouchState.maskCtx, retouchState.width, retouchState.height);
    retouchState.hasPaint = false;
    clearRetouchError();
  });
}

function renderCanvasOnRetouchOpen() {
  if (!state.currentResult?.rawDataUrl) return;
  const load = prepareRetouchEditor();
  return load.catch((error) => {
    showRetouchError(error?.message || "无法打开局部重绘。");
  });
}

function bindEvents() {
downloadBtn.addEventListener("click", () => {
  if (!state.downloadUrl) return;
  const anchor = document.createElement("a");
  anchor.href = state.downloadUrl;
  anchor.download = `image-${Date.now()}.${state.currentResult?.format || formatEl.value || "png"}`;
  anchor.click();
});

  refsEl.addEventListener("change", () => {
    state.files = [...refsEl.files];
    renderRefs();
    if (state.files.length) {
      setStatus(`已加入 ${state.files.length} 张图`, "good");
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
    setStatus("历史已清空", "good");
  });

  toggleHistoryBtn.addEventListener("click", () => {
    setHistoryCollapsed(!state.historyCollapsed);
  });

  exportHistoryBtn.addEventListener("click", exportHistory);

  importHistoryBtn.addEventListener("click", () => {
    historyImportInput.click();
  });

  historyImportInput.addEventListener("change", async () => {
    const file = historyImportInput.files?.[0];
    historyImportInput.value = "";
    if (!file) return;
    try {
      await importHistoryFile(file);
      setStatus("历史已导入", "good");
    } catch (error) {
      showError(error?.message || "导入失败。");
      setStatus("导入失败", "bad");
    }
  });

  pasteBtn.addEventListener("click", readClipboardImages);

  addPresetBtn.addEventListener("click", () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      promptEl.focus();
      setStatus("先输入提示词，再添加常用", "bad");
      return;
    }
    const name = prompt.length > 12 ? `${prompt.slice(0, 12)}...` : prompt;
    saveCustomPromptPreset({
      name,
      prompt,
    });
    setStatus("已添加常用提示", "good");
  });

  continueEditBtn.addEventListener("click", () => {
    if (!state.currentResult?.rawDataUrl) return;
    setEditSource(state.currentResult);
    promptEl.focus();
    setStatus("下一次会在当前结果基础上继续修改", "good");
  });

  retouchBtn.addEventListener("click", async () => {
    if (!state.currentResult?.rawDataUrl) return;
    openRetouchEditor();
    await renderCanvasOnRetouchOpen();
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
    event.stopPropagation();
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
    if (active === pastePanel || active?.closest?.("#pastePanel")) return;

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

  sizePickerButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSizePicker();
  });

  sizePickerMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", (event) => {
    if (!sizePickerOpen) return;
    if (!event.target.closest?.(".size-picker")) {
      closeSizePicker();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSizePicker();
      if (!retouchOverlay.classList.contains("hidden")) {
        closeRetouchEditor();
      }
    }
  });

  generateBtn.addEventListener("click", () => {
    if (state.currentResult) {
      clearCurrentContent();
      return;
    }
    generateImage();
  });
  sizePresetEl.addEventListener("change", syncSizeFields);
  cutoutModeEl.addEventListener("click", toggleCutoutMode);
  formatEl.addEventListener("change", () => {
    if (isCutoutModeEnabled() && formatEl.value !== "png") {
      setCutoutMode(false, true);
    }
    setStatus(`格式已切换为 ${formatEl.selectedOptions[0]?.textContent || "PNG"}`, "good");
  });

  retouchCloseBtn.addEventListener("click", closeRetouchEditor);
  retouchCancelBtn.addEventListener("click", closeRetouchEditor);
  retouchApplyBtn.addEventListener("click", applyRetouch);
  retouchOverlay.addEventListener("click", (event) => {
    if (event.target === retouchOverlay) closeRetouchEditor();
  });
}

initRetouchInteractions();
bindEvents();
renderSizePicker();
loadPromptPresets();
loadHistoryCollapsed();
renderPresets();
loadConfig();
loadSession();
refreshHistory().catch(() => {
  setStatus("历史不可用", "bad");
});
