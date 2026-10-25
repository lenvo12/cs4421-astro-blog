# ADR-002: Supabase-Backed Shared Leaderboard

## Status
Accepted — the Supabase schema and Astro API are implemented and deployed with the ECS staging service. Score checks are lightweight deterrents, not proof that gameplay occurred.

## Context
The game previously kept scores in each browser, so players could not see a shared ranking. Existing browser scores are test data and are not migrated. The game has no player accounts; submissions use public callsigns.

## Decision
Use Supabase Postgres to store one best score per exact callsign. Callsigns are case-sensitive (`Pip` and `pip` are distinct); the server trims and collapses whitespace while preserving capitalization. A score can only increase. Scores are integers from 1 through 10,000 metres; summit status is derived from reaching 10,000 metres. The leaderboard displays the top 100 entries, ordered by score and then earliest achievement time.

The browser communicates with Astro server routes, not directly with Supabase. The server uses `SUPABASE_URL` and the server-only `SUPABASE_SECRET_KEY`. Row Level Security is enabled, direct access for public and authenticated client roles is revoked, and the server role has the required read and RPC access. ECS reads the secret from AWS Secrets Manager; the Supabase project URL is a stack parameter. The static S3/CloudFront site does not run these routes.

Each climb requests a server-signed run ticket bound to its callsign and server start time. A submission must include a valid ticket that is no more than two hours old. The score must be at most `500 + 250 × elapsed seconds`, capped by the existing 10,000-metre limit. The API also limits each case-insensitive callsign to 60 ticket requests and 30 score submissions per minute. The ticket signature uses key material derived from the existing Supabase secret; the ticket is verified by Astro and only the callsign and score are sent to Supabase.

These checks reject immediate or implausibly fast score claims but do not simulate or verify the game. Tickets are reusable, rate limits are in-memory and per callsign, and a person can wait long enough or use another callsign to bypass the deterrents. Callsign ownership is not established. Profanity is not automatically filtered; entries can be moderated manually in Supabase.

## Consequences

### Good Things
* **Shared rankings:** Players see the same top scores across browsers.
* **Protected credentials:** The Supabase secret remains on the server and is not bundled into client assets.
* **Consistent best-score rules:** The database atomically keeps only a higher score for the exact callsign.
* **Basic score friction:** Signed run tickets, plausible-time checks, and per-callsign rate limits make trivial score submissions harder without adding accounts.
* **No test-data carryover:** Existing local scores are excluded from the shared leaderboard.

### Bad Things
* **Not cheat-proof:** No server-side simulation verifies movement or proves a submitted score was earned.
* **No identity or ownership:** Anyone can submit or improve a score under any exact callsign, and entries are public.
* **Manual moderation:** Profanity and suspicious results require manual review and deletion; there is no automatic filter.
* **Runtime dependency:** The shared leaderboard requires the Astro Node server and a configured Supabase project; it is unavailable on the frozen static deployment.
* **Operational setup:** The Supabase URL and secret must remain correctly configured in local development and ECS.
