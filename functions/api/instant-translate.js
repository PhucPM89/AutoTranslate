import { handleApiRequest } from "../../worker/api.js";

export async function onRequest(context) {
  const handled = await handleApiRequest({ request: context.request, env: context.env });
  if (handled) return handled;
  return new Response(JSON.stringify({ error: "Not found." }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
