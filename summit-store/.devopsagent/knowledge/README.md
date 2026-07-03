# Knowledge Items

Knowledge items provide contextual information that DevOps Agent uses to enrich investigations, chat responses, and prevention recommendations.

> **Note:** As of 2026, DevOps Agent uses **Skills** (`.devopsagent/skills/`) as the primary mechanism for injecting domain knowledge. The `summit-store-architecture` skill in this repo serves as both the architecture reference and knowledge base.

## How Knowledge Is Provided to DevOps Agent

| Method | Location | Purpose |
|--------|----------|---------|
| Skills (recommended) | `.devopsagent/skills/` | Structured instructions with frontmatter — agent loads them contextually |
| MCP Server tools | `mcp-server/src/tools/knowledge.mjs` | On-demand queries via `get_architecture`, `get_known_issues`, `get_design_decisions` |
| MCP Server tools | `mcp-server/src/tools/featureflags.mjs` | Feature flag state, audit logs, and coverage assessment |
| Custom Agent prompts | `.devopsagent/agents/` | Embedded in scheduled agent workflows |

## Skills Inventory

| Skill | Type | Purpose |
|-------|------|---------|
| `summit-store-architecture.md` | Generic | Architecture knowledge — service dependencies, DynamoDB constraints, known gaps |
| `circuit-breaker-playbook.md` | Incident Mitigation | Step-by-step guide for implementing pybreaker on payment-service |
| `feature-flag-containment.md` | Incident Mitigation | Playbook for using feature flag toggles as instant incident containment |
| `skip-scheduled-maintenance.md` | Incident Triage | Filters low-priority alarms during planned maintenance windows |
| `skip-known-flapping.md` | Incident Triage | Filters DynamoDB GSI throttle alarms during nightly batch job (03:00-04:30 UTC) |

## Custom Agents Inventory

| Agent | Schedule | Purpose |
|-------|----------|---------|
| `capacity-check.yaml` | Every 6 hours | Monitors DynamoDB GSI utilization, alerts at 80% of provisioned capacity |
| `security-posture.yaml` | Every 6 hours | Audits IAM roles, S3 buckets, security groups for violations |
| `log-anomaly.yaml` | Every 6 hours | Detects new error patterns by comparing 24h logs vs 7-day baseline |
| `cost-anomaly.yaml` | Daily at 08:00 UTC | Monitors AWS costs, detects spending anomalies vs 7-day baseline |

## MCP Server Tool Categories (31 tools)

| Category | Tools | Source |
|----------|-------|--------|
| Operations (5) | get_service_health, get_service_dependencies, get_runbook, get_chaos_status, trigger_chaos | `tools/operations.mjs` |
| Incidents (6) | get_open_incidents, get_incident_details, get_on_call_schedule, acknowledge_incident, get_incident_history, escalate_incident | `tools/incidents.mjs` |
| Knowledge (5) | get_architecture, get_sla_definitions, get_known_issues, get_design_decisions, get_team_contacts | `tools/knowledge.mjs` |
| Deployments (6) | list_deployments, get_deployment_details, get_deployment_diff, get_deployment_metrics, rollback_deployment, get_release_pipeline_status | `tools/deployments.mjs` |
| Monitoring (4) | get_cloudwatch_metrics, get_cost_summary, get_resource_utilization, detect_cost_anomalies | `tools/monitoring.mjs` |
| Feature Flags (5) | get_feature_flags, get_feature_flag_details, toggle_feature_flag, get_flag_audit_log, assess_flag_coverage | `tools/featureflags.mjs` |

## Key Facts (quick reference)

- 3 services: order-service (Node.js), payment-service (Python), inventory-service (Python)
- ECS Fargate in us-east-1, public subnets, internet-facing ALB + CloudFront
- DynamoDB table: summit-store-inventory, GSI: status-index (5 WCU/RCU, no auto-scaling)
- SQS queue: summit-store-orders, DLQ: summit-store-orders-dlq (no alarm)
- External dependency: payment gateway (httpbin.org mock), timeout controlled by GATEWAY_TIMEOUT_MS env var
- Feature flags: 5 flags configured (1 kill switch: payment-gateway-v2)
- CI/CD: GitHub Actions, rolling ECS deploy, no canary stage
- Monitoring: 3 CloudWatch alarms → SNS → Lambda → DevOps Agent webhook
- Custom agents: 4 running on schedules (capacity, security, logs, cost)
- Skills: 5 uploaded (architecture, circuit breaker, feature flag containment, 2 skip rules)
