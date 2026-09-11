# Siftbox

Real Gmail triage app (web + iOS/macOS) as of 2026-09-11, plus the original `/mail` Claude Code skill for dev-tool-alert filing. This is a deliberate exception to the "no server-side triage" note that used to live here — the app itself now does real, user-invoked (never scheduled) OAuth + Gmail API reads, spam scoring, and unsubscribe/archive/delete. Still no cron, no background polling, per `~/CLAUDE.md`.

Renamed from Sieve to Siftbox 2026-09-11 — "Sieve" was taken on the App Store, and the standing rule is one name everywhere, not a Doorstock/BCGD-style split between the App Store listing and the product's own branding. Repo, GitHub (`nulljosh/siftbox`), domain (`siftbox.heyitsmejosh.com`), bundle display name, and all copy were swept in the same pass. `sieve.heyitsmejosh.com` still resolves (same Worker, extra route) for anything that already links there — don't remove it without checking inbound links first. Bundle ID stays `com.nulljosh.sieve` (internal, invisible to users, changing it would mean new signing/profiles for no visible benefit) and the repo folder is still named `sieve/` on disk.

- `worker.js`: the whole backend. `/auth/start` + `/auth/callback` (web OAuth, confidential client + secret) and `/auth/native` (iOS/macOS hands over PKCE-obtained tokens, gets back an opaque session token) mint a session stored in the `SESSIONS` KV namespace. `/api/messages` lists the inbox via the Gmail API and scores each message (same rules as SKILL.md, ported to JS). `/api/action` unsubscribes (RFC 8058 one-click POST where supported)/archives/deletes. `/api/runs` is the older skill-run history log (GET public, POST bearer-gated via `RUN_TOKEN`), unrelated to the mail API.
- `landing/index.html`: the actual inbox UI (Connect Gmail → list → Unsubscribe/Archive/Delete), plus the marketing copy and run-history panel. Native loads it with `?embed&native=1`; the Connect link becomes `siftboxnative://connect` under that flag so the native wrapper can intercept it (see below) instead of letting Google's OAuth page load inside a WKWebView, which Google blocks outright.
- `ios/App/SieveApp.swift` (file still named for the old repo name — struct inside is `SiftboxApp`): WKWebView wrapper. Its navigation delegate intercepts `siftboxnative://connect`, runs `ASWebAuthenticationSession` (system browser, not the WKWebView) against a **second, iOS-type OAuth client** (public, PKCE, no secret), exchanges the code directly with Google, POSTs the tokens to `/auth/native`, then reloads the WKWebView with `?token=` so the same JS that handles the web flow picks up the session.
- Google Cloud project `jaybulb-signin` is shared across apps for OAuth — don't spin up a new GCP project per app. "Web client 1" (confidential, used by Siftbox's web flow and Supabase social sign-in — redirect URIs pile up on one client, not one client per app) and "Sieve iOS/macOS" (public, PKCE) are both on it. Gmail API + `gmail.modify` scope enabled on that project. App is unverified (testing/100-user cap) — real use is fine, just shows Google's "unverified app" click-through; formal verification is a follow-up, not required to work.
- Secrets: `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` as Worker secrets (`npx wrangler secret put`), also mirrored in `secrets.fish` as `GOOGLE_OAUTH_CLIENT_ID`/`SIEVE_GOOGLE_CLIENT_SECRET`.
- `SKILL.md` is still the dev-tool-alert half of the product (App Store Connect/Vercel/Sentry/GitHub Actions emails → matched to project → fixed or filed) — that needs a coding agent, so it stays a Claude Code skill, not something the app can do itself. Symlinked into the actual skill path via `dotfiles/claude/claude-skills/mail` → this repo.
- ASC app id `6811141466`, bundle `com.nulljosh.sieve`, listing name **Siftbox**.
- The README is the house writing reference. Do not loosen it.

## Follow-ups
- Submit for Google OAuth verification to drop the "unverified app" warning and lift the 100-user cap (App Store review will likely expect this).
- Screenshots + submit for review once signing/build is confirmed working.

## Build (native)
```bash
cd ios && xcodegen generate
xcodebuild build -project Sieve.xcodeproj -scheme Sieve -destination 'platform=macOS'
xcodebuild build -project Sieve.xcodeproj -scheme Sieve -destination 'generic/platform=iOS Simulator'
```

## Deploy
```bash
npx wrangler deploy
```
