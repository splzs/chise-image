import { generateImageFromFormData } from "./_shared.js";

export default async function handler(req, res) {
  try {
    const formData = await req.formData();
    const result = await generateImageFromFormData(formData);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.statusCode = result.status;
    res.end(JSON.stringify(result.body));
  } catch (error) {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        ok: false,
        error: error?.message || "Unexpected server error.",
      })
    );
  }
}
