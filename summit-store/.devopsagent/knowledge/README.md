# Knowledge Items

Knowledge items provide contextual information that DevOps Agent uses to enrich investigations, chat responses, and prevention recommendations.

> **Note:** As of 2026, DevOps Agent uses **Skills** (`.devopsagent/skills/`) as the primary mechanism for injecting domain knowledge. The `summit-store-architecture` skill in this repo serves as both the architecture reference and knowledge base.

## How Knowledge Is Provided to DevOps Agent

| Method | Location | Purpose |
|--------|----------|---------|
| Skills (recommended) | `.devopsagent/skills/` | Structured instructions with frontmatter — agent loads them contextually |
| MCP Server tools | `mcp-server/src/tools/knowledge.mjs` | On-demand queries via `get_architecture`, `get_known_issues`, `get_design_decisions` |
| Custom Agent prompts | `.devopsagent/agents/` | Embedded in scheduled agent workflows |

## Architecture Knowledge

The primary architecture knowledge is maintained in:
- **Skill:** `skills/summit-store-architecture.md` — loaded by all agent types during investigations and chat
- **MCP tools:** `get_architecture(scope)` — returns detailed component info on demand
- **MCP tools:** `get_design_decisions(topic)` — returns ADRs explaining design choices

## Key Facts (quick reference)

- 3 services: order-service (Node.js), payment-service (Python), inventory-service (Python)
- ECS Fargate in us-east-1, public subnets, internet-facing ALB
- DynamoDB table: summit-store-inventory, GSI: status-index (5 WCU/RCU, no auto-scaling)
- SQS queue: summit-store-orders, DLQ: summit-store-orders-dlq (no alarm)
- External dependency: payment gateway (httpbin.org mock), timeout controlled by GATEWAY_TIMEOUT_MS env var
- CI/CD: GitHub Actions, rolling ECS deploy, no canary stage
- Monitoring: 3 CloudWatch alarms → SNS → Lambda → DevOps Agent webhook
