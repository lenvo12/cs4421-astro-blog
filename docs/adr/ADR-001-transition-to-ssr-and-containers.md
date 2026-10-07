# ADR-001: Changing to a Live Server and Containers

## Status
Proposed

## Context
Our website is currently static. It is hosted on **AWS S3** and **CloudFront**. This is fast and cheap, but static websites cannot run backend code.
To add features like health monitoring, user logins, and game leaderboards, we need a server that can run code dynamically.

## Decision
We will change our Astro website from a static site (`output: 'static'`) to a live server app (`output: 'server'`).

We will:
1. Install the official Node.js adapter to build a standalone backend server.
2. Put this server inside a **Docker container** so it can run anywhere.
3. Add code to create machine-readable server logs.
4. Add a health status page at `/api/health`.

## Consequences

### Good Things
* **New Features:** We can now securely connect to databases, handle passwords, and save game high scores.
* **Consistency:** The Docker container will run the exact same way on our computers and in the cloud.
* **Monitoring:** Cloud tools can check our health endpoint to make sure the app hasn't crashed.

### Bad Things
* **Cost:** Running a live server container 24/7 costs more money than hosting static files on S3.
* **Management:** We have to monitor the server to ensure it stays online if too many people play the game at once.
