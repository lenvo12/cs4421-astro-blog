import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface EcsStackProps extends cdk.StackProps {
  repositoryName: string;
}

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const repository = ecr.Repository.fromRepositoryName(
      this,
      'ApplicationRepository',
      props.repositoryName,
    );

    const imageTag = new cdk.CfnParameter(this, 'ImageTag', {
      type: 'String',
      default: 'v1.0.1',
      minLength: 1,
      description: 'Existing image tag in the ECR application repository.',
    });

    const vpc = new ec2.Vpc(this, 'ServiceVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const logGroup = new logs.LogGroup(this, 'ApplicationLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'AstroService', {
      vpc,
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      desiredCount: 1,
      cpu: 256,
      memoryLimitMiB: 512,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      circuitBreaker: { rollback: true },
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(repository, imageTag.valueAsString),
        containerPort: 4321,
        environment: {
          NODE_ENV: 'production',
          HOST: '0.0.0.0',
          PORT: '4321',
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'astro',
          logGroup,
        }),
      },
    });

    service.targetGroup.configureHealthCheck({
      path: '/api/health',
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
      value: service.loadBalancer.loadBalancerDnsName,
      description: 'HTTP URL hostname for the running Astro service.',
    });

    new cdk.CfnOutput(this, 'CloudWatchLogGroup', {
      value: logGroup.logGroupName,
      description: 'CloudWatch log group receiving Astro container logs.',
    });
  }
}
