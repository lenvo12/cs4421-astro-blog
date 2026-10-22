# Astro deployment

The original `StaticSiteStack` provisions the legacy private S3 bucket and
CloudFront distribution. Its deployed content is intentionally frozen: the
repository no longer has an automatic workflow that republishes files to S3
or invalidates that distribution.

## Legacy static-site stack

The static stack remains in the CDK app but is not deployed by the ECS workflow.
Do not run an unqualified `cdk deploy`, which could deploy both stacks. Use
`cdk deploy EcsStack` when working on the container service.

## ECS deployment workflow

`.github/workflows/deploy-ecs.yml` is manually triggered from GitHub Actions.
It deploys only `EcsStack`, using the selected image tag already present in the
`astro-blog` ECR repository. It does not build or push an image, and it does
not update the legacy S3/CloudFront site. Configure the repository actions
secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` with credentials
permitted to deploy the stack in `us-east-1`.

In GitHub, open **Actions > Deploy ECS service > Run workflow**, select the
branch containing the workflow, and enter an existing ECR image tag (for
example, `v1.0.1`). Merging code alone does not deploy a new container image.
Build and push the image manually first; automated image building and pushing
can be added to a later workflow.

`EcsStack` is a separate, manually deployed staging service. It imports the
existing ECR repository named `astro-blog` (override with
`ECR_REPOSITORY_NAME`). It does not create another ECR repository.

The service uses one small Fargate task in public subnets behind an HTTP
Application Load Balancer. It creates no NAT Gateways, checks
`/api/health`, rolls back failed ECS deployments, and sends container logs to
a CloudWatch log group retained for seven days. This is a cost-conscious lab
setup, not a high-availability production setup. The ALB and public IPv4
addresses can incur charges for as long as the stack exists, even when the
service is idle.

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

The image build and push remain manual for now. Use a new version tag not
already used in ECR. From the repository root, derive the registry address
from the currently authenticated AWS account:

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
tag, or from the `cdk` directory:

```powershell
npx cdk deploy EcsStack --parameters EcsStack:ImageTag=$ImageTag
```

The `LoadBalancerDnsName` output is the public HTTP address. The existing
static website remains unchanged. To stop ALB and Fargate charges after the
lab, remove the ECS stack:

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
