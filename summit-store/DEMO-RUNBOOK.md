# Demo Runbook — Step by Step

## Environment Variables

Set these before starting. All values come from CDK stack outputs after deployment.

```bash
# Your AWS CLI profile
export AWS_PROFILE=<your-sso-profile-name>

# From CDK output: SummitStoreCdn.CloudFrontUrl
export CLOUDFRONT_URL=<your-cloudfront-domain>

# From CDK output: SummitStoreMcpServer.McpEndpointUrl
export MCP_ENDPOINT=<your-api-gateway-url>/mcp

# Your GitHub repo (owner/name)
export GITHUB_REPO=<owner>/<repo-name>
```

**How to retrieve CDK outputs:**
```bash
cd infrastructure
AWS_PROFILE=$AWS_PROFILE npx cdk ls  # verify stacks
aws cloudformation describe-stacks --region us-east-1 \
  --query "Stacks[].Outputs[].[OutputKey,OutputValue]" --output table
```

---

## Overview

This runbook walks through the complete demo execution from setup to teardown. Follow it sequentially on demo day.

---

## PHASE 1: Pre-Demo Setup (T-30 minutes)

### 1.1 Verify Services Are Running

```bash
# Health check
curl -s https://$CLOUDFRONT_URL/health
# Expected: {"status":"ok","service":"order-service"}

# Test an order
curl -s -X POST https://$CLOUDFRONT_URL/orders \
  -H "Content-Type: application/json" \
  -d '{"itemId":"ITEM-001","quantity":1,"paymentMethod":"credit_card"}'
# Expected: {"orderId":"...","status":"completed"}
```

### 1.2 Start Load Test

```bash
cd summit-store/scripts
./generate-load.sh https://$CLOUDFRONT_URL
```

Or if k6 isn't installed locally, use curl in a loop:
```bash
while true; do
  curl -s -X POST https://$CLOUDFRONT_URL/orders \
    -H "Content-Type: application/json" \
    -d '{"itemId":"ITEM-001","quantity":1,"paymentMethod":"credit_card"}' &
  sleep 1
done
```

**Keep this running throughout the demo** — it populates real-time metrics in the Topology Viewer and CloudWatch dashboards.

### 1.3 Verify DevOps Agent Web App

1. Open: AWS Console → DevOps Agent → Agent Space → Web app tab → Operator access
2. Confirm you can see the Topology Viewer with summit-store services
3. Confirm the Slack channel `#summit-store-incidents` is receiving messages

### 1.4 Open Browser Tabs

Have these ready:
- DevOps Agent Operator Web App (Topology tab)
- DevOps Agent Operator Web App (Chat tab)
- DevOps Agent Operator Web App (Release Manager tab)
- GitHub PR #1: `https://github.com/<GITHUB_OWNER>/<REPO_NAME>/pull/1`
- CloudWatch Alarms: https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#alarmsV2:
- Terminal (for triggering incident)
- Kiro IDE with summit-store workspace open

---

## PHASE 2: Demo Execution

### DEMO 1: Topology Viewer (2 min)

**What you do:**
1. Switch to the DevOps Agent Web App → Topology tab
2. Click through the views: System → Container → Resource

**What you say:**
- "This topology was built automatically by DevOps Agent by analyzing my CloudFormation stacks, ECS services, and observability data"
- "I can see order-service depends on payment-service synchronously, and inventory-service async via SQS"
- Point to the external gateway dependency: "This is where our incident will come from"

---

### DEMO 2: Trigger Incident + Investigation (5 min)

**What you do:**

**Step 1 — Trigger (in terminal):**
```bash
curl -X POST https://$CLOUDFRONT_URL/chaos \
  -H "Content-Type: application/json" \
  -d '{"delayMs": 3000}'
```

**Step 2 — Wait 2-3 minutes** for p99 latency to exceed 500ms threshold.

**Step 3 — Watch the CloudWatch alarm fire** (show the Alarms console tab).

