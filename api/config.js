import { createConfigPayload } from "./_shared.js";

export default async function handler(_req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(JSON.stringify(createConfigPayload({}, {})));
}
