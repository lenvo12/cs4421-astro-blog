# ADR-001: Hosting Astro SSR in ECS

## Status
Accepted — the standalone Node.js application is containerized and deployed as a staging service on ECS Fargate behind an Application Load Balancer and CloudFront. The separate static S3/CloudFront site remains unchanged.

## Context
The original site is hosted as static files in a private S3 bucket behind CloudFront. Static hosting cannot run Astro server routes, so the game health endpoint and shared leaderboard require a server runtime.

## Decision
Astro uses server output (`output: 'server'`) with the standalone Node.js adapter. The Docker image is stored in the existing `astro-blog` ECR repository and runs as one Fargate task in public subnets behind an Application Load Balancer. A separate CloudFront distribution is the browser-facing HTTPS endpoint; it forwards requests to the SSR service without caching. The ALB remains publicly reachable over HTTP, so CloudFront is not an exclusive access path.

Deployment is manual. A new application image must be built and pushed to ECR before deploying `EcsStack` with its image tag. The GitHub Actions deployment workflow is manually triggered and deploys an existing image; merging to `main` does not build or deploy one. Deploy only `EcsStack`, not an unqualified CDK app deployment. The legacy static S3/CloudFront content remains frozen and separate.

## Consequences

### Good Things
* **Server features:** Astro routes such as `/api/health` and the shared leaderboard can run in Node.
* **Consistent images:** The same versioned container image can be used for deployments and rollbacks.
* **HTTPS access:** CloudFront provides the browser-facing HTTPS URL while the Astro SSR process continues to run in ECS.

### Bad Things
* **Cost:** Fargate, the load balancer, and CloudFront can incur ongoing AWS charges while deployed.
* **Operations:** The container, service health, logs, and deployments require monitoring and maintenance.
* **Public origin:** The ALB remains reachable directly over HTTP; CloudFront does not force every client to use HTTPS.
* **Separate hosting:** The deployed ECS service does not update the frozen static S3 website.
