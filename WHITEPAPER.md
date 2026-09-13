# Siftbox Technical Whitepaper

**v2.0.0** | September 2026

An inbox fills up the same way every day: real mail mixed in with junk that
outnumbers it ten to one, and most triage tools want a login of their own
and a place to sit between you and your mail forever. Siftbox connects to
Gmail directly — web, iOS, macOS — reads the inbox, scores each message, and
clears the junk in one tap, because triage is a one-tap decision repeated a
hundred times a day, not a product you should have to configure.

## What it does

Sign-in with Google grants read/modify access to Gmail (OAuth, scoped to
`gmail.modify`). A Cloudflare Worker backend lists the inbox over the Gmail
API and scores each message before anything is touched: sender/display-name
domain mismatch, generic bulk greeting plus a call to action, urgency
language, an unsubscribe header from a sender nobody recognizes, a reply-to
domain that doesn't match the sender. Two or more signals confirms junk,
because any single signal alone is too easy for a legitimate sender to trip
by accident; a real person or a service the user has an account with is
never scored here regardless of tone, since the cost of wrongly archiving a
real email is much higher than missing a piece of spam.

## Unsubscribing

Most bulk senders already support RFC 8058 one-click unsubscribe —
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` alongside a
`List-Unsubscribe` URL. Siftbox POSTs to it directly; a 2xx/204 confirms it,
no browser required, because opening a browser to click one more button
defeats the point of automating the tedious part. The message is archived
either way once you act on it — archive, delete, or unsubscribe are each one
tap, nothing happens on its own.

## Cross-platform auth

Google blocks OAuth consent screens from loading inside an embedded WebView,
so a plain wrapper around the web login is a dead end on native, not a
shortcut. The web app runs a normal confidential-client OAuth flow. The
iOS/macOS wrapper instead intercepts the "Connect Gmail" action, opens the
system browser via `ASWebAuthenticationSession` against a second, public PKCE
OAuth client, exchanges the code directly with Google, and hands the
resulting tokens to the same backend — one shared UI, one shared API, two
login paths, because forking the UI per platform would double the surface
area for a problem that's really only in the login step.

## Where the old skill fits

The original Claude Code skill (`/mail`) still exists for the half of the
job that needs a coding agent, not a mail client: matching an App Store
Connect or GitHub Actions alert to the right project, pulling the real
failure log, and fixing or filing it. That half needs a coding agent making
judgment calls, not a scoring rule, so it stays a skill instead of folding
into the app. Siftbox and `/mail` share the same spam-scoring rules but run
independently.

## Design

- **Nothing moves until you tap it.** Reading and scoring never mutates
  anything; archive/delete/unsubscribe are each an explicit action, because
  an inbox is the one place a wrong automated guess (a real email archived
  by mistake) causes real harm.
- **No background automation.** No cron, no polling — every read is
  triggered by opening the app, so nothing touches your mail while you're
  not looking.

## License

MIT 2026, Joshua Trommel
