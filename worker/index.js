// Entry point for a Workers deployment: the admin API, with static files served
// through the ASSETS binding.
//
// The Pages entry point is functions/api/admin/[[path]].js. Both wrap the same
// router in worker/api.js, so neither platform gets its own copy of the logic.

import { handleApiRequest, withSecurityHeaders } from "./api.js";

export default {
  async fetch(request, env) {
    const handled = await handleApiRequest({ request, env });
    if (handled) return handled;

    if (!env.ASSETS) return new Response("Assets binding chưa được cấu hình.", { status: 500 });
    return withSecurityHeaders(await env.ASSETS.fetch(request), env);
  }
};
