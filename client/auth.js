"use strict";

// Reader accounts, talking to Supabase GoTrue over plain REST.
//
// No Supabase JS client. It would add tens of kilobytes to a bundle that every
// reader downloads, to wrap six fetch calls - the same reason this project signs
// its own R2 requests instead of shipping the AWS SDK.
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
    // GoTrue answers 204 with an empty body on logout, and an error page is not
    // always JSON, so parsing has to be allowed to fail.
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  }

  // Where the confirmation and recovery links come back to. GoTrue only honours
  // it when the URL is in the project allow-list and otherwise falls back to the
  // configured Site URL, so sending it is safe either way.
  function redirectTo() {
    if (typeof location === "undefined") return "";
    return `${location.origin}${location.pathname}`;
  }

  async function signUp({ email, password }) {
    const invalid = core.validateCredentials({ email, password });
    if (invalid) return { ok: false, message: invalid };

    const target = redirectTo();
    const query = target ? `?redirect_to=${encodeURIComponent(target)}` : "";
    const { ok, status, payload } = await call(`/signup${query}`, {
      body: { email: String(email).trim(), password }
    });
    if (!ok) return { ok: false, message: core.authErrorMessage(status, payload) };

    const outcome = core.describeSignup(payload, now());
    if (outcome.session) {
      adopt(outcome.session);
      return { ok: true, message: "Đã tạo tài khoản và đăng nhập.", needsConfirmation: false };
    }
    return {
      ok: true,
      needsConfirmation: true,
      email: outcome.email || String(email).trim(),
      message: `Đã gửi email xác nhận tới ${outcome.email || String(email).trim()}. Mở hộp thư và bấm liên kết để kích hoạt tài khoản.`
    };
  }

  async function signIn({ email, password }) {
    const invalid = core.validateCredentials({ email, password });
    if (invalid) return { ok: false, message: invalid };

    const { ok, status, payload } = await call("/token?grant_type=password", {
      body: { email: String(email).trim(), password }
    });
    if (!ok) {
      return {
        ok: false,
        message: core.authErrorMessage(status, payload),
        // Drives the resend button: this is the one failure a reader can fix
        // from inside the dialog.
        needsConfirmation: String(payload?.error_code || "") === "email_not_confirmed",
        email: String(email).trim()
      };
    }
    const next = core.normalizeSession(payload, now());
    if (!next) return { ok: false, message: "Đăng nhập không trả về phiên hợp lệ." };
    adopt(next);
    return { ok: true, message: "" };
  }

  async function signOut() {
    const token = session?.accessToken;
    // Cleared locally whatever the server says. A failed logout call must not
    // leave the reader looking signed in.
    adopt(null);
    if (token) await call("/logout", { token }).catch(() => ({}));
    return { ok: true };
  }

  async function resendConfirmation(email) {
    if (!core.isValidEmail(email)) return { ok: false, message: "Email chưa đúng định dạng." };
    const target = redirectTo();
    const query = target ? `?redirect_to=${encodeURIComponent(target)}` : "";
    const { ok, status, payload } = await call(`/resend${query}`, {
      body: { type: "signup", email: String(email).trim() }
    });
    if (!ok) return { ok: false, message: core.authErrorMessage(status, payload) };
    return { ok: true, message: "Đã gửi lại email xác nhận." };
  }

  async function requestPasswordReset(email) {
    if (!core.isValidEmail(email)) return { ok: false, message: "Nhập email của bạn rồi bấm lại." };
    const target = redirectTo();
    const query = target ? `?redirect_to=${encodeURIComponent(target)}` : "";
    const { ok, status, payload } = await call(`/recover${query}`, { body: { email: String(email).trim() } });
    if (!ok) return { ok: false, message: core.authErrorMessage(status, payload) };
    // GoTrue answers the same way for an unknown address, on purpose, so the
    // wording must not imply the account exists.
    return { ok: true, message: "Nếu email này có tài khoản, liên kết đặt lại mật khẩu đã được gửi." };
  }

  // Renewal is shared: several callers can await the same in-flight request, and
  // a refresh token that GoTrue has already rotated must not be sent twice.
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

  // Adopts tokens handed over in the URL fragment by a confirmation or recovery
  // link, and clears them from the address bar in the same turn.
  function adoptFromUrl() {
    if (typeof location === "undefined") return { adopted: false, message: "" };
    const fromHash = core.sessionFromUrlHash(location.hash, now());
    const message = core.errorFromUrlHash(location.hash);
    if (!fromHash && !message) return { adopted: false, message: "" };
    if (fromHash) adopt(fromHash);
    if (typeof history !== "undefined" && history.replaceState) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
    return { adopted: Boolean(fromHash), message };
  }

  return {
    getSession: () => session,
    signUp,
    signIn,
    signOut,
    resendConfirmation,
    requestPasswordReset,
    ensureFreshToken,
    adoptFromUrl,
    subscribe(listener) {
      listeners.add(listener);
      listener(session);
      return () => listeners.delete(listener);
    }
  };
}

