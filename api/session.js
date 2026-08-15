import {
  createClearSessionCookie,
  createSessionCookie,
  publicSessionPayload,
  readSessionFromHeaders,
} from "./_shared.js";

function sendJson(res, statusCode, payload, cookie = "") {
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (cookie) res.setHeader("set-cookie", cookie);
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const session = readSessionFromHeaders(req.headers);
    sendJson(res, 200, {
      ok: true,
      session: publicSessionPayload(session),
    });
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const { cookie, session } = createSessionCookie({
        baseUrl: body.OPENAI_BASE_URL || body.baseUrl,
        apiKey: body.OPENAI_API_KEY || body.apiKey,
      });
      sendJson(res, 200, { ok: true, session }, cookie);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error?.message || "Invalid session settings.",
      });
    }
    return;
  }

  if (req.method === "DELETE") {
    sendJson(res, 200, {
      ok: true,
      session: publicSessionPayload(null),
    }, createClearSessionCookie());
    return;
  }

  sendJson(res, 405, {
    ok: false,
    error: "Method not allowed.",
  });
}
