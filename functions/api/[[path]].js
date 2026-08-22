// Entry point for a Pages deployment.
//
// Pages routes by file path, and this catch-all takes every /api/* request.
// Static files are served by Pages itself.
//
// The logic lives in worker/api.js and is shared with worker/index.js.

import { handleApiRequest } from "../../worker/api.js";

export async function onRequest(context) {
  const handled = await handleApiRequest({ request: context.request, env: context.env });
  if (handled) return handled;
  return new Response(JSON.stringify({ error: "Not found." }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
