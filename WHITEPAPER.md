# sieve Technical Whitepaper

**v1.0.0** | September 2026

An inbox fills up the same way every day: real alerts mixed in with junk that
outnumbers them ten to one. sieve reads it headlessly, sorts it into two
piles, and closes the loop on both — file or fix the real ones, unsubscribe
and clear the junk.

## What it does

sieve is a Claude Code skill (`/mail`), not a hosted service. It reads every
enabled Mail.app account via AppleScript, or Gmail through its MCP tools, and
classifies each message.

**Dev-tool alerts** (App Store Connect, Vercel, Sentry, GitHub Actions) get
matched to a project directory, checked against that project's `roadmap.md`
and memory for staleness, and — where the root cause is a small fix or a
project skill already owns it — handled directly. Otherwise filed as a dated
`roadmap.md` entry.

**Junk** gets scored before it's touched, not just pattern-matched on
subject line: sender/display-name domain mismatch, generic bulk greeting
plus a call to action, urgency language, tracking-pixel-only bodies, an
unsubscribe header from a sender nobody recognizes, mismatched or obfuscated
links. Two or more signals confirms junk; a real person or a service the
user has an account with is never bucketed here regardless of tone.

## Unsubscribing

Most bulk senders already support RFC 8058 one-click unsubscribe —
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` alongside a
`List-Unsubscribe` URL. sieve POSTs to it directly; a 2xx/204 confirms it, no
browser required. Only messages with an in-body link and no header fall back
to driving Chrome, and anything with a mismatched href is left alone
entirely — clicking a phishing unsubscribe link just confirms the address is
live.

## Design

- **Dry run is the default.** Every run reads and classifies before it ever
  deletes or archives; the real pass is a separate, explicit step.
- **No background automation.** User-invoked only — this machine runs no
  crontab or watchdog for anything, mail included.
- **Root cause over symptom.** A CI or build-failure alert gets its actual
  log pulled before filing; a fixable one gets fixed and pushed, not just
  logged.

## Where it goes

Gmail coverage today is MCP-only, no IMAP fallback. Next: a light spam-score
memory, so a sender that scored borderline once doesn't need re-judging
every run.

## License

MIT 2026, Joshua Trommel
