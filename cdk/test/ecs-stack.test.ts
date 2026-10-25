import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { EcsStack } from '../lib/ecs-stack';

function synthesize() {
  const app = new cdk.App();
  const stack = new EcsStack(app, 'TestEcsStack', {
    repositoryName: 'astro-blog',
  });

  return Template.fromStack(stack);
}

test('runs the existing tagged ECR image as one small Fargate task', () => {
  const template = synthesize();

  template.hasParameter('ImageTag', {
    Type: 'String',
    Default: 'v1.0.1',
    MinLength: 1,
  });
  template.hasParameter('SupabaseUrl', {
    Type: 'String',
    MinLength: 1,
    AllowedPattern: '^https://[A-Za-z0-9.-]+$',
  });
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    Cpu: '256',
    Memory: '512',
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Image: Match.objectLike({
          'Fn::Join': Match.anyValue(),
        }),
        PortMappings: [{ ContainerPort: 4321, Protocol: 'tcp' }],
        Environment: Match.arrayWith([
          { Name: 'NODE_ENV', Value: 'production' },
          { Name: 'HOST', Value: '0.0.0.0' },
          { Name: 'PORT', Value: '4321' },
          { Name: 'SUPABASE_URL', Value: Match.anyValue() },
        ]),
        Secrets: Match.arrayWith([
          Match.objectLike({
            Name: 'SUPABASE_SECRET_KEY',
            ValueFrom: Match.anyValue(),
          }),
        ]),
        LogConfiguration: Match.objectLike({
          LogDriver: 'awslogs',
        }),
      }),
    ]),
  });
});

test('uses public subnets without NAT gateways and exposes an HTTP load balancer', () => {
  const template = synthesize();

  template.resourceCountIs('AWS::EC2::NatGateway', 0);
  template.hasResourceProperties('AWS::ECS::Service', {
    DesiredCount: 1,
    LaunchType: 'FARGATE',
    NetworkConfiguration: {
      AwsvpcConfiguration: {
        AssignPublicIp: 'ENABLED',
      },
    },
    DeploymentConfiguration: {
      MinimumHealthyPercent: 100,
      MaximumPercent: 200,
      DeploymentCircuitBreaker: {
        Enable: true,
        Rollback: true,
      },
    },
  });
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 80,
    Protocol: 'HTTP',
  });
});

test('serves uncached SSR through an HTTPS CloudFront distribution', () => {
  const template = synthesize();

  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      DefaultCacheBehavior: {
        AllowedMethods: Match.arrayWith([
          'GET',
          'HEAD',
          'OPTIONS',
          'PUT',
          'PATCH',
          'POST',
          'DELETE',
        ]),
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
        OriginRequestPolicyId: '216adef6-5c7f-47e4-b989-5492eafa07d3',
        ViewerProtocolPolicy: 'redirect-to-https',
      },
      CustomErrorResponses: Match.arrayWith([
        {
          ErrorCode: 404,
          ErrorCachingMinTTL: 0,
        },
      ]),
      Origins: Match.arrayWith([
        Match.objectLike({
          OriginCustomHeaders: Match.arrayWith([
            {
              HeaderName: 'X-CloudFront-Viewer-Proto',
              HeaderValue: 'https',
            },
          ]),
          CustomOriginConfig: Match.objectLike({
            OriginProtocolPolicy: 'http-only',
          }),
        }),
      ]),
    },
  });
  template.hasOutput('CloudFrontUrl', {
    Value: Match.objectLike({
      'Fn::Join': Match.anyValue(),
    }),
  });
});

test('checks the existing health route and retains logs for one week', () => {
  const template = synthesize();

  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
    HealthCheckPath: '/api/health',
    HealthyThresholdCount: 2,
    UnhealthyThresholdCount: 3,
  });
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    RetentionInDays: 7,
  });
});
