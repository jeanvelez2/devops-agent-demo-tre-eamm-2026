# summit-store

Microservices demo application for showcasing AWS DevOps Agent capabilities at the EAMM TFC Summit 2026.

## Architecture

```
Client → CloudFront (WAF) → ALB → order-service (Node.js)
                                      ├── payment-service (Python) → External Gateway
                                      └── SQS → inventory-service (Python) → DynamoDB

CloudWatch Alarms → SNS → Lambda → DevOps Agent Webhook
                 → EventBridge ────→ (same Lambda)

Custom MCP Server (26 tools) → API Gateway → Lambda
```

## Services

| Service | Runtime | Purpose |
|---------|---------|---------|
| order-service | Node.js 22 / Express | Accepts orders, orchestrates payment + inventory |
| payment-service | Python 3.12 / Flask | Processes payments via external gateway |
| inventory-service | Python 3.12 / Flask | Manages stock levels in DynamoDB |

## Infrastructure Stacks (CDK)

| Stack | Resources |
|-------|-----------|
| SummitStoreNetwork | VPC, public subnets |
| SummitStoreDatabase | DynamoDB, SQS, DLQ |
| SummitStoreServices | ECS Fargate cluster, ALB, 3 services, Lambda notification |
| SummitStoreMonitoring | CloudWatch alarms, SNS topic |
| SummitStoreCdn | CloudFront distribution + WAF |
| SummitStoreDevOpsAgentTrigger | Lambda webhook trigger, SNS subscription, EventBridge rule, Secrets Manager |
| SummitStoreMcpServer | API Gateway + Lambda hosting custom MCP server (26 tools) |

## DevOps Agent Integration

| Integration | Status |
|-------------|--------|
| AWS CloudWatch (native) | Connected |
| GitHub (<GITHUB_OWNER>/<REPO_NAME>) | Connected (READ_WRITE) |
| Slack (#summit-store-incidents) | Connected |
| Webhook (HMAC) | Configured — alarms auto-trigger investigations |
| Custom MCP Server (summit-store-ops, 26 tools) | Connected via SigV4 |
| Architecture Skill | Uploaded (Generic) |
| Circuit Breaker Skill | Uploaded (Incident Mitigation) |
| Skip Scheduled Maintenance Skill | Uploaded (Incident Triage) |
| Custom Agents (3) | Running on 6-hour schedules |
| Release Readiness Review | Enabled |
| Release Testing (API) | Test profile configured |

## Endpoints

| Endpoint | URL | How to find |
|----------|-----|-------------|
| CloudFront (HTTPS) | `<CLOUDFRONT_URL>` | CDK output `SummitStoreCdn.CloudFrontUrl` |
| ALB (HTTP) | `<ALB_URL>` | CDK output `SummitStoreServices.AlbUrl` |
| MCP Server | `<MCP_ENDPOINT>` | CDK output `SummitStoreMcpServer.McpEndpointUrl` |

## Intentional Weaknesses (for DevOps Agent to discover)

1. No circuit breaker on payment-service external gateway calls
2. No retry logic on order-service → payment-service calls
3. Under-provisioned DynamoDB GSI (status-index at 5 RCU/WCU)
4. Lambda notification timeout too short (3s for SES calls)
5. No canary deployments in CI/CD pipeline
6. Missing CloudWatch alarm on SQS dead-letter queue depth
7. Overly broad IAM role on order-service (s3:* on *)

## Quick Start

```bash
# Deploy all infrastructure
cd infrastructure && npx cdk deploy --all --profile $AWS_PROFILE

# Generate load
./scripts/generate-load.sh

# Trigger incident (reduce gateway timeout)
./scripts/trigger-incident.sh
```

## Project Structure

```
summit-store/
├── infrastructure/           CDK stacks (TypeScript)
│   ├── lib/                  Stack definitions
│   └── lambda/               Lambda functions (webhook trigger)
├── services/
│   ├── order-service/        Node.js / Express
│   ├── payment-service/      Python / Flask
│   └── inventory-service/    Python / Flask
├── mcp-server/               Custom MCP server (26 tools)
│   └── src/
│       ├── index.mjs         stdio entry point
│       ├── lambda.mjs        API Gateway Lambda handler
│       └── tools/            Tool implementations (5 categories)
├── .github/workflows/        CI/CD (GitHub Actions)
├── loadtest/                 k6 scripts
├── scripts/                  Utility scripts
├── .devopsagent/             Skills, knowledge, standards, agents
│   └── skills/
│       ├── summit-store-architecture.md
│       ├── circuit-breaker-playbook.md
│       └── skip-scheduled-maintenance.md
```
