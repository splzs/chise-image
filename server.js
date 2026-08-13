import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createConfigPayload,
  generateImageFromFormData,
  parseLooseConfig,
} from "./api/_shared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
};

const state = {
  config: {},
  auth: {},
};

async function readConfigFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    try {
      return JSON.parse(raw);
    } catch {
      return parseLooseConfig(raw);
    }
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function loadRuntimeConfig() {
  state.config = await readConfigFile(path.join(__dirname, "config.json"));
  state.auth = await readConfigFile(path.join(__dirname, "auth.json"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "content-type": contentType });
  res.end(text);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(publicDir, pathname));

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  } catch (error) {
    if (error?.code === "ENOENT") {
      sendText(res, 404, "Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/api/config" && req.method === "GET") {
    sendJson(res, 200, createConfigPayload(state.config, state.auth));
    return;
  }

  if (req.url === "/api/generate" && req.method === "POST") {
    try {
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: req,
        duplex: "half",
      });
      const formData = await request.formData();
      const result = await generateImageFromFormData(formData, {
        config: state.config,
        auth: state.auth,
      });
      sendJson(res, result.status, result.body);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error?.message || "Unexpected server error.",
      });
    }
    return;
  }

  await serveStatic(req, res);
});

await loadRuntimeConfig();

server.listen(port, "0.0.0.0", () => {
  console.log(`Local image web app running at http://localhost:${port}`);
});
