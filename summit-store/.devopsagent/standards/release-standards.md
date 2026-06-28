# Release Standards — summit-store

## Code Quality
- All S3 buckets must have encryption enabled
- Error handling must not be removed without replacement
- IAM policies must follow least privilege (no wildcard actions or resources)
- All new endpoints must have corresponding health checks

## Security
- No secrets in source code (use environment variables or Secrets Manager)
- No public S3 buckets unless explicitly documented
- Security groups must not allow 0.0.0.0/0 inbound on non-HTTP ports

## Reliability
- Synchronous service calls must have timeout configuration
- External dependencies must have circuit breakers or retry logic
- All async queues must have dead-letter queue configuration

## Observability
- All services must emit structured JSON logs with traceId
- New services must have CloudWatch alarms for latency and error rate
- X-Ray tracing must remain enabled on all ECS services
