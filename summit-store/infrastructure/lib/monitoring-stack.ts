import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface MonitoringStackProps extends cdk.StackProps {
  alb: elbv2.ApplicationLoadBalancer;
  tableName: string;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { alb, tableName } = props;

    const alarmTopic = new sns.Topic(this, 'AlarmTopic', { topicName: 'summit-store-alarms' });

    // ALARM 1: order-service p99 latency > 500ms
    // Fires when payment-service is slow (order-service waits on it)
    const p99Alarm = new cloudwatch.Alarm(this, 'OrderP99Latency', {
      alarmName: 'order-service-p99-latency',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'TargetResponseTime',
        dimensionsMap: { LoadBalancer: alb.loadBalancerFullName },
        statistic: 'p99',
        period: cdk.Duration.seconds(60),
      }),
      threshold: 0.5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    p99Alarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // ALARM 2: order-service error rate > 5%
    // Fires when payment-service fails (order-service returns 5xx)
    const requests = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
      dimensionsMap: { LoadBalancer: alb.loadBalancerFullName },
      statistic: 'Sum',
      period: cdk.Duration.seconds(60),
    });
    const errors = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_5XX_Count',
      dimensionsMap: { LoadBalancer: alb.loadBalancerFullName },
      statistic: 'Sum',
      period: cdk.Duration.seconds(60),
    });
    const errorRateAlarm = new cloudwatch.Alarm(this, 'OrderErrorRate', {
      alarmName: 'order-service-error-rate',
      metric: new cloudwatch.MathExpression({
        expression: 'errors / requests * 100',
        usingMetrics: { errors, requests },
        period: cdk.Duration.seconds(60),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    errorRateAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // ALARM 3: DynamoDB GSI throttling
    const throttleAlarm = new cloudwatch.Alarm(this, 'DynamoThrottling', {
      alarmName: 'dynamodb-gsi-throttling',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ReadThrottleEvents',
        dimensionsMap: {
          TableName: tableName,
          GlobalSecondaryIndexName: 'status-index',
        },
        statistic: 'Sum',
        period: cdk.Duration.seconds(60),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    throttleAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // INTENTIONAL WEAKNESS: No alarm on SQS DLQ depth
    // TODO: Add alarm on DLQ ApproximateNumberOfMessagesVisible > 0
    // DevOps Agent Prevention should recommend this
  }
}
