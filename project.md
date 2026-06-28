 ````markdown
# AWS DevOps Agent Demo Project

## Purpose
Showcase AWS DevOps Agent capabilities, especially NY Summit 2026 features, at the EAMM TFC Summit. The demo project is a realistic microservices application deployed on AWS that you can break intentionally to trigger investigations, prevention cycles, and release management workflows.

---

## PART 1: Kiro Prompt (Project Creation)

Copy and paste this into Kiro to scaffold the demo project:

---

### Kiro Prompt

```
Create a microservices demo application called "summit-store" for showcasing AWS DevOps Agent. This is a simplified e-commerce backend with intentional architectural patterns that demonstrate incident response, prevention, and release management.

ARCHITECTURE:
- 3 microservices deployed on ECS Fargate:
  1. order-service (Node.js/Express) — accepts orders, calls payment-service and inventory-service
  2. payment-service (Python/Flask) — processes payments, calls an external mock payment gateway
  3. inventory-service (Python/Flask) — manages stock levels, uses DynamoDB

- Infrastructure:
  - ALB in front of order-service
  - DynamoDB table for inventory (with a GSI that will be the throttling bottleneck)
  - SQS queue between order-service and inventory-service for async updates
  - CloudWatch alarms on: p99 latency > 500ms, error rate > 5%, DynamoDB throttling
  - Lambda function for order notifications (will be misconfigured for demo)

- CI/CD:
  - GitHub repository with 3 service directories
  - GitHub Actions workflow for each service (build, test, deploy to ECS)
  - No canary deployment stage (intentional gap for prevention recommendation)

- Observability:
  - CloudWatch metrics, logs, and X-Ray tracing enabled on all services
  - Application Signals configured for service-level monitoring
  - Structured JSON logging with correlation IDs

INTENTIONAL WEAKNESSES (for DevOps Agent to discover):
1. payment-service has NO circuit breaker when calling the external gateway — cascade failure risk
2. order-service has no retry logic on payment-service calls — single failure = order failure
3. inventory-service DynamoDB GSI has under-provisioned capacity — will throttle under load
4. Lambda notification function has a misconfigured timeout (3s) that's too short for SES calls
5. No canary deployments in the CI/CD pipeline
6. Missing CloudWatch alarm on SQS dead-letter queue depth
7. Security: one IAM role has overly broad permissions (s3:* instead of scoped)

CODE REQUIREMENTS:
- Include a /chaos endpoint on order-service that introduces latency (for triggering incidents)
- Include a /health endpoint on each service
- Include load testing script (k6 or Artillery) that generates realistic traffic
- All services log structured JSON with: timestamp, service, traceId, level, message
- payment-service should have a feature flag (env var GATEWAY_TIMEOUT_MS) that can be reduced to trigger failures

INFRASTRUCTURE AS CODE:
- CDK (TypeScript) for all infrastructure
- Separate stacks: NetworkStack, DatabaseStack, ServicesStack, MonitoringStack
- CloudFormation outputs for ALB URL, service ARNs, DynamoDB table name

FILE STRUCTURE:
summit-store/
├── infrastructure/         (CDK stacks)
├── services/
│   ├── order-service/      (Node.js)
│   ├── payment-service/    (Python)
│   └── inventory-service/  (Python)
├── .github/workflows/      (CI/CD)
├── loadtest/               (k6 scripts)
├── scripts/
│   ├── deploy.sh
│   ├── trigger-incident.sh (calls /chaos endpoint)
│   └── generate-load.sh
└── README.md

IMPORTANT:
- Keep each service under 200 lines of application code
- Make the intentional weaknesses realistic but discoverable
- Add comments marking where improvements should go (DO NOT implement them — DevOps Agent should recommend them)
- Include a .devopsagent/ directory with:
  - skills/circuit-breaker-playbook.md (a Custom Skill example)
  - knowledge/architecture-rules.md (Knowledge Items content)
```

---

## PART 2: DevOps Agent Setup Guide

### Step 1: Create Agent Space

1. Go to AWS DevOps Agent console
2. Create a new Agent Space named "summit-store-demo"
3. Configure IAM role with access to your demo AWS account
4. Add secondary account access if using multi-account setup

### Step 2: Connect Integrations

