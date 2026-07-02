# Demo Prompts — AWS DevOps Agent at EAMM TFC Summit 2026

## Pre-Demo Checklist (30 min before)

- [ ] Start load test: `./scripts/generate-load.sh`
- [ ] Verify services healthy: `curl https://$CLOUDFRONT_URL/health`
- [ ] Confirm DevOps Agent web app is accessible
- [ ] Have PR #1 open in browser tab (`https://github.com/<GITHUB_OWNER>/<REPO_NAME>/pull/1`)
- [ ] Have Kiro open with the summit-store workspace

---

## DEMO 1: Topology Viewer (2 min)

**Action:** Open the Topology Viewer in the DevOps Agent Operator Web App.

**Talking points:**
- System View: order-service → payment-service → external gateway dependency chain
- Resource View: DynamoDB table, Lambda function, ALB, SQS queues
- "This was built automatically from infrastructure, code, and observability — I didn't draw this."

---

## DEMO 2: Trigger Incident + Investigation (5 min)

**Action:** Trigger the incident live on stage.

**Terminal command:**
```bash
# Reduce payment gateway timeout to cause failures
aws ecs update-service --cluster summit-store --service payment-service \
  --force-new-deployment \
  --task-definition payment-service:14 \
  --region us-east-1
```

**Or use the chaos endpoint (faster for demo):**
```bash
# This simulates the latency spike from order-service side
curl -X POST https://$CLOUDFRONT_URL/chaos \
  -H "Content-Type: application/json" \
  -d '{"delayMs": 3000}'
```

**Wait for alarm → investigation starts automatically (webhook triggers it)**

**Show in web app:**
- Real-time investigation journal updating
- Parallel hypotheses being evaluated
- Root cause identified: deployment/config change correlated with timeout spike
- Mitigation plan with specific rollback steps

---

## DEMO 3: Triage Agent — Duplicate Detection (2 min)

**Talking point:** "Two alarms fired from the same root cause — p99 latency AND error rate. DevOps Agent's Triage Agent detected the second as a duplicate and linked it to the primary investigation. One investigation, not two."

**Show in web app:**
- Two alarm events received
- One investigation running, second marked as LINKED
- "How many times has your team investigated the same root cause from 5 different alerts?"

---

## DEMO 4: Prevention Recommendations (3 min)

**Action:** Navigate to Prevention/Recommendations in the web app.

**Show:**
- Observability: "Add alarm on SQS DLQ depth"
- Code Resilience: "Add circuit breaker to payment-service"
- Testing: "Add canary deployment stage to CI/CD"
- Infrastructure: "Increase DynamoDB GSI capacity or enable auto-scaling"

**Talking point:** "These aren't generic. It's recommending a circuit breaker specifically for payment-service because it investigated the cascade failure and knows that's the gap."

---

## DEMO 5: On-Demand Chat / Power Chat (2 min)

**Prompts to use in DevOps Agent chat:**

### Architecture & Dependencies
```
What services depend on payment-service and what happens when it degrades?
```

### Deployment Correlation
```
Show me recent deployments and check if any correlate with the current incident.
```

### Cost Analysis (uses MCP tools)
```
Run a cost analysis on summit-store. Are there any anomalies or optimization opportunities?
```

### Custom Chart
```
Show me the error rate trend for order-service over the last 7 days.
```

### Architecture-Aware Answer (uses Knowledge Skill)
```
What would a circuit breaker look like for our payment-service? Include implementation steps specific to our architecture.
```

---

## DEMO 6: Release Manager — PRR Gate (3 min)

**Action:** Trigger Release Readiness Review on PR #1.

**In DevOps Agent chat:**
```
Run a release readiness review on PR #1 in my connected GitHub repository.
```

**Or from the web app:** Release Manager → find PR #1 → Start Review

**Expected findings:**
- BLOCK: "Removes SQS inventory queuing — orders will complete but stock will never be reserved (silent data loss)"
- BLOCK: "S3 bucket created without server-side encryption — violates security standards"
- WARNING: "Error handling removed from payment flow — any payment failure will crash the handler"

**Talking point:** "It didn't just find a missing encryption flag. It understood that removing the SQS step breaks the inventory reservation flow — that's architectural understanding, not pattern matching."

---

## DEMO 7: Autonomous Release Testing (3 min)

**Action:** Trigger from the web app or chat.

**In DevOps Agent chat:**
```
Run release testing on my summit-store-api test profile. Focus on the order creation flow and payment processing.
```

**Or from web app:** Release Manager → Test profiles → summit-store-api → Start testing

**Test intent (optional):**
```
Verify order creation with valid and invalid inputs, payment processing edge cases, and inventory stock queries. Test error handling for malformed requests.
```

