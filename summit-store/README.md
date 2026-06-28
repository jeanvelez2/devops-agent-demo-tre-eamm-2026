# summit-store

Microservices demo application for showcasing AWS DevOps Agent capabilities at the EAMM TFC Summit.

## Architecture

```
Client → CloudFront (WAF) → ALB (internal) → order-service
                                                  ├── payment-service → External Gateway
                                                  └── SQS → inventory-service → DynamoDB
```

3 microservices on ECS Fargate:
- **order-service** (Node.js 22) — accepts orders, orchestrates payment + inventory
- **payment-service** (Python 3.12) — processes payments via external gateway
- **inventory-service** (Python 3.12) — manages stock levels in DynamoDB

## Quick Start

```bash
# Deploy infrastructure
./scripts/deploy.sh

# Generate load
./scripts/generate-load.sh <CLOUDFRONT_URL> <INVENTORY_SERVICE_URL>

# Trigger incident
./scripts/trigger-incident.sh <CLOUDFRONT_URL>
```

## Intentional Weaknesses (for DevOps Agent to discover)

1. **No circuit breaker** — payment-service has no protection against gateway failures
2. **No retry logic** — order-service single failure = order failure
3. **Under-provisioned GSI** — DynamoDB status-index at 5 RCU/WCU throttles under load
4. **Lambda timeout** — 3s too short for SES calls
5. **No canary deployments** — CI/CD uses rolling updates only
6. **Missing DLQ alarm** — no CloudWatch alarm on SQS dead-letter queue depth
7. **Overly broad IAM** — order-service role has s3:* on *

## Demo Preparation

### Prerequisites
- AWS account with CDK bootstrap completed in us-east-1
- k6 installed for load testing
- Docker installed for building container images

### Pre-Demo Steps

1. **Deploy**: `./scripts/deploy.sh`
2. **Run load test for 24+ hours** to build baseline topology in DevOps Agent
3. **Complete one full investigation cycle** (trigger incident → let DevOps Agent investigate → resolve) so prevention recommendations exist
4. **Create demo branches**:
   ```bash
   # demo/bad-change — for Release Manager PRR Gate demo
   git checkout -b demo/bad-change
   # Remove error handling from order-service, add unencrypted S3 bucket
   git push origin demo/bad-change

   # demo/add-discount — for Autonomous Release Testing demo
   git checkout main
   git checkout -b demo/add-discount
   # Add discount logic to order-service
   git push origin demo/add-discount
   ```
5. **Configure Kiro integration** — connect Kiro to DevOps Agent via Remote MCP:
   - Create an Agent Space in [DevOps Agent console](https://us-east-1.console.aws.amazon.com/devops-agent/)
   - Generate Personal Access Token: Agent Space → Settings → Access Tokens → Create (scope: `agent:operate`)
   - Set environment variable: `export DEVOPS_AGENT_TOKEN=aidevops_v1_...`
   - The workspace MCP config at `.kiro/settings/mcp.json` needs:
     ```json
     {
       "mcpServers": {
         "power-aws-devops-agent-aws-devops-agent": {
           "url": "https://connect.aidevops.us-east-1.api.aws/mcp",
           "headers": { "Authorization": "Bearer ${DEVOPS_AGENT_TOKEN}" },
           "timeout": 120000
         },
         "power-aws-devops-agent-aws-devops-agent-sigv4": {
           "command": "uvx",
           "timeout": 120000,
           "args": ["mcp-proxy-for-aws@latest", "https://connect.aidevops.us-east-1.api.aws/mcp", "--service", "aidevops", "--region", "us-east-1"],
           "env": { "AWS_PROFILE": "AWSAdministratorAccess-223057881262" }
         }
       }
     }
     ```
   - Restart Kiro after setting the token and config
6. **Upload Custom Skill**: circuit-breaker-playbook.md to Agent Space
7. **Add Knowledge Items**: architecture-rules.md content to Agent Space
8. **Connect integrations**: GitHub, CloudWatch, Slack (#summit-store-incidents)
9. **Verify**: Ask in On-Demand Chat "What services are in my repository?"

### Demo Timing Note
- Pre-trigger the investigation 5 minutes before the demo segment
- Keep load test running throughout the presentation for real-time metrics
- Prevention recommendations should be pre-generated from a previous investigation cycle

## Project Structure

```
summit-store/
├── infrastructure/         CDK stacks (TypeScript)
├── services/
│   ├── order-service/      Node.js 22 / Express
│   ├── payment-service/    Python 3.12 / Flask
│   └── inventory-service/  Python 3.12 / Flask
├── .github/workflows/      CI/CD (GitHub Actions)
├── loadtest/               k6 scripts
├── scripts/                Utility scripts
├── .devopsagent/           DevOps Agent configuration
│   ├── skills/             Custom Skills
│   ├── knowledge/          Knowledge Items
│   ├── standards/          Release Standards
│   └── agents/             Custom Agent definitions
└── README.md
```
