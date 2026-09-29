# Astro static-site deployment

The CDK stack provisions a private, encrypted S3 bucket and an HTTPS-only
CloudFront distribution. Bucket deployments publish the Astro `dist/` output
and invalidate CloudFront's cache. The distribution also serves Astro's
trailing-slash routes from their generated `index.html` files.

## GitHub Actions setup

Add repository actions secrets named `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` in **Settings > Secrets and variables > Actions**.
The credentials must be allowed to deploy the CDK stack and bootstrap assets
in the target account. Set the optional `AWS_REGION` repository variable to the
desired region; the workflow defaults to `us-east-1`.

Before the first deployment, bootstrap CDK in that AWS account and region using
an administrator/deployment identity:

```powershell
cd cdk
npx cdk bootstrap aws://ACCOUNT_ID/REGION
```

Protect `main` in GitHub so changes are merged through reviewed pull requests.
After setup, merges to `main` build the Astro site and deploy the stack.
`SiteUrl` and `SiteBucketName` are printed as CloudFormation stack outputs.
The bucket is retained if the stack is removed.

## Rollback drill

The deployment workflow publishes every merge to `main`; a revert merged to
`main` republishes the restored site and invalidates CloudFront. Do not merge
an intentionally broken UI into a production site unless an outage is
explicitly approved. Prefer running the drill against a separate staging
stack and CloudFront distribution, then merge a revert pull request there and
confirm the site is restored.

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
