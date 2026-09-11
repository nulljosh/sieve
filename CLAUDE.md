# sieve

Inbox triage skill (`/mail`). No server, no cron — user-invoked only, per the "no background automation" rule in `~/CLAUDE.md`.

- `SKILL.md` is the whole product — sources, bucketing, spam scoring, unsubscribe handling, dry-run default.
- Symlinked into the actual skill path via `dotfiles/claude/claude-skills/mail` → this repo.
- `landing/` is a static describe-it page, no live app to embed (nothing web-facing runs).
- The README is the house writing reference. Do not loosen it.