**Step 4 — Switch to DevOps Agent Web App → Incidents tab:**
- A new investigation appears automatically: "CloudWatch Alarm: order-service-p99-latency"
- Click into it to see the real-time journal

**What you show in the web app:**
- Investigation journal updating in real-time
- Hypotheses being evaluated (deployment? dependency? resource exhaustion?)
- Metrics being queried (CloudWatch latency, error rates)
- MCP tools being called (get_service_health, get_deployment_diff from your custom server)
- Root cause identified with confidence level
- Mitigation plan: "Disable chaos endpoint" or "rollback deployment"

**What you say:**
- "The alarm fired, the webhook triggered, and DevOps Agent started investigating automatically — I didn't click anything"
- "It's checking deployments, querying my custom MCP server for service health, and looking at X-Ray traces simultaneously"
- "Root cause: the chaos injection is adding 3000ms latency, exceeding our 500ms p99 alarm threshold"

---

### DEMO 3: Triage — Duplicate Detection (2 min)

**What you do:**
- Stay in the Incidents tab
- Point to the second alarm (error-rate) that also fired
- Show that it was triaged and linked to the primary investigation

**What you say:**
- "Two alarms fired from the same underlying cause — latency AND error rate"
- "DevOps Agent's Triage Agent detected the second as a duplicate and linked it, not investigated separately"
- "How many times has your team investigated the same root cause from 5 different alerts?"

---

### DEMO 4: Prevention Recommendations (3 min)

**What you do:**
1. In the web app, navigate to the Prevention/Recommendations section
2. Show the recommendations generated from prior investigations

**What you show:**
- Observability: "Add alarm on SQS DLQ depth — failed inventory reservations go unnoticed"
- Resilience: "Add circuit breaker to payment-service — cascade failure risk is HIGH"
- Deployment: "Add canary deployment stage — bad configs go to 100% immediately"
- Infrastructure: "Enable auto-scaling on DynamoDB GSI — throttles under load"

**What you say:**
- "These aren't from a static rules engine — they came from analyzing actual incidents"
- "It recommends a circuit breaker specifically for payment-service because it investigated the cascade failure and identified the gap"
- "Each recommendation includes implementation specs I can hand to my coding agent"

---

### DEMO 5: On-Demand Chat (2 min)

**What you do:**
Switch to the Chat tab and ask these questions:

**Prompt 1 — Dependencies:**
```
What services depend on payment-service and what happens when it degrades?
```

**Prompt 2 — Cost (uses your MCP tools):**
```
Analyze costs for summit-store. Are there anomalies or optimization opportunities?
```

**Prompt 3 — Architecture-aware answer:**
```
What would a circuit breaker implementation look like for payment-service? Use our architecture knowledge.
```

**What you say:**
- "It's not just querying CloudWatch — it's calling my custom MCP server tools to get deployment context, incident history, and architecture knowledge"
- "The circuit breaker answer references our specific stack (Python, Flask, pybreaker) because it knows our architecture from the skill I uploaded"

---

### DEMO 6: Release Readiness Review (3 min)

**What you do:**

**In DevOps Agent chat:**
```
Run a release readiness review on PR #1 in my connected GitHub repository.
```

**Or:** Release Manager → find PR #1 → Start Review

**Wait ~2-3 minutes for results.**

**What you show:**
- Verdict: BLOCK
- Finding 1: "Removes SQS inventory queuing — orders complete but stock never reserved (silent data loss)"
- Finding 2: "S3 bucket created without encryption — violates security standards"
- Finding 3: "Error handling removed from payment flow"
- Cross-repo dependency analysis

**What you say:**
- "It didn't just find a missing encryption flag — it understood that removing the SQS step breaks the inventory reservation flow"
- "That's architectural understanding, not pattern matching. It knows order-service → SQS → inventory-service is the async data path"
- "Verdict is BLOCK — this would not ship"

---

### DEMO 7: Autonomous Release Testing (3 min)

**What you do:**

