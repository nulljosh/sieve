---
name: mail
description: General-purpose inbox triage and cleanup — dev-tool alerts (ASC, Vercel, Sentry, GitHub Actions), promo/newsletter noise, and anything else cluttering the inbox. Files real issues into the right project's roadmap.md, fixes trivial ones directly, and archives/deletes junk. Use when the user says "check my email", "clean my inbox", "/mail", or pastes a screenshot of inbox notifications.
---

# mail

Replaces the manual screenshot → Notes.app → paste-into-Claude loop, and manual promo-email deleting. User-triggered only — no cron, per the "no background automation" rule in `~/CLAUDE.md`.

## Sources

- iCloud/other Mail.app accounts (macOS): read headlessly via `osascript` against Mail.app — never UI-script it (per `feedback_headless_automation`). **`inbox`/`trash mailbox` refer only to the default account** — this machine has 3 enabled accounts (iCloud, Ja, Gmail per `accounts`), each with its own `INBOX` and trash-equivalent (name varies: "Deleted Messages", "Trash", "Bin"). Always loop every enabled account's mailboxes, never the bare `inbox`/`trash mailbox` shorthand:
  ```applescript
  tell application "Mail"
    repeat with a in accounts
      if enabled of a then
        repeat with mb in mailboxes of a
          if name of mb is "INBOX" then
            repeat with m in (messages of mb)
              -- subject of m, sender of m, date received of m, content of m
            end repeat
          end if
        end repeat
      end if
    end repeat
  end tell
  ```
  Deleting/archiving is also plain AppleScript (`delete m`, or move to a mailbox) — no UI scripting needed, but target the message's own mailbox, not a hardcoded `trash mailbox`.
- Gmail: use `mcp__claude_ai_Gmail__*` MCP tools if connected (load via ToolSearch first).

## Two buckets

**1. Dev-tool alerts** — needs action or filing.
- `itunesconnect@apple.com`, "App Store Connect" — subjects like "issue with your ... submission", "Action needed"
- Vercel deployment-failed notifications
- Sentry alert emails
- GitHub Actions failure notifications

Per matched email:
1. Extract the app/project name from the subject — match against directory names under `~/Documents/Code`.
2. Extract the actual error/reason from the body.
3. Cross-check against that project's `roadmap.md` and memory (`~/.claude/projects/-Users-joshua/memory/`) — if already resolved, mark stale, skip filing, note in summary.
4. For a CI/build-failure alert (GitHub Actions, Vercel), pull the actual failure log (`gh run view <id> --log-failed`, Vercel build log) before filing — don't file the bare subject line. If the log points to a root cause fixable in a few lines, fix it directly (root cause, not the symptom the alert names) and push. If a project-specific skill exists that owns that kind of work (e.g. `asc-*` for App Store Connect issues, `xcodebuildmcp` for iOS/macOS build failures), hand off to that skill instead of hand-rolling the fix. Only file to roadmap.md if it's ambiguous, needs a skill/tool that doesn't exist, or is bigger than a few lines.
5. A workflow with a `paths:` filter may not re-run automatically after a fix that touches a file outside that filter (e.g. a fix in `scripts/` when the trigger only watches `web/**`) — if so, trigger it manually (`gh workflow run <name> --ref main`) and confirm it goes green before considering the alert resolved.
6. Otherwise append a dated entry under `## Inbox` in that project's `roadmap.md`.

**2. Junk/noise** — safe to clear without filing anything.
- Promo/marketing email (Product Hunt digests, newsletters, "X launched today" blasts, cold sales outreach)
- Notification spam with no action attached (social "someone liked your post" style emails)
- Anything the user names as noise for this run

### Spam scoring

