const RUNS_KEY = "history";
const MAX_RUNS = 50;

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const WEB_REDIRECT = "https://siftbox.heyitsmejosh.com/auth/callback";

// ponytail: JSON blob in KV per session id, no schema migrations needed for a single-user-per-row store.
async function getSession(env, id) {
  if (!id) return null;
  return (await env.SESSIONS.get(`sess:${id}`, "json")) || null;
}
async function putSession(env, id, data) {
  await env.SESSIONS.put(`sess:${id}`, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 30 });
}

function cookie(req, name) {
  const raw = req.headers.get("Cookie") || "";
  const m = raw.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}

function sessionIdFromRequest(req) {
  const auth = req.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return cookie(req, "sieve_session");
}

async function refreshIfNeeded(env, id, session) {
  if (session.expires_at > Date.now() + 30_000) return session;
  const body = new URLSearchParams({
    client_id: session.client_id,
    refresh_token: session.refresh_token,
    grant_type: "refresh_token",
  });
  if (session.client_secret) body.set("client_secret", session.client_secret);
  const r = await fetch(GOOGLE_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) return null;
  const tok = await r.json();
  session.access_token = tok.access_token;
  session.expires_at = Date.now() + tok.expires_in * 1000;
  await putSession(env, id, session);
  return session;
}

// --- spam scoring, ported from SKILL.md's rules ---
const URGENCY = /\b(act now|expires? today|verify your account|suspend|limited time|click here|claim now|final notice)\b/i;
const KNOWN_SERVICES = /appleid\.apple\.com|apple\.com|itunesconnect|vercel\.com|sentry\.io|github\.com|stripe\.com|supabase\.(io|com)|cloudflare\.com/i;

function domainOf(addr) {
  const m = addr.match(/@([^ >]+)/);
  return m ? m[1].toLowerCase() : "";
}

function scoreMessage({ from, replyTo, subject, snippet, listUnsubscribe }) {
  let score = 0;
  const reasons = [];
  const fromDomain = domainOf(from);
  const displayName = (from.match(/^"?([^"<]*)"?\s*</) || [, ""])[1].trim();

  if (displayName && !KNOWN_SERVICES.test(fromDomain) && /paypal|apple|amazon|bank|google|microsoft/i.test(displayName) && !fromDomain.includes(displayName.toLowerCase().split(" ")[0])) {
    score += 2; reasons.push("sender name/domain mismatch");
  }
  if (URGENCY.test(subject) || URGENCY.test(snippet)) { score += 1; reasons.push("urgency language"); }
  if (/dear (customer|user|member)/i.test(snippet)) { score += 1; reasons.push("generic bulk greeting"); }
  if (listUnsubscribe && !KNOWN_SERVICES.test(fromDomain)) { score += 1; reasons.push("unsubscribe header, unfamiliar sender"); }
  if (replyTo && domainOf(replyTo) && domainOf(replyTo) !== fromDomain) { score += 1; reasons.push("reply-to domain differs"); }

  return { score, reasons, isJunk: score >= 2 && !KNOWN_SERVICES.test(fromDomain) };
}

function header(headers, name) {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

async function gmailFetch(session, path, opts = {}) {
  return fetch(`${GMAIL}${path}`, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.access_token}` },
  });
}

async function listMessages(session) {
  const listRes = await gmailFetch(session, "/messages?maxResults=30&labelIds=INBOX");
  if (!listRes.ok) throw new Error(`gmail list failed: ${listRes.status}`);
  const { messages = [] } = await listRes.json();
  const out = [];
  for (const m of messages) {
    const r = await gmailFetch(session, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Reply-To&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post`);
    if (!r.ok) continue;
    const msg = await r.json();
    const headers = msg.payload?.headers || [];
    const from = header(headers, "From");
    const subject = header(headers, "Subject");
    const replyTo = header(headers, "Reply-To");
    const listUnsubscribe = header(headers, "List-Unsubscribe");
    const oneClick = /one-click/i.test(header(headers, "List-Unsubscribe-Post"));
    const snippet = msg.snippet || "";
    const { score, reasons, isJunk } = scoreMessage({ from, replyTo, subject, snippet, listUnsubscribe });
    out.push({ id: m.id, from, subject, snippet, score, reasons, isJunk, listUnsubscribe, oneClick });
  }
  return out;
}

