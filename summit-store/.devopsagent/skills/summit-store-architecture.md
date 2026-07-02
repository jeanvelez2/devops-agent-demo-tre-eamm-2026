---
name: summit-store-architecture
description: Architecture knowledge for the Summit Store application. Load this skill when investigating issues or answering questions about summit-store services including order-service, payment-service, and inventory-service. Contains critical information about service dependencies, DynamoDB constraints, and external integrations.
---

# Summit Store Architecture Knowledge

## Infrastructure Overview
- Summit Store runs 3 microservices on ECS Fargate:
  - **order-service** (Node.js)
  - **payment-service** (Python/Flask)
  - **inventory-service** (Python/Flask)
- Internal ALB in front of order-service
- SQS queue for async order-to-inventory communication

## Service Dependencies
- order-service depends on payment-service synchronously and inventory-service asynchronously via SQS
- If payment-service is degraded, order-service will cascade fail

## DynamoDB Constraints
- GSI "status-index" on inventory table is provisioned at 5 WCU
- Under load exceeding 5 writes/second on the GSI, throttling occurs

## External Dependencies
- Payment gateway has 99.5% SLA
- GATEWAY_TIMEOUT_MS environment variable controls timeout (minimum 5000ms)
- Values below 5000ms risk cascade failures during gateway latency spikes

## Known Architecture Gaps
- **No circuit breaker** on payment-service external gateway calls
- **No retry logic** on order-service payment calls
- **No canary deployments** in CI/CD pipeline
- **No CloudWatch alarm** on the SQS dead-letter queue

## Deployment Pipeline
- GitHub Actions with rolling ECS deployments to 100% traffic immediately
- No canary stage, no automated rollback, no pre-deploy smoke tests
- Bad configurations go fully live within 4 minutes of merge
- Recent incident (INC-2026-0042) caused by GATEWAY_TIMEOUT_MS reduced to 100ms in a single deploy

## Monitoring Architecture
- CloudWatch alarms: order-service-p99-latency (>500ms), order-service-error-rate (>5%), dynamodb-gsi-throttling (>0 events)
- Alarms → SNS topic (summit-store-alarms) → Lambda → DevOps Agent webhook
- EventBridge also routes alarm state changes as secondary trigger path
- MISSING: No alarm on SQS DLQ (summit-store-orders-dlq) — failed inventory reservations go unnoticed

## IAM Security
- order-service task role has s3:* on * — overly broad, should be scoped to specific bucket

## Failure Cascade Pattern
- When GATEWAY_TIMEOUT_MS < gateway response time (1-2s): payment-service returns 504 → order-service returns 500 → customer sees error
- No buffering, no graceful degradation, no fallback behavior exists
- 87% failure rate observed when timeout set to 100ms
