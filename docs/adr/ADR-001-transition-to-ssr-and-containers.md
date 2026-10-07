# ADR-001: Changing to a Live Server and Containers

## Status
In progress — the local standalone SSR setup is implemented; containerization and production migration are pending.

## Context
The production deployment currently uses **AWS S3** and **CloudFront** to serve the site as static files. The repository now also has a local Astro server setup, but the AWS deployment has not been migrated to run that server.

Static hosting is fast and inexpensive, but it cannot run backend code for each request. To support features such as health monitoring, user logins, and game leaderboards, we need a server that can run code dynamically.

## Decision
We are transitioning Astro from static output (`output: 'static'`) to server output (`output: 'server'`) using the standalone Node.js adapter.

The local SSR setup is implemented: the Node.js adapter is configured in standalone mode, `/api/health` returns server status as JSON, and middleware emits structured JSON request logs. The standalone server has been built and run locally.

The next planned steps are to package the server in a **Docker container** and choose and implement a production deployment that runs the container. The current S3/CloudFront deployment remains static and does not run the SSR server.

## Consequences

### Good Things
* **New Features:** Server-side rendering makes backend features such as database access and user authentication possible, provided those features are implemented securely.
* **Consistency:** Once containerized, the same application image can be run locally and in the cloud.
* **Monitoring:** The health endpoint can be used by monitoring tools to check whether the running server is responding.

### Bad Things
* **Cost:** Running a server container continuously is likely to cost more than serving static files from S3.
* **Management:** A production server/container needs operational monitoring and capacity planning.
* **Migration:** The current static AWS deployment must be replaced or extended before it can serve the SSR application; the local SSR setup alone does not change production hosting.
