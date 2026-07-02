import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

interface DevOpsAgentTriggerStackProps extends cdk.StackProps {
  alarmTopicArn: string;
}

export class DevOpsAgentTriggerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DevOpsAgentTriggerStackProps) {
    super(scope, id, props);

    const { alarmTopicArn } = props;

    // ─── Secrets Manager: Store webhook credentials ─────────────────────────────
    // After deploying, update this secret with your webhook URL and secret from
    // the DevOps Agent console (Capabilities → Webhook → Generate webhook)
    const webhookCredentials = new secretsmanager.Secret(this, 'WebhookCredentials', {
      secretName: 'summit-store-devops-agent-webhook',
      description: 'DevOps Agent webhook credentials (URL and signing secret)',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          webhookUrl: 'REPLACE_WITH_WEBHOOK_URL',
          webhookSecret: 'REPLACE_WITH_WEBHOOK_SECRET',
          authType: 'HMAC',
        }),
        generateStringKey: 'placeholder',
      },
    });

    // ─── Lambda: Webhook trigger function ────────────────────────────────────────
    const triggerLogGroup = new logs.LogGroup(this, 'TriggerFnLogGroup', {
      logGroupName: '/aws/lambda/summit-store-devops-agent-trigger',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const triggerFn = new lambda.Function(this, 'DevOpsAgentTriggerFn', {
      functionName: 'summit-store-devops-agent-trigger',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'devops-agent-trigger')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      description: 'Receives CloudWatch alarm events and triggers DevOps Agent investigations via webhook',
      logGroup: triggerLogGroup,
      environment: {
        SECRET_ARN: webhookCredentials.secretArn,
      },
    });

    // Grant Lambda read access to the secret
    webhookCredentials.grantRead(triggerFn);

    // ─── Path 1: SNS Subscription ────────────────────────────────────────────────
    // CloudWatch Alarm → SNS topic (summit-store-alarms) → Lambda
    const alarmTopic = sns.Topic.fromTopicArn(this, 'AlarmTopic', alarmTopicArn);
    alarmTopic.addSubscription(new snsSubscriptions.LambdaSubscription(triggerFn));

    // ─── Path 2: EventBridge Rule ────────────────────────────────────────────────
    // CloudWatch Alarm State Change → EventBridge → Lambda
    // This catches ALL alarm state changes in the account, filtered to ALARM state
    const alarmStateChangeRule = new events.Rule(this, 'AlarmStateChangeRule', {
      ruleName: 'summit-store-alarm-to-devops-agent',
      description: 'Routes CloudWatch alarm state changes to DevOps Agent trigger Lambda',
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
        detail: {
          state: {
            value: ['ALARM'],
          },
          alarmName: [
            'order-service-p99-latency',
            'order-service-error-rate',
            'dynamodb-gsi-throttling',
          ],
        },
      },
    });

    alarmStateChangeRule.addTarget(new targets.LambdaFunction(triggerFn, {
      retryAttempts: 2,
    }));

    // ─── Outputs ─────────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'TriggerFunctionArn', {
      value: triggerFn.functionArn,
      description: 'ARN of the DevOps Agent trigger Lambda function',
    });

    new cdk.CfnOutput(this, 'WebhookSecretArn', {
      value: webhookCredentials.secretArn,
      description: 'ARN of the Secrets Manager secret storing webhook credentials',
    });

    new cdk.CfnOutput(this, 'SetupInstructions', {
      value: [
        'SETUP: 1) Go to DevOps Agent console → Agent Space → Capabilities → Webhook → Generate webhook.',
        '2) Update the secret in Secrets Manager (summit-store-devops-agent-webhook) with webhookUrl and webhookSecret values.',
        '3) Alarms will now automatically trigger DevOps Agent investigations.',
      ].join(' '),
    });
  }
}
