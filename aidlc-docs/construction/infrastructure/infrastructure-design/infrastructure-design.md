# Infrastructure Design — summit-store

## AWS Region: us-east-1

## Stack 1: NetworkStack
- VPC with 2 public subnets, 2 private subnets (2 AZs)
- NAT Gateway (single, cost-optimized for demo)
- Security groups:
  - ALB SG: inbound 80 from VPC CIDR only (internal ALB)
  - Services SG: inbound from ALB SG on service ports
  - Lambda SG: outbound only

## Stack 2: DatabaseStack
- DynamoDB table: `summit-store-inventory`
  - Partition key: `itemId` (String)
  - Billing: Provisioned (25 RCU, 25 WCU)
  - GSI: `status-index`
    - Partition key: `status` (String)
    - Sort key: `itemId` (String)
    - Provisioned: **5 RCU, 5 WCU** (intentionally under-provisioned — GSI queries throttle under load)
  - Point-in-time recovery: disabled (demo)
- SQS Queue: `summit-store-orders`
  - Dead-letter queue: `summit-store-orders-dlq` (maxReceiveCount: 3)
  - Visibility timeout: 30s

## Stack 3: ServicesStack
- **ALB**: Internal, HTTP listener on port 80
  - Target: order-service ECS tasks on port 3000
  - Health check: GET /health

- **CloudFront Distribution**: 
  - Origin: ALB (HTTP_ONLY protocol policy)
  - WAF WebACL attached with IP set rule (scoped to demo presenter IP)
  - This is the public entry point (not the ALB directly)

- **ECS Cluster**: `summit-store`

- **order-service** (Fargate):
  - Image: built from services/order-service/Dockerfile
  - CPU: 256, Memory: 512
  - Port: 3000
  - Environment: PAYMENT_SERVICE_URL, SQS_QUEUE_URL, AWS_REGION
  - X-Ray sidecar container

- **payment-service** (Fargate):
  - Image: built from services/payment-service/Dockerfile
  - CPU: 256, Memory: 512
  - Port: 5000
  - Environment: GATEWAY_TIMEOUT_MS=5000, GATEWAY_URL (mock)
  - Service Discovery: payment-service.summit-store.local
  - X-Ray sidecar container

- **inventory-service** (Fargate):
  - Image: built from services/inventory-service/Dockerfile
  - CPU: 256, Memory: 512
  - Port: 5001
  - Environment: DYNAMODB_TABLE, SQS_QUEUE_URL, AWS_REGION
  - Service Discovery: inventory-service.summit-store.local
  - X-Ray sidecar container

- **Lambda** (order-notifications):
  - Runtime: Python 3.12
  - Timeout: **3s** (intentionally too short for SES calls)
  - Trigger: SQS queue (same as inventory)
  - **Intentional weakness**: timeout too short

- **IAM Role** (order-service-role):
  - **Intentional weakness**: has `s3:*` on `*` (overly broad)
  - Comment: "// TODO: Scope to specific bucket and actions"

- **Cloud Map** namespace: summit-store.local (for service discovery)

## Stack 4: MonitoringStack

### Alarms (Critical for Demo 3 — Triage Agent)

**DESIGN CONSTRAINT**: Both alarms below are on order-service metrics. When payment-service times out, order-service experiences both high latency AND errors, triggering both alarms simultaneously.

- **order-service-p99-latency**: 
  - Metric: order-service ALB TargetResponseTime p99 > 500ms
  - Period: 60s, EvaluationPeriods: 2
  - Actions: SNS topic

- **order-service-error-rate**:
  - Metric: order-service ALB HTTPCode_Target_5XX_Count / RequestCount > 5%
  - Period: 60s, EvaluationPeriods: 2
  - Actions: SNS topic

- **dynamodb-throttling**:
  - Metric: DynamoDB WriteThrottleEvents > 0
  - Period: 60s, EvaluationPeriods: 1
  - Actions: SNS topic

- **MISSING** (intentional): No alarm on SQS DLQ depth (for Prevention demo to recommend)

### Observability
- X-Ray tracing enabled on all ECS services (sidecar daemon)
- CloudWatch Logs: each service logs to /ecs/summit-store/{service-name}
- Application Signals: configured via X-Ray service map

### SNS Topic
- `summit-store-alarms` — receives all alarm notifications
- Subscription: email (configurable) + optional Slack webhook

## CloudFormation Outputs
- CloudFront distribution URL (public entry point)
- ALB URL (internal)
- order-service ARN
- payment-service ARN
- inventory-service ARN
- DynamoDB table name
- SQS queue URL
