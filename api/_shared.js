export function parseLooseConfig(rawText) {
  if (!rawText || typeof rawText !== "string") return {};

  const result = {};
  const sections = {};
  let currentSection = null;

  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] ||= {};
      continue;
    }

    const kvMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    let value = kvMatch[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value === "true" || value === "false") {
      value = value === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      value = Number(value);
    }

    if (currentSection) {
      sections[currentSection][key] = value;
    } else {
      result[key] = value;
    }
  }

  if (sections["model_providers.OpenAI"]) {
    result.model_providers = {
      OpenAI: sections["model_providers.OpenAI"],
    };
  }

  return result;
}

export function getConfiguredBaseUrl(config = {}, env = process.env) {
  return (
    env.OPENAI_BASE_URL ||
    config.base_url ||
    config.model_providers?.OpenAI?.base_url ||
    "https://api.openai.com/v1"
  );
}

export function getConfiguredImageModel(config = {}, env = process.env) {
  const explicit =
    env.IMAGE_MODEL ||
    config.image_model ||
    config.IMAGE_MODEL ||
    config.default_image_model ||
    "";

  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const model = typeof config.model === "string" ? config.model.trim() : "";
  if (/gpt-(img|image)/i.test(model)) return model === "gpt-img2" ? "gpt-image-2" : model;

  return "gpt-image-2";
}

export function getApiKey(auth = {}, env = process.env) {
  return (
    env.OPENAI_API_KEY ||
    auth.OPENAI_API_KEY ||
    auth.api_key ||
    auth.apiKey ||
    ""
  );
}

export function createConfigPayload(config = {}, auth = {}, env = process.env) {
  return {
    ok: true,
    config: {
      model: getConfiguredImageModel(config, env),
    },
    hasAuth: Boolean(getApiKey(auth, env)),
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assertValidSize(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error("Width and height must be integers.");
  }
  if (width < 16 || height < 16) {
    throw new Error("Width and height must be at least 16.");
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new Error("Width and height must both be divisible by 16.");
  }
}

function toImageResult(data) {
  const first = Array.isArray(data?.data) ? data.data[0] : null;
  return {
    imageBase64: first?.b64_json || "",
    imageUrl: first?.url || "",
    revisedPrompt: first?.revised_prompt || "",
    width: first?.width || null,
    height: first?.height || null,
  };
}

export async function generateImageFromFormData(formData, { config = {}, auth = {}, env = process.env } = {}) {
  const apiKey = getApiKey(auth, env);
  if (!apiKey) {
    return { status: 400, body: { ok: false, error: "Missing OPENAI_API_KEY." } };
  }

  const prompt = String(formData.get("prompt") || "").trim();
  if (!prompt) {
    return { status: 400, body: { ok: false, error: "Prompt is required." } };
  }

  const imageModel = String(formData.get("model") || getConfiguredImageModel(config, env)).trim() || "gpt-image-2";
  const width = parsePositiveInt(formData.get("width"), 1024);
  const height = parsePositiveInt(formData.get("height"), 1024);
  assertValidSize(width, height);

  const quality = String(formData.get("quality") || "auto").trim() || "auto";
  const background = String(formData.get("background") || "auto").trim() || "auto";
  const format = String(formData.get("format") || "png").trim() || "png";
  const compression = parsePositiveInt(formData.get("compression"), 100);
  const referenceFiles = formData
    .getAll("reference_images")
    .filter((file) => file && typeof file.arrayBuffer === "function" && file.size);

  if (background === "transparent" && /gpt-img2|gpt-image-2/i.test(imageModel)) {
    return {
      status: 400,
      body: { ok: false, error: "gpt-image-2 does not support transparent backgrounds. Use opaque or auto." },
    };
  }

  const endpoint = referenceFiles.length ? "images/edits" : "images/generations";
  const baseUrl = getConfiguredBaseUrl(config, env);
  let response;

  if (referenceFiles.length) {
    const outbound = new FormData();
    outbound.set("model", imageModel);
    outbound.set("prompt", prompt);
    outbound.set("size", `${width}x${height}`);
    outbound.set("quality", quality);
    outbound.set("background", background);
    outbound.set("output_format", format);
    outbound.set("output_compression", String(compression));
    for (const file of referenceFiles) {
      outbound.append("image", file, file.name || "reference.png");
    }

    response = await fetch(`${baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      body: outbound,
    });
  } else {
    response = await fetch(`${baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: imageModel,
        prompt,
        size: `${width}x${height}`,
        quality,
        background,
        output_format: format,
        output_compression: compression,
      }),
    });
  }

  const data = await response.json();
  if (!response.ok) {
    return {
      status: response.status,
      body: {
        ok: false,
        error: data?.error?.message || data?.message || "Image generation failed.",
        raw: data,
      },
    };
  }

  const image = toImageResult(data);
  if (!image.imageBase64 && !image.imageUrl) {
    return {
      status: 500,
      body: { ok: false, error: "The API response did not include image data.", raw: data },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      imageBase64: image.imageBase64,
      imageUrl: image.imageUrl,
      revisedPrompt: image.revisedPrompt,
      width: image.width,
      height: image.height,
      model: imageModel,
      endpoint,
    },
  };
}