Score each candidate before bucketing it as junk — don't rely on subject vibes alone. Signals, any 2+ = spam:
- Sender domain doesn't match the display name/brand (e.g. "PayPal" from a random `.xyz`/`.top`/numeric domain)
- Generic bulk greeting ("Dear Customer", no name) combined with a call to action (click, claim, verify, login)
- Urgency/scarcity language: "act now", "expires today", "your account will be suspended", "limited time"
- Body is mostly a tracking-pixel image + one link, little real text
- `List-Unsubscribe` header present but sender is not a service the user recognizes/uses
- Reply-to domain differs from the From domain
- Mismatched/obfuscated links (visible text says one domain, `href` goes elsewhere) — treat as spam/phishing, never click through

A real person replying in a thread, or a service the user actually has an account with (ASC, Vercel, GitHub, banks, etc.) is never spam regardless of promotional tone — route those to bucket 1 or leave alone.

**Unsubscribing**: for confirmed junk, check the message source (`source of m`, or headers) for a `List-Unsubscribe` header first — most bulk senders have one.
- If `List-Unsubscribe-Post: List-Unsubscribe=One-Click` is present (RFC 8058), POST directly to the `https://` URL in `List-Unsubscribe` with `curl -X POST -d "List-Unsubscribe=One-Click"` — no browser needed, this is the standard one-click unsubscribe every major ESP (SparkPost, Mailgun, Hive, etc.) supports. A 2xx/204 response means it worked.
- If there's no one-click POST variant but a `mailto:` unsubscribe address is given, that also works without a browser — it's just an email send, skip unless asked.
- Only fall back to Chrome (`claude-in-chrome`, load tools via ToolSearch first) for an in-body unsubscribe link with no `List-Unsubscribe` header at all — open it, scroll to the link, click it, click through any confirmation step. If the extension isn't connected, try the link via `curl -IL` (GET) first — a working unsubscribe page often just needs a plain request — before asking the user to click it themselves.
- Skip entirely for anything that looks like a phishing/obfuscated-link trap (mismatched href) — unsubscribing there just confirms the address is live; delete instead without clicking or requesting anything.

Per matched email: archive or delete (user's call — ask once per run which, then apply to all matches). Never touches anything from a real person (a message with a human sender name replying in a thread) or anything matching bucket 1. Even in a short/single-item run, still ask once before deleting/archiving — don't skip the confirmation just because the batch is small.

## Dry run

Default mode unless the user says to actually apply changes. Dry run: read the inbox, classify every message into bucket 1 / bucket 2 / "leave alone", print counts and a few examples per category, take zero destructive action. User reviews, then says go for the real pass.

## Empty trash

If the user asks to empty trash (or says so once, applying to future runs): **`delete` on a message that's already in a trash mailbox is a no-op** — Mail.app's AppleScript dictionary has no permanent-erase/expunge command, only the UI action "Mailbox → Erase Deleted Items" (or the empty-trash toolbar button), which this skill can't invoke without UI-scripting. Also confirm Mail.app is actually running (`osascript -e 'tell application "System Events" to (name of processes) contains "Mail"'`) — background IMAP delete/move ops can silently fail to sync if the app was never launched; `open -a Mail` first if not.

What this skill CAN do headlessly: move trash-mailbox messages out (e.g. to Archive) as a workaround, but that's not the same as emptying trash. For an actual permanent empty, tell the user it needs the one manual click (Mail → Mailbox → Erase Deleted Items, or per-account, or the empty-trash button) — don't claim success from an AppleScript `delete` loop on an already-in-trash message.

## Output

One-shot summary: counts per category, what was filed, what was auto-fixed, what would be/was archived-deleted. No essay per email.

## Don't

- Don't set up any recurring/background job for this — always user-invoked.
- Don't UI-script Mail.app or open it visibly; AppleScript reads/deletes/moves only, no System Events.
- Don't re-file something already tracked as resolved in project memory — check first.
- Don't delete/archive anything in a dry run.
- Don't touch messages from real people, even if they look promotional (e.g. a real recruiter).

## Usage awareness
Single-pass scan, not a fanout task — no subagents per email. Batch-read messages together rather than one round-trip per message. Fix only what's trivially mechanical; anything ambiguous goes to roadmap.md or gets left alone rather than guessed at.