// Wires the header button and the dialog. Returns the client so the rest of the
// app can read the session without going through the DOM.
function initAuth({ url, anonKey, els }) {
  const button = els.accountOpen;
  // With no project configured there is nothing to log into, and a button that
  // opens a dialog which can only fail is worse than no button.
  if (!url || !anonKey || !button) {
    if (button) button.hidden = true;
    return null;
  }

  const client = createAuthClient({
    url,
    anonKey,
    storage: safeStorage()
  });

  let pendingEmail = "";

  function setMessage(text, kind = "info") {
    const node = els.authMessage;
    if (!node) return;
    node.textContent = text || "";
    node.hidden = !text;
    node.classList.toggle("is-error", kind === "error");
    node.classList.toggle("is-success", kind === "success");
  }

  function showResend(email) {
    pendingEmail = email || "";
    if (els.authResend) els.authResend.hidden = !pendingEmail;
  }

  // Which form the dialog shows while signed out. Kept in a variable rather than
  // read back off the DOM so signing out cannot leave the panel in a state that
  // depends on which tab happened to be open first.
  let activeTab = "login";

  function selectTab(which) {
    activeTab = which === "register" ? "register" : "login";
    setMessage("");
    showResend("");
    render(client.getSession());
  }

  function render(session) {
    const signedIn = Boolean(session);
    const registering = activeTab === "register";

    if (els.accountInitial) {
      els.accountInitial.textContent = signedIn ? core.accountInitial(session.user) : "";
      els.accountInitial.hidden = !signedIn;
    }
    if (els.accountIcon) els.accountIcon.hidden = signedIn;
    button.classList.toggle("is-signed-in", signedIn);
    const label = signedIn ? `Tài khoản ${core.accountLabel(session.user)}` : "Đăng nhập";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);

    if (els.authAccount) els.authAccount.hidden = !signedIn;
    if (els.authTabs) els.authTabs.hidden = signedIn;
    if (els.authLoginForm) els.authLoginForm.hidden = signedIn || registering;
    if (els.authRegisterForm) els.authRegisterForm.hidden = signedIn || !registering;

    els.authLoginTab?.classList.toggle("active", !registering);
    els.authRegisterTab?.classList.toggle("active", registering);
    els.authLoginTab?.setAttribute("aria-selected", String(!registering));
    els.authRegisterTab?.setAttribute("aria-selected", String(registering));

    if (els.authTitle) {
      els.authTitle.textContent = signedIn ? "Tài khoản" : registering ? "Tạo tài khoản" : "Đăng nhập";
    }
    if (signedIn) {
      if (els.authAccountEmail) els.authAccountEmail.textContent = session.user.email || "Đã đăng nhập";
      if (els.authAccountInitial) els.authAccountInitial.textContent = core.accountInitial(session.user);
    }
  }

  async function withBusy(form, action) {
    const submit = form.querySelector("[type=submit]");
    if (submit) submit.disabled = true;
    try {
      return await action();
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  client.subscribe(render);

  // A confirmation link arrives with tokens in the fragment, so it has to be
  // handled before anything else reads the hash.
  const fromLink = client.adoptFromUrl();
  if (fromLink.adopted) {
    setMessage("Đã xác nhận email. Bạn đang đăng nhập.", "success");
    els.authDialog?.showModal();
  } else if (fromLink.message) {
    setMessage(fromLink.message, "error");
    els.authDialog?.showModal();
  }

  button.addEventListener("click", () => {
    if (!client.getSession()) selectTab("login");
    els.authDialog?.showModal();
  });
  els.authClose?.addEventListener("click", () => els.authDialog?.close());
  els.authDialog?.addEventListener("click", (event) => {
    if (event.target === els.authDialog) els.authDialog.close();
  });
  els.authLoginTab?.addEventListener("click", () => selectTab("login"));
  els.authRegisterTab?.addEventListener("click", () => selectTab("register"));

  els.authLoginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    withBusy(els.authLoginForm, async () => {
      setMessage("Đang đăng nhập...");
      showResend("");
      const result = await client
        .signIn({ email: els.authLoginEmail.value, password: els.authLoginPassword.value })
        .catch(() => ({ ok: false, message: "Không kết nối được tới máy chủ đăng nhập." }));
      if (!result.ok) {
        setMessage(result.message, "error");
        if (result.needsConfirmation) showResend(result.email);
        return;
      }
      els.authLoginPassword.value = "";
      setMessage("");
      els.authDialog?.close();
    });
  });

  els.authRegisterForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    withBusy(els.authRegisterForm, async () => {
      if (els.authRegisterPassword.value !== els.authRegisterConfirm.value) {
        setMessage("Hai lần nhập mật khẩu chưa giống nhau.", "error");
        return;
      }
      setMessage("Đang tạo tài khoản...");
      showResend("");
      const result = await client
        .signUp({ email: els.authRegisterEmail.value, password: els.authRegisterPassword.value })
        .catch(() => ({ ok: false, message: "Không kết nối được tới máy chủ đăng nhập." }));
      if (!result.ok) {
        setMessage(result.message, "error");
        return;
      }
      els.authRegisterPassword.value = "";
      els.authRegisterConfirm.value = "";
      setMessage(result.message, "success");
      if (result.needsConfirmation) showResend(result.email);
      else els.authDialog?.close();
    });
  });

  els.authResend?.addEventListener("click", async () => {
    els.authResend.disabled = true;
    const result = await client
      .resendConfirmation(pendingEmail)
      .catch(() => ({ ok: false, message: "Không gửi lại được. Thử lại sau." }));
    setMessage(result.message, result.ok ? "success" : "error");
    els.authResend.disabled = false;
  });

  els.authForgot?.addEventListener("click", async () => {
    const result = await client
      .requestPasswordReset(els.authLoginEmail.value)
      .catch(() => ({ ok: false, message: "Không gửi được yêu cầu. Thử lại sau." }));
    setMessage(result.message, result.ok ? "success" : "error");
  });

  els.authSignOut?.addEventListener("click", async () => {
    await client.signOut();
    // selectTab resets the message, so the confirmation is written after it.
    selectTab("login");
    setMessage("Đã đăng xuất.", "success");
  });

  // Kept off the critical path: a stored token is only renewed once the landing
  // page has settled, and only if it is actually near expiry.
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

// Safari in private mode exposes localStorage and throws on use, so the object
// existing is not enough to go on.
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
