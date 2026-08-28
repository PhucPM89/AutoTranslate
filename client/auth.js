"use strict";

// Reader accounts, talking to Supabase GoTrue over plain REST.
//
// Google OAuth is the sole sign-in method: readers authenticate via Google,
// Supabase redirects back with tokens in the URL fragment, and the app stores
// the session locally in localStorage.
//
// Nothing here touches the read path. A chapter still comes from the CDN with no
// token attached, so being logged in costs a reader exactly one localStorage read
// on load, and one token refresh per hour of continuous use.

const core = require("./auth-core.js");

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function createAuthClient({ url, anonKey, storage, fetchImpl = fetch, now = () => Date.now() }) {
  const base = String(url || "").replace(/\/$/, "");
  let session = core.readSession(storage);
  const listeners = new Set();
  let refreshing = null;

  function emit() {
    for (const listener of listeners) {
      try {
        listener(session);
      } catch (error) {
        console.warn("Auth listener failed.", error);
      }
    }
  }

  function adopt(next) {
    session = next || null;
    core.writeSession(storage, session);
    emit();
    return session;
  }

  async function call(path, { body, token, method = "POST" } = {}) {
    const response = await fetchImpl(`${base}/auth/v1${path}`, {
      method,
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  }

  // Where Google OAuth lands back. GoTrue validates against the redirect allow-list.
  function redirectTo() {
    if (typeof location === "undefined") return "";
    return `${location.origin}${location.pathname}`;
  }

  function getOAuthUrl(provider = "google") {
    const target = redirectTo();
    const query = new URLSearchParams({
      provider,
      ...(target ? { redirect_to: target } : {})
    });
    return `${base}/auth/v1/authorize?${query.toString()}`;
  }

  function signInWithGoogle() {
    const authUrl = getOAuthUrl("google");
    if (typeof location !== "undefined") {
      location.href = authUrl;
    }
    return { ok: true, url: authUrl };
  }

  async function signOut() {
    const token = session?.accessToken;
    adopt(null);
    if (token) await call("/logout", { token }).catch(() => ({}));
    return { ok: true };
  }

  // Renewal is shared: several callers can await the same in-flight request.
  function refresh() {
    if (refreshing) return refreshing;
    if (!core.canRefresh(session)) {
      adopt(null);
      return Promise.resolve(null);
    }
    const token = session.refreshToken;
    refreshing = call("/token?grant_type=refresh_token", { body: { refresh_token: token } })
      .then(({ ok, payload }) => {
        if (!ok) return adopt(null);
        return adopt(core.normalizeSession(payload, now()));
      })
      .catch(() => session)
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function ensureFreshToken() {
    if (!session) return null;
    if (!core.isExpired(session, now())) return session;
    return refresh();
  }

  // Adopts tokens handed over in the URL fragment (#) or query params (?) after Google OAuth redirect.
  function adoptFromUrl() {
    if (typeof location === "undefined") return { adopted: false, message: "" };
    const fromUrl = core.sessionFromUrl(location.hash, location.search, now());
    const message = core.errorFromUrl(location.hash, location.search);
    if (!fromUrl && !message) return { adopted: false, message: "" };
    if (fromUrl) adopt(fromUrl);
    if (typeof history !== "undefined" && history.replaceState) {
      try {
        const urlParams = new URLSearchParams(location.search);
        const authParamKeys = [
          "access_token",
          "refresh_token",
          "expires_in",
          "expires_at",
          "token_type",
          "type",
          "error",
          "error_code",
          "error_description"
        ];
        let changed = false;
        for (const k of authParamKeys) {
          if (urlParams.has(k)) {
            urlParams.delete(k);
            changed = true;
          }
        }
        const qs = changed ? (urlParams.toString() ? `?${urlParams.toString()}` : "") : location.search;
        const hash = location.hash && (location.hash.includes("access_token=") || location.hash.includes("error=")) ? "" : location.hash;
        history.replaceState(null, "", `${location.pathname}${qs}${hash}`);
      } catch {}
    }
    return { adopted: Boolean(fromUrl), message };
  }

  return {
    getSession: () => session,
    getUser: () => session?.user || null,
    getOAuthUrl,
    signInWithGoogle,
    signOut,
    ensureFreshToken,
    adoptFromUrl,
    subscribe(listener) {
      listeners.add(listener);
      listener(session);
      return () => listeners.delete(listener);
    }
  };
}

// Wires the header button and the dialog for Google login.
function initAuth({ url, anonKey, els }) {
  const button = els.accountOpen;
  if (!url || !anonKey || !button) {
    if (button) button.hidden = true;
    return null;
  }

  const client = createAuthClient({
    url,
    anonKey,
    storage: safeStorage()
  });

  function setMessage(text, kind = "info") {
    const node = els.authMessage;
    if (!node) return;
    node.textContent = text || "";
    node.hidden = !text;
    node.classList.toggle("is-error", kind === "error");
    node.classList.toggle("is-success", kind === "success");
  }

  function render(session) {
    const signedIn = Boolean(session);

    if (els.accountInitial) {
      els.accountInitial.textContent = signedIn ? core.accountInitial(session.user) : "";
      els.accountInitial.hidden = !signedIn;
    }
    if (els.accountIcon) els.accountIcon.hidden = signedIn;
    button.classList.toggle("is-signed-in", signedIn);
    const label = signedIn ? `Tài khoản ${core.accountLabel(session.user)}` : "Đăng nhập";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);

    if (els.authGuest) els.authGuest.hidden = signedIn;
    if (els.authAccount) els.authAccount.hidden = !signedIn;

    if (els.authTitle) {
      els.authTitle.textContent = signedIn ? "Tài khoản" : "Đăng nhập";
    }
    if (signedIn) {
      const user = session.user || {};
      if (els.authAccountName) els.authAccountName.textContent = user.fullName || user.email || "Độc giả";
      if (els.authAccountEmail) els.authAccountEmail.textContent = user.email || "";
      if (els.authAccountInitial) els.authAccountInitial.textContent = core.accountInitial(user);
      if (els.authAccountAvatar) {
        if (user.avatarUrl) {
          els.authAccountAvatar.src = user.avatarUrl;
          els.authAccountAvatar.hidden = false;
          if (els.authAccountInitial) els.authAccountInitial.hidden = true;
        } else {
          els.authAccountAvatar.hidden = true;
          if (els.authAccountInitial) els.authAccountInitial.hidden = false;
        }
      }
    }
  }

  client.subscribe(render);

  const fromLink = client.adoptFromUrl();
  if (fromLink.adopted) {
    setMessage("Đăng nhập Google thành công.", "success");
    els.authDialog?.showModal();
  } else if (fromLink.message) {
    setMessage(fromLink.message, "error");
    els.authDialog?.showModal();
  }

  button.addEventListener("click", () => {
    setMessage("");
    els.authDialog?.showModal();
  });
  els.authClose?.addEventListener("click", () => els.authDialog?.close());
  els.authDialog?.addEventListener("click", (event) => {
    if (event.target === els.authDialog) els.authDialog.close();
  });

  els.authGoogleBtn?.addEventListener("click", () => {
    setMessage("Đang chuyển hướng tới Google...", "info");
    client.signInWithGoogle();
  });

  els.authSignOut?.addEventListener("click", async () => {
    await client.signOut();
    setMessage("Đã đăng xuất.", "success");
  });

  const renewSoon = () => {
    const session = client.getSession();
    if (!session) return;
    if (Number(session.expiresAt) - Date.now() > REFRESH_MARGIN_MS) return;
    client.ensureFreshToken().catch(() => {});
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(renewSoon, { timeout: 5000 });
  else setTimeout(renewSoon, 2000);

  return client;
}

function safeStorage() {
  try {
    const probe = "tramChu.probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

module.exports = { createAuthClient, initAuth };
