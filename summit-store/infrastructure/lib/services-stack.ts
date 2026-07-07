import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import * as lambdaEvents from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface ServicesStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  table: dynamodb.Table;
  queue: sqs.Queue;
  dlq: sqs.Queue;
}

export class ServicesStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);

    const { vpc, table, queue, dlq } = props;

    const cluster = new ecs.Cluster(this, 'Cluster', { clusterName: 'summit-store', vpc });

    const namespace = new servicediscovery.PrivateDnsNamespace(this, 'Namespace', {
      name: 'summit-store.local',
      vpc,
    });

    // ALB — internet-facing (WAF on CloudFront restricts to allowed IPs)
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
    });

    const listener = this.alb.addListener('HTTP', { port: 80 });

    // Scoped IAM: order-service only needs PutObject on order-receipts bucket
    const orderRole = new iam.Role(this, 'OrderServiceRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    orderRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`arn:aws:s3:::summit-store-receipts-${this.account}/*`],
    }));
    orderRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      resources: [queue.queueArn],
    }));
    orderRole.addToPolicy(new iam.PolicyStatement({
      actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
      resources: ['*'],
    }));
    orderRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));

    // order-service
    const orderTd = new ecs.FargateTaskDefinition(this, 'OrderTD', {
      cpu: 512, memoryLimitMiB: 1024, taskRole: orderRole,
    });
    orderTd.addContainer('app', {
      image: ecs.ContainerImage.fromAsset('../services/order-service', { platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64 }),
      portMappings: [{ containerPort: 3000 }],
      environment: {
        PAYMENT_SERVICE_URL: 'http://payment-service.summit-store.local:5000',
        SQS_QUEUE_URL: queue.queueUrl,
        AWS_REGION: this.region,
        AWS_XRAY_DAEMON_ADDRESS: 'localhost:2000',
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'app',
        logGroup: new logs.LogGroup(this, 'OrderLogGroup', {
          logGroupName: '/ecs/summit-store/order-service',
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          retention: logs.RetentionDays.ONE_WEEK,
        }),
      }),
    });
    orderTd.addContainer('xray', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/xray/aws-xray-daemon:latest'),
      portMappings: [{ containerPort: 2000, protocol: ecs.Protocol.UDP }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'xray', logGroup: new logs.LogGroup(this, 'OrderXrayLogGroup', { logGroupName: '/ecs/summit-store/order-service-xray', removalPolicy: cdk.RemovalPolicy.DESTROY, retention: logs.RetentionDays.ONE_WEEK }) }),
      memoryLimitMiB: 64,
      essential: false,
    });
    orderTd.addContainer('adot', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-otel-collector:latest'),
      command: ['--config=/etc/ecs/ecs-cloudwatch-xray.yaml'],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'adot', logGroup: new logs.LogGroup(this, 'OrderAdotLogGroup', { logGroupName: '/ecs/summit-store/order-service-adot', removalPolicy: cdk.RemovalPolicy.DESTROY, retention: logs.RetentionDays.ONE_WEEK }) }),
      memoryLimitMiB: 128,
      essential: false,
    });
    const orderService = new ecs.FargateService(this, 'OrderService', {
      cluster, taskDefinition: orderTd, desiredCount: 2,
      assignPublicIp: true,
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
    });
    listener.addTargets('OrderTarget', {
      port: 3000, targets: [orderService], protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: { path: '/health' },
    });

    // payment-service
    const paymentRole = new iam.Role(this, 'PaymentServiceRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    paymentRole.addToPolicy(new iam.PolicyStatement({
      actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
      resources: ['*'],
    }));
    paymentRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));
    const paymentTd = new ecs.FargateTaskDefinition(this, 'PaymentTD', { cpu: 512, memoryLimitMiB: 1024, taskRole: paymentRole });
    paymentTd.addContainer('app', {
      image: ecs.ContainerImage.fromAsset('../services/payment-service', { platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64 }),
      portMappings: [{ containerPort: 5000 }],
      environment: {
        GATEWAY_TIMEOUT_MS: '5000',
        GATEWAY_URL: 'https://httpbin.org/delay/1',
        AWS_XRAY_DAEMON_ADDRESS: 'localhost:2000',
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'app',
        logGroup: new logs.LogGroup(this, 'PaymentLogGroup', {
          logGroupName: '/ecs/summit-store/payment-service',
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          retention: logs.RetentionDays.ONE_WEEK,
        }),
      }),
    });
    paymentTd.addContainer('xray', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/xray/aws-xray-daemon:latest'),
      portMappings: [{ containerPort: 2000, protocol: ecs.Protocol.UDP }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'xray', logGroup: new logs.LogGroup(this, 'PaymentXrayLogGroup', { logGroupName: '/ecs/summit-store/payment-service-xray', removalPolicy: cdk.RemovalPolicy.DESTROY, retention: logs.RetentionDays.ONE_WEEK }) }),
      memoryLimitMiB: 64,
      essential: false,
    });
    paymentTd.addContainer('adot', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-otel-collector:latest'),
      command: ['--config=/etc/ecs/ecs-cloudwatch-xray.yaml'],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'adot', logGroup: new logs.LogGroup(this, 'PaymentAdotLogGroup', { logGroupName: '/ecs/summit-store/payment-service-adot', removalPolicy: cdk.RemovalPolicy.DESTROY, retention: logs.RetentionDays.ONE_WEEK }) }),
      memoryLimitMiB: 128,
      essential: false,
    });
    const paymentService = new ecs.FargateService(this, 'PaymentService', {
      cluster, taskDefinition: paymentTd, desiredCount: 1,
      assignPublicIp: true,
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      cloudMapOptions: { name: 'payment-service', dnsRecordType: servicediscovery.DnsRecordType.A, cloudMapNamespace: namespace },
    });
    paymentService.connections.allowFrom(orderService, ec2.Port.tcp(5000));

    // inventory-service
    const inventoryRole = new iam.Role(this, 'InventoryRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    table.grantReadWriteData(inventoryRole);
    queue.grantConsumeMessages(inventoryRole);
    inventoryRole.addToPolicy(new iam.PolicyStatement({
      actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
      resources: ['*'],
    }));
    inventoryRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));

    const inventoryTd = new ecs.FargateTaskDefinition(this, 'InventoryTD', {
      cpu: 512, memoryLimitMiB: 1024, taskRole: inventoryRole,
    });
    inventoryTd.addContainer('app', {
      image: ecs.ContainerImage.fromAsset('../services/inventory-service', { platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64 }),
      portMappings: [{ containerPort: 5001 }],
      environment: {
        DYNAMODB_TABLE: table.tableName,
        SQS_QUEUE_URL: queue.queueUrl,
        AWS_REGION: this.region,
        AWS_XRAY_DAEMON_ADDRESS: 'localhost:2000',
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'app',
        logGroup: new logs.LogGroup(this, 'InventoryLogGroup', {
          logGroupName: '/ecs/summit-store/inventory-service',
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          retention: logs.RetentionDays.ONE_WEEK,
        }),
      }),
    });
    inventoryTd.addContainer('xray', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/xray/aws-xray-daemon:latest'),
      portMappings: [{ containerPort: 2000, protocol: ecs.Protocol.UDP }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'xray', logGroup: new logs.LogGroup(this, 'InventoryXrayLogGroup', { logGroupName: '/ecs/summit-store/inventory-service-xray', removalPolicy: cdk.RemovalPolicy.DESTROY, retention: logs.RetentionDays.ONE_WEEK }) }),
      memoryLimitMiB: 64,
      essential: false,
    });
    inventoryTd.addContainer('adot', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-otel-collector:latest'),
      command: ['--config=/etc/ecs/ecs-cloudwatch-xray.yaml'],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'adot', logGroup: new logs.LogGroup(this, 'InventoryAdotLogGroup', { logGroupName: '/ecs/summit-store/inventory-service-adot', removalPolicy: cdk.RemovalPolicy.DESTROY, retention: logs.RetentionDays.ONE_WEEK }) }),
      memoryLimitMiB: 128,
      essential: false,
    });
    new ecs.FargateService(this, 'InventoryService', {
      cluster, taskDefinition: inventoryTd, desiredCount: 1,
      assignPublicIp: true,
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      cloudMapOptions: { name: 'inventory-service', dnsRecordType: servicediscovery.DnsRecordType.A, cloudMapNamespace: namespace },
    });

    // Lambda notification — INTENTIONAL WEAKNESS: 3s timeout too short for SES
    const notifFn = new lambda.Function(this, 'NotificationFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import time
def handler(event, context):
    # TODO: Increase timeout — 3s is too short for SES calls
    # INTENTIONAL WEAKNESS: timeout too short
    time.sleep(2)  # simulates SES latency
    for record in event['Records']:
        body = json.loads(record['body'])
        print(json.dumps({'message': 'notification sent', 'orderId': body.get('orderId')}))
    return {'statusCode': 200}
`),
      timeout: cdk.Duration.seconds(3),
    });
    notifFn.addEventSource(new lambdaEvents.SqsEventSource(dlq, { batchSize: 5 }));

    new cdk.CfnOutput(this, 'AlbUrl', { value: this.alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'OrderServiceArn', { value: orderService.serviceArn });
  }
}
