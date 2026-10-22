#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { EcsStack } from '../lib/ecs-stack';
import { StaticSiteStack } from '../lib/static-site-stack';

const app = new cdk.App();

new StaticSiteStack(app, 'StaticSiteStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new EcsStack(app, 'EcsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  repositoryName: process.env.ECR_REPOSITORY_NAME ?? 'astro-blog',
});
