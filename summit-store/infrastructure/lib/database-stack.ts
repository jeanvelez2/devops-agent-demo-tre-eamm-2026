import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly queue: sqs.Queue;
  public readonly dlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.dlq = new sqs.Queue(this, 'OrdersDLQ', {
      queueName: 'summit-store-orders-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    this.queue = new sqs.Queue(this, 'OrdersQueue', {
      queueName: 'summit-store-orders',
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: { queue: this.dlq, maxReceiveCount: 3 },
    });

    this.table = new dynamodb.Table(this, 'InventoryTable', {
      tableName: 'summit-store-inventory',
      partitionKey: { name: 'itemId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 25,
      writeCapacity: 25,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI with intentionally low capacity — throttles under load test queries
    this.table.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'itemId', type: dynamodb.AttributeType.STRING },
      readCapacity: 5,
      writeCapacity: 5,
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
    new cdk.CfnOutput(this, 'QueueUrl', { value: this.queue.queueUrl });

    // S3 bucket for order receipts — INSECURE: no encryption, public access not blocked
    new s3.Bucket(this, 'OrderReceiptsBucket', {
      bucketName: `summit-store-receipts-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // SECURITY ISSUE: No encryption configured
      // SECURITY ISSUE: Public access not explicitly blocked
    });
  }
}
