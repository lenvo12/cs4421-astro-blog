# Astro deployment

The original `StaticSiteStack` provisions the legacy private S3 bucket and
CloudFront distribution. Its deployed content is intentionally frozen: the
repository no longer has an automatic workflow that republishes files to S3
or invalidates that distribution.

## Legacy static-site stack

The static stack remains in the CDK app but is not deployed by the ECS workflow.
Do not run an unqualified `cdk deploy`, which could deploy both stacks. Use
`cdk deploy EcsStack` when working on the container service.

## ECS deployment workflows

`.github/workflows/deploy-container.yml` runs on every push to `main`, including
pull request merges. It installs dependencies, runs Astro tests/check/lint/build
and CDK tests/build, then builds a Linux AMD64 Docker image tagged with the
commit SHA, pushes it to the existing `astro-blog` ECR repository, and deploys
only `EcsStack` with that image. A failed check prevents image publishing and
deployment. Docker runs on GitHub's hosted runner; Docker Desktop does not need
to be running on a developer's computer.

Configure these repository settings under **Settings > Secrets and variables >
Actions**:

* **Secrets:** `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, using credentials
  permitted to push to the existing ECR repository and deploy `EcsStack` in
  `us-east-1`.
* **Variables:** `SUPABASE_URL` with the HTTPS Supabase project URL and
  `PUBLIC_SITE_ORIGIN` with the ECS stack's `CloudFrontUrl` value.

The workflow does not build or deploy the legacy static S3/CloudFront site.
Concurrent automated and manual ECS deployments share a concurrency group so
they do not deploy at the same time.

`.github/workflows/deploy-ecs.yml` remains available for manually deploying an
existing image tag, such as for a rollback. Open **Actions > Deploy ECS service
> Run workflow**, select the branch containing the workflow, and enter the
image tag, Supabase URL, and public site origin. It deploys only `EcsStack`; it
does not build or push an image.

`EcsStack` is a separate staging service. It imports the existing ECR
repository named `astro-blog` (override with
`ECR_REPOSITORY_NAME`). It does not create another ECR repository.

The service uses one small Fargate task in public subnets behind an HTTP
Application Load Balancer and a separate CloudFront distribution. CloudFront
provides the browser-facing HTTPS URL; Astro SSR still runs in the Node
container on ECS. Requests, cookies, query strings, and all HTTP methods are
forwarded to the service without caching. Use the `CloudFrontUrl` stack output
for browser access. The load balancer remains publicly reachable over HTTP as
the CloudFront origin; this does not force clients to use CloudFront or make
the ALB private.

The stack creates no NAT Gateways, checks `/api/health`, rolls back failed ECS
deployments, and sends container logs to a CloudWatch log group retained for
seven days. This is a cost-conscious lab setup, not a high-availability
production setup. The ALB, CloudFront distribution, and public IPv4 addresses
can incur charges for as long as the stack exists, even when the service is
idle.

The leaderboard API reads `SUPABASE_URL` from the `SupabaseUrl` stack
parameter and `SUPABASE_SECRET_KEY` from the existing Secrets Manager secret
`pips-ascension/supabase-secret-key`. Create that secret before deploying the
stack and store only the Supabase server secret key in it. The ECS task role
receives permission to read the secret; the key is injected at task startup and
is not included in the container image or CloudFormation template. The
`SupabaseUrl` parameter is required by CDK and both GitHub deployment
workflows. The `PublicSiteOrigin` parameter must be set to the service's
`CloudFrontUrl` output so browser score submissions can be checked against the
public origin even though CloudFront forwards requests to the ALB.

Before deploying, confirm the AWS CLI is authenticated to the intended account
and region, and that the selected image tag exists in that account's ECR
repository. `cdk synth` and `cdk diff` do not create the service. Review the
diff before deployment.

From the `cdk` directory, compile and test the template without deploying:

```powershell
npm ci
npm run build
npm test -- --runInBand test/ecs-stack.test.ts
npx cdk synth EcsStack
npx cdk diff EcsStack
```

For manual image builds, use a unique tag. From the repository root, derive the
registry address from the currently authenticated AWS account:

```powershell
$ImageTag = 'v1.0.2'
$AccountId = (aws sts get-caller-identity --query Account --output text).Trim()
$EcrUri = "$AccountId.dkr.ecr.us-east-1.amazonaws.com"
docker build --platform linux/amd64 -t "astro-blog:$ImageTag" .
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $EcrUri
docker tag "astro-blog:$ImageTag" "$EcrUri/astro-blog:$ImageTag"
docker push "$EcrUri/astro-blog:$ImageTag"
```

Use a new tag for each application version so rollback can select a known image.
For example, after pushing a new image, deploy it from GitHub Actions using that
tag, or from the `cdk` directory. Supply the Supabase project URL as well:

```powershell
$SupabaseUrl = 'https://your-project-ref.supabase.co'
$PublicSiteOrigin = 'https://your-distribution-id.cloudfront.net'
npx cdk deploy EcsStack --parameters EcsStack:ImageTag=$ImageTag --parameters EcsStack:SupabaseUrl=$SupabaseUrl --parameters EcsStack:PublicSiteOrigin=$PublicSiteOrigin
```

The `CloudFrontUrl` output is the HTTPS address for the SSR service and the
value to use for `PublicSiteOrigin`. The
`LoadBalancerDnsName` output is the HTTP origin hostname; use the CloudFront
URL in a browser. The existing static website and its CloudFront distribution
remain unchanged. To stop ALB, CloudFront, and Fargate charges after the lab,
remove the ECS stack:

```powershell
npx cdk destroy EcsStack
```

## Rollback drill

ECS uses a deployment circuit breaker to roll back a deployment if the new task
does not become healthy. For a manual rollback, run **Actions > Deploy ECS
service > Run workflow** with the previous known-good ECR image tag. Do not use
an intentionally broken image on a public service unless the outage is
explicitly approved; perform the rollback exercise only in a disposable
staging service.

## Local commands

Run these commands from the repository root:

```powershell
npm ci
npm run build
cd cdk
npm ci
npm test
npx cdk synth
```