**In DevOps Agent chat:**
```
Run release testing on my summit-store-api test profile. Verify the order creation flow and payment processing.
```

**Or:** Release Manager → Test profiles → summit-store-api → Start testing

**What you show:**
- Test plan generated from the OpenAPI spec
- Tests executing against the live CloudFront endpoint
- Results: test cases, pass/fail, reproduction steps
- Failed tests showing specific errors with HTTP responses

**What you say:**
- "I uploaded my OpenAPI spec and pointed it at my CloudFront URL — it generated and ran these tests automatically"
- "No test code written. It figured out the endpoints, valid/invalid payloads, and edge cases from the spec"
- "In CI/CD, this runs as a GitHub Action after every deploy"

---

### DEMO 8: Kiro Integration (2 min)

**What you do:**
Switch to Kiro IDE.

**Prompt 1:**
```
What caused the last incident on payment-service?
```

**Prompt 2:**
```
What are the known architectural weaknesses in summit-store and what should I fix first?
```

**What you say:**
- "Same DevOps Agent, accessed from my IDE — no context switching"
- "I can investigate incidents, query architecture, and run release reviews without leaving my editor"
- "Development and operations in one workflow"

---

### DEMO 9: Custom Agents (2 min)

**What you do:**
1. Show Goals/Custom Agents in the web app
2. Click into a recent execution to show results

**In chat:**
```
What did the last custom agent execution find?
```

**What you show:**
- 3 agents running on 6-hour schedules
- Execution history with timestamps
- Cost monitoring results (now working with CloudWatch metrics via MCP)

**What you say:**
- "These run autonomously every 6 hours — cost monitoring, capacity checks, security posture"
- "Cron jobs with AI reasoning. They produce recommendations and post to Slack"

---

### DEMO 10: Remote MCP Server (1 min)

**What you do:**
1. Show Capabilities tab → MCP Servers → summit-store-ops
2. Show the 26 tools listed

**In chat:**
```
Use the summit-store-ops tools to get the deployment diff for deploy-2026-0628-001 and explain what went wrong.
```

**What you show:**
- The tool being called in the investigation journal
- Rich response with code diff, risk assessment, and configuration changes

**What you say:**
- "I built this MCP server in an afternoon — 26 tools across operations, incidents, architecture, deployments, and cost monitoring"
- "Any internal system your team uses can be exposed as an MCP server"
- "The agent discovers tools automatically and uses them during investigations"

---

## PHASE 3: Cleanup (after demo)

```bash
# Disable chaos
curl -X DELETE https://$CLOUDFRONT_URL/chaos

# Stop load test (Ctrl+C in the terminal running it)

# Reset alarm state
aws cloudwatch set-alarm-state \
  --alarm-name order-service-p99-latency \
  --state-value OK \
  --state-reason "Demo complete" \
  --region us-east-1 \
  --profile $AWS_PROFILE
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Alarm doesn't fire | Check load test is running. Lower chaos delay to 1000ms if using `/chaos` endpoint |
| Investigation doesn't start | Check Lambda logs: `aws logs tail /aws/lambda/summit-store-devops-agent-trigger --follow` |
| MCP tools not called | Verify tools are in the allowlist (Capabilities → MCP Servers → summit-store) |
| Release Review fails | Trigger from web app UI instead of API. Check GitHub App permissions |
| Services unhealthy | Verify ECS tasks running: `aws ecs list-tasks --cluster summit-store` |
| Kiro can't connect | Re-login: `aws sso login --profile $AWS_PROFILE`, restart Kiro |

---

## Key Metrics for Success

During the demo, these should be visible:
- **order-service p99**: 500ms+ (when chaos enabled) → <50ms (when disabled)
- **error rate**: 5%+ (when chaos causes timeouts) → <0.5% (normal)
- **CloudWatch alarms**: transition to ALARM state within 2 min of chaos
- **Investigation start**: within 30s of alarm firing (webhook path)
- **MCP tool calls**: visible in investigation journal