async function unsubscribe(listUnsubscribe, oneClick) {
  const urlMatch = listUnsubscribe.match(/<(https?:[^>]+)>/);
  if (urlMatch && oneClick) {
    const r = await fetch(urlMatch[1], { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    return r.ok || r.status === 204;
  }
  if (urlMatch) {
    const r = await fetch(urlMatch[1]);
    return r.ok;
  }
  return false;
}

export default {
  async fetch(request, env) {
    const { pathname, searchParams } = new URL(request.url);

    // --- OAuth: web flow (confidential client, redirect to /auth/callback with a session cookie) ---
    if (pathname === "/auth/start") {
      const url = new URL(GOOGLE_AUTH);
      url.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID);
      url.searchParams.set("redirect_uri", WEB_REDIRECT);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", SCOPE);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      return Response.redirect(url.toString(), 302);
    }

    if (pathname === "/auth/callback" && !searchParams.has("native")) {
      const code = searchParams.get("code");
      if (!code) return new Response("missing code", { status: 400 });
      const body = new URLSearchParams({
        code, client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: WEB_REDIRECT, grant_type: "authorization_code",
      });
      const tokRes = await fetch(GOOGLE_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!tokRes.ok) return new Response("token exchange failed", { status: 502 });
      const tok = await tokRes.json();
      const id = crypto.randomUUID();
      await putSession(env, id, {
        access_token: tok.access_token, refresh_token: tok.refresh_token,
        expires_at: Date.now() + tok.expires_in * 1000,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      });
      return new Response(null, {
        status: 302,
        headers: { Location: "/?connected=1", "Set-Cookie": `sieve_session=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` },
      });
    }

    // Native (iOS/macOS) PKCE flow: app exchanges the code itself against Google (public client,
    // no secret needed), then hands sieve the resulting tokens to mint a session it can hand back
    // as a bearer token — same session store, same /api/* routes as the web app.
    if (pathname === "/auth/native" && request.method === "POST") {
      const { access_token, refresh_token, expires_in, client_id } = await request.json();
      if (!access_token || !refresh_token) return new Response("missing tokens", { status: 400 });
      const id = crypto.randomUUID();
      await putSession(env, id, { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000, client_id });
      return Response.json({ token: id });
    }

    if (pathname === "/auth/logout") {
      const id = sessionIdFromRequest(request);
      if (id) await env.SESSIONS.delete(`sess:${id}`);
      return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": "sieve_session=; Path=/; Max-Age=0" } });
    }

    // --- mail API, session-gated ---
    if (pathname === "/api/messages" && request.method === "GET") {
      const id = sessionIdFromRequest(request);
      let session = await getSession(env, id);
      if (!session) return new Response("not connected", { status: 401 });
      session = await refreshIfNeeded(env, id, session);
      if (!session) return new Response("session expired", { status: 401 });
      try {
        return Response.json(await listMessages(session));
      } catch (e) {
        return new Response(String(e), { status: 502 });
      }
    }

    if (pathname === "/api/action" && request.method === "POST") {
      const id = sessionIdFromRequest(request);
      let session = await getSession(env, id);
      if (!session) return new Response("not connected", { status: 401 });
      session = await refreshIfNeeded(env, id, session);
      if (!session) return new Response("session expired", { status: 401 });
      const { messageId, action, listUnsubscribe, oneClick } = await request.json();
      if (action === "unsubscribe") {
        const ok = listUnsubscribe ? await unsubscribe(listUnsubscribe, oneClick) : false;
        // fall through to archive regardless — junk leaves the inbox either way
        await gmailFetch(session, `/messages/${messageId}/modify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removeLabelIds: ["INBOX"] }) });
        return Response.json({ unsubscribed: ok, archived: true });
      }
      if (action === "archive") {
        const r = await gmailFetch(session, `/messages/${messageId}/modify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removeLabelIds: ["INBOX"] }) });
        return Response.json({ archived: r.ok });
      }
      if (action === "delete") {
        const r = await gmailFetch(session, `/messages/${messageId}/trash`, { method: "POST" });
        return Response.json({ deleted: r.ok });
      }
      return new Response("unknown action", { status: 400 });
    }

    // --- run history (skill-reported dry-run/apply summaries) ---
    if (pathname === "/api/runs" && request.method === "GET") {
      return Response.json((await env.RUNS.get(RUNS_KEY, "json")) || []);
    }
    if (pathname === "/api/runs" && request.method === "POST") {
      if (request.headers.get("Authorization") !== `Bearer ${env.RUN_TOKEN}`) return new Response("unauthorized", { status: 401 });
      const body = await request.json();
      const run = {
        at: new Date().toISOString(),
        mode: body.mode === "apply" ? "apply" : "dry-run",
        filed: body.filed | 0, fixed: body.fixed | 0, unsubscribed: body.unsubscribed | 0, archived: body.archived | 0,
      };
      const runs = [run, ...((await env.RUNS.get(RUNS_KEY, "json")) || [])].slice(0, MAX_RUNS);
      await env.RUNS.put(RUNS_KEY, JSON.stringify(runs));
      return Response.json(run, { status: 201 });
    }

    return env.ASSETS.fetch(request);
  },
};
