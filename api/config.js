import {
  createConfigPayload,
  readSessionFromHeaders,
} from "./_shared.js";

export default async function handler(_req, res) {
  const session = readSessionFromHeaders(_req.headers);
  const auth = session?.apiKey ? { OPENAI_API_KEY: session.apiKey } : {};
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(JSON.stringify(createConfigPayload({}, auth)));
}