| Integration | Purpose | Configuration |
|---|---|---|
| GitHub | Code indexing + deployment correlation | Connect your summit-store repository |
| CloudWatch | Native metrics, logs, traces | Auto-configured via IAM role |
| Slack | Real-time investigation updates | Create #summit-store-incidents channel |
| PagerDuty (optional) | Webhook trigger demo | Create a test service + escalation policy |

### Step 3: Enable Code Indexing

1. In Agent Space settings, connect the GitHub repository
2. Wait for initial indexing to complete (shows in the Topology Viewer)
3. Verify: ask in On-Demand Chat "What services are in my repository?"

### Step 4: Upload Custom Skill

Upload the circuit-breaker-playbook.md as a Custom Skill:
- Target: Mitigation Agent
- Content: step-by-step circuit breaker implementation procedure for the payment-service

### Step 5: Add Knowledge Items

Add architecture rules as Knowledge Items:
- "order-service depends on payment-service synchronously and inventory-service asynchronously via SQS"
- "DynamoDB GSI on inventory table is capacity-constrained by design — scale target is 100 WCU"
- "Payment gateway external dependency has 99.5% SLA, timeout should be 5000ms minimum"

---

## PART 3: Demo Scenarios (in presentation order)

### DEMO 1: Topology Viewer (2 min)
**What to show:** Open the Topology Viewer in the Operator web app.
- System View: show order-service → payment-service → external gateway dependency chain
- Container View: show ECS tasks and their resource allocation
- Resource View: show individual resources (DynamoDB table, Lambda function, ALB)
- Point out: "This was built automatically from my infrastructure, code, and observability. I didn't draw this."

### DEMO 2: Trigger an Incident + Investigation (5 min)
**What to do:**
1. Run the load test script to generate traffic
2. Reduce GATEWAY_TIMEOUT_MS on payment-service to 100ms (simulates external gateway slowdown)
3. Watch the CloudWatch alarm fire
4. Show the investigation starting automatically in the web app

**What to show:**
- Real-time investigation journal updating
- Parallel hypotheses: "deployment-related?" (low confidence) vs "external dependency timeout?" (high confidence)
- Root cause identified: payment-service timeout misconfiguration correlating with the env var change
- Mitigation plan: structured 5-step format with specific rollback instructions ("set GATEWAY_TIMEOUT_MS back to 5000")
- Code-level correlation: link to the specific commit that changed the env var

### DEMO 3: Triage Agent — Duplicate Detection (2 min)
**What to do:**
1. While the payment-service is still degraded, trigger a second alarm (e.g., order-service error rate alarm)
2. Show the Triage Agent detecting this as a duplicate
3. Show the LINKED status on the second investigation — it didn't start a new investigation

**What to show:**
- Two alarms fired, one investigation running
- Second alarm linked to the primary investigation
- "How many times has your team investigated the same root cause from 5 different alerts?"

### DEMO 4: Prevention Recommendations (3 min)
**What to do:**
1. After the investigation completes, wait for (or manually trigger) a prevention evaluation
2. Show the recommendations dashboard

**What to show:**
- Observability: "Add alarm on SQS DLQ depth" (the missing alarm)
- Code Resilience: "Add circuit breaker to payment-service when calling external gateway"
- Testing: "Add canary deployment stage to CI/CD pipeline"
- Infrastructure: "Increase DynamoDB GSI capacity or enable auto-scaling"
- Point out: "These aren't generic. It's recommending a circuit breaker specifically for payment-service because it investigated the cascade failure."

### DEMO 5: On-Demand Chat / Power Chat (2 min)
**What to do:** Open the chat interface and ask questions.

**Queries to demonstrate:**
- "What services depend on payment-service?" (shows topology understanding)
- "Were there any deployments in the last 24 hours?" (deployment correlation)
- "Show me the error rate trend for order-service this week" (custom chart generation)
- "What would a circuit breaker look like for our payment-service?" (architecture-aware answer using Knowledge Items)

### DEMO 6: Release Manager — PRR Gate (3 min)
**What to do:**
1. Create a PR in the summit-store repo that introduces a bad change:
   - Remove error handling from order-service
   - Add a new S3 bucket without encryption
2. Trigger a Release Readiness Review from the web app or Kiro

**What to show:**
- PRR Gate findings: "This change removes error handling — BLOCK"
- Security finding: "S3 bucket created without encryption — violates standards"
- Cross-repo dependency analysis: "This change affects downstream inventory-service consumer"
- Show the structured report: BLOCK / Proceed with Caution / Safe to Release

