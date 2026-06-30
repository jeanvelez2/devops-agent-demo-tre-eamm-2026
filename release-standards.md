# Summit Store Release Standards

## Security
- All S3 buckets must have server-side encryption enabled (AES-256 or KMS)
- IAM roles must follow least privilege — no wildcard (*) actions on production resources
- Secrets must not be hardcoded — use Secrets Manager or environment variables from Parameter Store

## Code Quality
- All service endpoints must have error handling (try/catch or equivalent)
- External service calls must have timeout configuration >= 5000ms
- Retry logic required on synchronous inter-service calls

## Deployment
- All deployments must include a rollback mechanism
- Health check endpoints required on every service before traffic routing
- No direct pushes to main — all changes via pull request

## Observability
- CloudWatch alarms required on: error rate > 5%, p99 latency > 500ms
- Dead-letter queues must have a depth alarm configured
- Structured JSON logging with correlation IDs on all services