**Show:**
- Agent generates test plan based on the API spec
- Tests execute against live CloudFront endpoint
- Results: test cases, pass/fail, reproduction steps for failures
- "It generated these tests automatically from my OpenAPI spec — I didn't write a single test case."

---

## DEMO 8: Kiro Integration (2 min)

**Prompts to use in Kiro:**

### Investigation from IDE
```
What caused the last incident on payment-service?
```

### Release Review from IDE
```
Run a release readiness review on PR #1 in my connected GitHub repository.
```

### Architecture Question
```
What are the known architectural weaknesses in summit-store and what's the remediation priority?
```

**Talking point:** "No context switching. Development and operations in one workflow. The same agent that investigated my incident can now help me fix the code."

---

## DEMO 9: Custom Agents + Scheduled Workflows (2 min)

**Action:** Show pre-configured custom agents in the web app.

**Show:**
- Agent Space → Goals/Custom Agents section
- 3 agents running on 6-hour schedules
- Execution history with timestamps
- Cost monitoring agent now has CloudWatch access (detect_cost_anomalies tool)
- Show a recent execution result

**In chat (validate it works):**
```
What did the last custom agent execution find? Show me the results.
```

**Talking point:** "These run while I sleep. One monitors costs, another checks capacity, another reviews security posture. Cron jobs with AI reasoning."

---

## DEMO 10: Remote MCP Server (1 min)

**Action:** Show the MCP server integration in the web app.

**Show:**
- Capabilities tab → MCP Servers → summit-store-ops
- 26 tools available across 5 categories
- Tool names visible: get_service_health, get_deployment_diff, detect_cost_anomalies, etc.

**In chat (show it being used):**
```
Use the summit-store-ops MCP tools to get the full deployment diff for deploy-2026-0628-001 and explain the risk.
```

**Talking point:** "Any data source your team has — incident management, deployment systems, architecture docs — you can expose as an MCP server. The agent discovers the tools automatically and uses them during investigations. This one has 26 tools I built in an afternoon."

---

## BONUS: Prevention → Implementation → Validation Flow

Use these prompts to show the complete DevOps loop in Kiro:

### Step 1 — Show the problem (incident root cause)
```
What caused the last incident on payment-service? What was the root cause?
```

### Step 2 — Show the recommendation
```
What prevention recommendations exist for payment-service resilience?
```

### Step 3 — Implement the fix (show branch diff)
```bash
# In terminal, show the circuit breaker implementation:
git diff main..demo/fix-circuit-breaker -- summit-store/services/payment-service/
```

### Step 4 — Validate the fix (release readiness)
```
Run a release readiness review on the demo/fix-circuit-breaker branch.
```

### Alternative fixes to show:
```bash
# DLQ alarm fix:
git diff main..demo/missing-dlq-alarm -- summit-store/infrastructure/lib/monitoring-stack.ts

# Canary deployment fix:
git diff main..demo/canary-deployment -- summit-store/.github/workflows/payment-service.yml

# IAM scope fix:
git diff main..demo/scope-iam -- summit-store/infrastructure/lib/services-stack.ts
```

---

## Demo Branches Quick Reference

| Branch | Demo | PR Title |
|--------|------|----------|
| `demo/bad-release` | Demo 6 (RRR BLOCK) | feat: add order receipts bucket and simplify payment flow |
| `demo/break-payment-timeout` | Demo 2 (Incident) | chore: reduce gateway timeout for performance testing |
| `demo/fix-circuit-breaker` | Demo 4→8 (Fix) | feat: add circuit breaker to payment-service gateway calls |
| `demo/missing-dlq-alarm` | Demo 4 (Obs fix) | feat: add CloudWatch alarm on SQS dead-letter queue depth |
| `demo/canary-deployment` | Demo 4 (Pipeline) | feat: add canary deployment stage with automated rollback |
| `demo/scope-iam` | Demo 6 (Security) | fix: scope order-service IAM to least privilege |

---

## Incident Recovery (after demos)

```bash
# Disable chaos
curl -X DELETE https://$CLOUDFRONT_URL/chaos

# Or restore payment-service timeout
aws ecs update-service --cluster summit-store --service payment-service \
  --force-new-deployment \
  --region us-east-1
```

---

## Emergency Fallback Prompts

If any live demo fails, use these in chat to show the capability with cached data:

```
Summarize the last completed investigation including root cause and mitigation steps.
```

```
What prevention recommendations exist for summit-store? Show all categories.
```

```
List all services in my topology and their current health status.
```

```
What are the open incidents and who is on call right now?
```