### DEMO 7: Autonomous Release Testing (3 min)
**What to do:**
1. Create a PR with a functional change (e.g., new discount logic in order-service)
2. Trigger Autonomous Release Testing

**What to show:**
- Agent reasons about what the change does
- Generates tailored tests: "Order with discount applied correctly", "Discount boundary conditions", "Integration with payment-service still works"
- Tests run in ephemeral environment
- Structured artifacts: metrics, logs, traces, execution summary

### DEMO 8: Kiro Integration (2 min)
**What to do:** Open Kiro with the summit-store project.

**What to show:**
- From Kiro, ask: "Run a release readiness review on my current branch"
- Show DevOps Agent responding directly in the IDE
- Ask: "What caused the last incident on payment-service?"
- Show investigation context returned without leaving the editor
- Point out: "No context switching. Development and operations in one workflow."

### DEMO 9: Custom Agents + Scheduled Workflows (2 min)
**What to do:**
1. Show a Custom Agent you've pre-configured:
   - Trigger: Schedule (every 6 hours)
   - Workflow: Check DynamoDB capacity → If approaching limits → Post to Slack
2. Show the execution history

**What to show:**
- DAG workflow definition
- Execution history with timestamps
- Slack notification output
- "This runs while I sleep. Cron jobs with AI reasoning."

### DEMO 10: Remote MCP Server (1 min)
**What to do:** Show the Personal Access Token generation in the Operator app.

**What to show:**
- How external tools authenticate to DevOps Agent as an MCP server
- Explain: "Any MCP-compatible tool in your ecosystem can now invoke DevOps Agent's full capabilities — investigations, topology queries, prevention recommendations — all through a standard protocol."

---

## PART 4: Demo Preparation Checklist

- [ ] Deploy summit-store to your AWS account (CDK deploy)
- [ ] Create Agent Space and connect all integrations
- [ ] Run load test for 24+ hours to build baseline topology
- [ ] Complete at least one full investigation cycle (so prevention recommendations exist)
- [ ] Upload Custom Skill (circuit breaker playbook)
- [ ] Add Knowledge Items (architecture rules)
- [ ] Create the "bad PR" in a branch (for Release Manager demo)
- [ ] Create the "functional change PR" in another branch (for Release Testing demo)
- [ ] Configure one Custom Agent with a scheduled workflow
- [ ] Generate a Personal Access Token for the Remote MCP demo
- [ ] Test the Kiro integration end-to-end
- [ ] Verify Slack channel receives investigation updates
- [ ] Do a full dry-run of all 10 demos in sequence
- [ ] Prepare fallback screenshots/recordings in case of connectivity issues

---

## PART 5: Timing Guide (90-min session)

| Segment | Duration | Content |
|---|---|---|
| Slides 1-12 | 15 min | Intro + Core Architecture |
| DEMO 1: Topology | 2 min | Live topology viewer |
| Slides 13-23 | 12 min | Incident Response + Customer Results |
| DEMO 2: Investigation | 5 min | Live incident trigger + investigation |
| DEMO 3: Triage | 2 min | Duplicate detection |
| Slides 24-28 | 8 min | Prevention |
| DEMO 4: Prevention | 3 min | Recommendations dashboard |
| Slides 29-33 | 6 min | On-Demand SRE |
| DEMO 5: Power Chat | 2 min | Live queries |
| Slides 34-38 | 6 min | Intelligence & Skills |
| Slides 39-47 | 12 min | New Features |
| DEMO 6: Release Manager | 3 min | PRR Gate |
| DEMO 7: Release Testing | 3 min | Autonomous tests |
| DEMO 8: Kiro | 2 min | IDE integration |
| DEMO 9: Custom Agents | 2 min | Scheduled workflows |
| DEMO 10: Remote MCP | 1 min | Token generation |
| Slides 48-58 | 5 min | Integrations + Security + Closing |
| **Total** | **~90 min** | |

---

## Notes

- Pre-trigger the investigation 5 minutes before the demo segment so it's mid-investigation when you show it (avoids waiting on stage)
- Have the prevention recommendations pre-generated from a previous investigation cycle (don't rely on real-time generation during demo)
- The "bad PR" and "functional PR" should be pre-created in branches, ready to trigger reviews on demand
- Keep a terminal with the load test running throughout — it populates real-time metrics that make the topology and On-Demand Chat more impressive
````