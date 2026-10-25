# ADR-002: Supabase-Backed Shared Leaderboard

## Status
Accepted — the leaderboard API and database migration are implemented. The schema has been run in Supabase; local credentials, AWS secret configuration, HTTPS, and deployment remain pending.

## Context
The game previously kept its leaderboard in each browser, so players could not see a shared ranking. Existing browser scores are test data and must not be migrated. The game does not use player accounts, and players submit results under a callsign.

## Decision
Use Supabase Postgres to store one best score per exact callsign. Callsigns are case-sensitive: `Pip` and `pip` are distinct. The server trims and collapses whitespace while preserving capitalization. A callsign's score can only increase; scores are integers from 1 through 10,000 metres, and summit status is derived from reaching 10,000 metres. The leaderboard displays the top 100 entries, ordered by score and then by earliest achievement time.

The browser communicates only with the Astro server routes at `/api/leaderboard`. The server validates submissions and accesses Supabase using `SUPABASE_URL` and the server-only `SUPABASE_SECRET_KEY`. The secret key is never placed in browser code. Row Level Security is enabled, direct access for public and authenticated client roles is revoked, and the server role is granted the required read and RPC access.

There are no player accounts or score verification. Anyone can submit a score or improve the score for any exact callsign, so leaderboard entries are public and can be forged. Existing browser scores are not uploaded.

The ECS task reads the Supabase secret from AWS Secrets Manager; its project URL is supplied as a stack parameter. The static S3/CloudFront site cannot run these server routes and will not receive the shared leaderboard.

## Consequences

### Good Things
* **Shared rankings:** Players see the same top scores across browsers.
* **Protected credentials:** Supabase's elevated key remains on the server and is not bundled into client assets.
* **Consistent best-score rules:** The database atomically keeps only a higher score for the exact callsign.
* **No test-data carryover:** Existing local scores are excluded from the shared leaderboard.

### Bad Things
* **Unverified results:** Without accounts or server-side gameplay verification, scores and callsign ownership are not trustworthy.
* **Runtime dependency:** The shared leaderboard requires the Astro Node server and a configured Supabase project; it is unavailable on the frozen static deployment.
* **Operational setup:** Local development and ECS require the Supabase URL and secret to be configured securely. ECS also needs an HTTPS front end before browser geolocation and production secure-cookie behavior work as intended.
