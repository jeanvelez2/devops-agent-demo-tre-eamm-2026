import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// BAD CHANGE: S3 bucket without encryption — violates release standards
export class BadBucket extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new s3.Bucket(this, 'ReportsBucket', {
      bucketName: 'summit-store-reports-unencrypted',
      encryption: s3.BucketEncryption.UNENCRYPTED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
