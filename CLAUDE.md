# sieve

Inbox triage skill (`/mail`). Still no server-side triage and no cron — the skill is user-invoked only, per the "no background automation" rule in `~/CLAUDE.md`. Triage itself only ever runs inside a live Claude Code session with the user's own logged-in mail.

- `SKILL.md` is the whole triage product — sources, bucketing, spam scoring, unsubscribe handling, dry-run default.
- Symlinked into the actual skill path via `dotfiles/claude/claude-skills/mail` → this repo.
- `landing/index.html` is the web app: describe-it copy plus a run-history dashboard (`/api/runs`). No live mail access of its own — it only displays what the skill reported.
- `worker.js`: static assets + `/api/runs` (GET public, POST bearer-token gated via `RUN_TOKEN` secret, backed by the `RUNS` KV namespace). The skill POSTs a summary after each run (see SKILL.md's Output section); token lives in `secrets.fish` as `SIEVE_RUN_TOKEN`.
- `ios/`: xcodegen target, iOS + macOS, one SwiftUI file (`App/SieveApp.swift`) wrapping `sieve.heyitsmejosh.com/?embed` in WKWebView — same pattern as windgate/lucarne. Shows the same dashboard, nothing native beyond the wrapper.
- The README is the house writing reference. Do not loosen it.

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
