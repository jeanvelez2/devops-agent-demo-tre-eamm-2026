# Demo Runbook — Step by Step

## Environment Variables

Set these before starting. All values come from CDK stack outputs after deployment.

```bash
# Your AWS CLI profile
export AWS_PROFILE=<your-sso-profile-name>

# From CDK output: SummitStoreCdn.CloudFrontUrl
export CLOUDFRONT_URL=<your-cloudfront-domain>

# From CDK output: SummitStoreMcpServer.McpEndpointUrl
export MCP_ENDPOINT=https://baeb2x1g0g.execute-api.us-east-1.amazonaws.com/mcp

# Your GitHub repo (owner/name)
export GITHUB_REPO=jeanvelez2/devops-agent-demo-tre-eamm-2026
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
- GitHub PR #1: `https://github.com/jeanvelez2/devops-agent-demo-tre-eamm-2026/pull/1`
- CloudWatch Alarms: https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#alarmsV2:
- Terminal (for triggering incident)
- Kiro IDE with summit-store workspace open

---

## PHASE 2: Demo Execution

### DEMO 1: Topology Viewer + Summary Report (3 min)

**What you do:**
1. Switch to the DevOps Agent Web App → Topology tab
2. Click through the views: System → Container → Resource → **Pipeline**
3. Then open the **Summary Report** tab (Artifacts section)

**What you show — Topology views:**
- System View: order-service → payment-service → external gateway dependency chain
- Container View: ECS tasks, ALB, SQS queues
- Resource View: DynamoDB table, Lambda function, ALB, SQS queues
- **Pipeline View** (NEW): GitHub Actions stages → Build → Test → Deploy to ECS (shows missing canary stage gap)

**What you show — Summary Report:**
- Auto-generated Markdown summarizing everything DevOps Agent knows about your environment
- Services, dependencies, learned topology, connected tools, skills loaded
- "This is shareable with your team — no manual documentation needed"

**What you say:**
- "This topology was built automatically by DevOps Agent by analyzing my CloudFormation stacks, ECS services, and observability data"
- "I can see order-service depends on payment-service synchronously, and inventory-service async via SQS"
- "The Pipeline view shows my CI/CD stages and where the gaps are — notice there's no canary stage"
- Point to the external gateway dependency: "This is where our incident will come from"
- "The Summary Report is auto-generated and always current — share it with your team as a living architecture doc"

---

### DEMO 2: Trigger Incident + Investigation (5 min)

**What you do:**

**Option A — Chaos endpoint (fast, for live demo):**
```bash
curl -X POST https://$CLOUDFRONT_URL/chaos \
  -H "Content-Type: application/json" \
  -d '{"delayMs": 3000}'
```

**Option B — Deploy the bad timeout change (more realistic):**
```bash
# This simulates what actually happened — a developer pushed a bad config
git checkout demo/break-payment-timeout
# Show the diff: GATEWAY_TIMEOUT_MS changed from 5000 to 100
git diff main -- summit-store/services/payment-service/app.py
```
Then deploy it via ECS force-new-deployment or merge to main.

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

**Demo branches that implement these fixes (show in Kiro or GitHub):**

| Recommendation | Branch | Key change |
|---------------|--------|------------|
| Circuit breaker | `demo/fix-circuit-breaker` | `pybreaker` added to payment-service |
| DLQ alarm | `demo/missing-dlq-alarm` | CloudWatch alarm on DLQ depth > 0 |
| Canary deployment | `demo/canary-deployment` | GitHub Actions canary stage with auto-rollback |
| Scope IAM | `demo/scope-iam` | `s3:*` → `s3:PutObject` on specific bucket |

---

### DEMO 5: On-Demand Chat + Voice + Inline Charts (3 min)

**What you do:**
Switch to the Chat tab. For maximum impact, use **voice input** for the first query (click the microphone icon and speak).

**Prompt 1 — Voice input + Inline chart (speak this):**
```
Show me the error rate trend for order-service over the last 7 days.
```
→ Agent renders an **inline chart** directly in the conversation. No dashboard needed.

**Prompt 2 — Dependencies:**
```
What services depend on payment-service and what happens when it degrades?
```

**Prompt 3 — Cost with inline data table (uses your MCP tools):**
```
Analyze costs for summit-store. Are there anomalies or optimization opportunities?
```
→ Agent renders a **data table** with cost breakdown by service.

**Prompt 4 — Architecture-aware answer:**
```
What would a circuit breaker implementation look like for payment-service? Use our architecture knowledge.
```

**What you show:**
- Voice transcription appearing in real-time as you speak
- Inline chart rendered directly in chat (no external dashboard link)
- Data table with cost breakdown
- Architecture-aware answer referencing your specific stack

**What you say:**
- "I just spoke that query — voice input, transcribed in real-time"
- "The chart rendered inline — no switching to CloudWatch dashboards, no navigating between consoles"
- "It's calling my custom MCP server tools for cost data, and rendering the results as a visual table"
- "The circuit breaker answer references our specific stack (Python, Flask, pybreaker) because it knows our architecture from the AGENTS.md instructions and the skills I uploaded"

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

**Test profile ID:** `ki-88a3e07b-88b2-4158-adf8-4051602bf6d8`

**What you show:**
- Test plan generated from the OpenAPI spec
- Tests executing against the live CloudFront endpoint
- Results: test cases, pass/fail, reproduction steps
- Failed tests showing specific errors with HTTP responses
- **Show the GitHub Actions workflow** (`release-tests.yml`) — "This runs automatically after every deploy"

**What you say:**
- "I pointed it at my CloudFront URL — it generated and ran these tests automatically"
- "No test code written. It figured out the endpoints, valid/invalid payloads, and edge cases from the spec"
- "In CI/CD, this runs as a GitHub Action after every deploy — results show as a Check Run on the PR"
- "Same test profile, triggered from chat OR from a pipeline — your choice"

---

### DEMO 8: Kiro Integration (2 min)

**What you do:**
Switch to Kiro IDE.

**Prompt 1 — Investigate:**
```
What caused the last incident on payment-service?
```

**Prompt 2 — Implement prevention fix:**
```
Show me the circuit breaker recommendation for payment-service. Implement it using pybreaker.
```

Then show the `demo/fix-circuit-breaker` branch diff — "Here's what the implementation looks like."

**Prompt 3 — Validate the fix:**
```
Run a release readiness review on the demo/fix-circuit-breaker branch.
```

**What you say:**
- "Same DevOps Agent, accessed from my IDE — no context switching"
- "The agent investigated the incident, recommended the circuit breaker, I implemented it, and now I'm validating it — all in one workflow"
- "Incident → Prevention → Implementation → Validation — that's the full DevOps loop"

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
- 3 agents running on 6-hour schedules:
  - **capacity-check** — monitors DynamoDB GSI utilization, alerts when approaching 80% of provisioned capacity
  - **security-posture** — audits IAM roles for overly broad permissions, S3 buckets for public access/missing encryption, security groups for open non-HTTP ports
  - **log-anomaly** — reviews CloudWatch Logs from past 24h, compares error patterns against 7-day baseline, flags new exception types
- Execution history with timestamps
- Results showing specific findings (e.g., "order-service IAM role has s3:* — violates least privilege")

**What you say:**
- "Three agents run autonomously every 6 hours — capacity, security posture, and log anomaly detection"
- "The security agent found our intentionally broad IAM role. The log agent caught a new exception pattern we hadn't noticed yet."
- "Cron jobs with AI reasoning. They produce recommendations and post to Slack. No human in the loop."

---

### DEMO 10: Remote MCP Server (1 min)

**What you do:**
1. Show Capabilities tab → MCP Servers → summit-store-ops
2. Show the 31 tools listed across 6 categories

**In chat:**
```
Use the summit-store-ops tools to get the deployment diff for deploy-2026-0628-001 and explain what went wrong.
```

**What you show:**
- The tool being called in the investigation journal
- Rich response with code diff, risk assessment, and configuration changes
- Point out the 6 categories: operations, incidents, knowledge, deployments, monitoring, **feature flags**

**What you say:**
- "I built this MCP server in an afternoon — 31 tools across operations, incidents, architecture, deployments, monitoring, and feature flags"
- "Any internal system your team uses can be exposed as an MCP server"
- "The agent discovers tools automatically and uses them during investigations"

---

### DEMO 11: Feature Flag Kill Switch (2 min)

**What you do:**
1. Show the feature flags through DevOps Agent chat
2. Demonstrate containment recommendation during an active incident

**In chat (show flag state):**
```
What feature flags are available for payment-service? Are any marked as kill switches?
```

**In chat (containment recommendation):**
```
The payment-gateway-v2 flag was recently enabled and we're seeing errors. What's the fastest containment option?
```

**What you show:**
- Agent queries `get_feature_flags(service_name='payment-service', kill_switch_only=true)`
- Agent loads the `feature-flag-containment` skill
- Recommends toggling `payment-gateway-v2` as immediate containment (<30 seconds) vs rollback (3-5 minutes)
- Shows impact assessment: "Falls back to legacy gateway — slower but stable"
- Shows the audit log entry recording who toggled what and why

**What you say:**
- "Feature flag toggle is instant — less than 30 seconds to contain an incident vs 3-5 minutes for a rollback"
- "The agent knows which flags are kill switches and what the impact of disabling them is"
- "Every toggle is audited — who, when, why. Full traceability."
- "This is the same pattern Netflix and LaunchDarkly recommend: feature flags as your first line of defense"

---

### DEMO 12: Knowledge System — Memories, Skills, AGENTS.md (2 min)

**What you do:**
1. Show the **Knowledge** page in the web app (3 tabs: Instructions, Skills, Memories)
2. Show the AGENTS.md tab (Instructions) — your system prompt for the agent
3. Show Memories from prior investigations
4. Quick mention: Community Skills Gallery (browse → import)

**What you show — Instructions (AGENTS.md):**
- Open the Instructions tab → show `.devopsagent/AGENTS.md` content
- "For payment-service incidents: always check GATEWAY_TIMEOUT_MS value first"
- "Prefer feature flag toggles over rollbacks"
- "These are injected into the agent system prompt — they shape every response"

**What you show — Memories:**
- Memory: "payment-service gateway timeout at 100ms was root cause of INC-2026-0042. The 87% failure rate correlated with GATEWAY_TIMEOUT_MS being set below normal gateway response time (1-2s)."
- Memory: "DynamoDB GSI throttling between 03:00-04:00 UTC is expected behavior from the nightly batch job — not a real incident."

**What you show — Learned Skills:**
- "Tool Use Best Practices", "Agent Space Understanding", "Understanding Code Dependencies", "Understanding Pipeline Topology"

**What you show — Community Skills Gallery (quick flash):**
- Browse community-contributed skills
- One-click import into your Agent Space
- "Don't reinvent the wheel — check the gallery first"

**What you say:**
- "AGENTS.md is your system prompt for DevOps Agent. I told it: check the timeout value first for payment issues, and prefer flag toggles over rollbacks."
- "Memories are what the agent learned on its own. Skills are what I taught it. Instructions are how I steer it."
- "After the first incident, it remembers the pattern. Next time, it skips dead ends and goes straight to the root cause."
- "The Community Skills Gallery means you don't start from zero — import proven patterns from other teams."

---

### DEMO 13: Quality Dashboard + Human Labeling (1 min)

**What you do:**
1. Show the investigation quality labeling UI (thumbs up/down on a completed investigation)
2. Show the quality tracking dashboard

**What you show:**
- A completed investigation with the labeling buttons (Accurate / Inaccurate / Partially Correct)
- Dashboard showing:
  - Investigation accuracy trend: 72% → 91% over 30 days
  - MTTR trend: 45 min average → 8 min average
  - Recommendation acceptance rate: 60% → 85%
  - Top root cause categories (deployment changes, dependency failures, capacity limits)

**What you say:**
- "We label whether the agent got it right. This feeds back into its learned skills."
- "Over 30 days, investigation accuracy went from 72% to 91% as the agent accumulated memories and learned our environment."
- "MTTR dropped from 45 minutes to 8 minutes. That's the business value — less time firefighting, more time building."
- "This is governance for AI operations — you can prove it's getting better."

---

### DEMO 14: A2A Protocol + Multi-Agent Orchestration (1 min)

**What you do:**
1. Show the Capabilities tab → Protocols section (MCP + A2A)
2. Demonstrate the headless invocation concept from Kiro

**In Kiro:**
```
Check if my current code changes would pass a release readiness review before I push.
```

**What you show:**
- Kiro calls DevOps Agent via the A2A protocol (no UI switch)
- DevOps Agent evaluates the working tree diff
- Returns results directly in the IDE: "2 findings: missing error handling on new endpoint, S3 bucket without encryption"

**What you say:**
- "DevOps Agent isn't just a web app — it's a headless service that other agents can call"
- "Kiro invoked a release readiness review without me leaving my IDE. No context switching."
- "This works via A2A protocol — any coding agent, planning agent, or CI/CD system can invoke DevOps Agent capabilities"
- "Think of it as 'DevOps Agent as an API' — investigations, release reviews, health checks, all callable programmatically"

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
| Feature flag tools missing | Redeploy MCP server Lambda — featureflags.mjs may not be included in bundle |
| Release Review fails | Trigger from web app UI instead of API. Check GitHub App permissions |
| Services unhealthy | Verify ECS tasks running: `aws ecs list-tasks --cluster summit-store` |
| Kiro can't connect | Re-login: `aws sso login --profile $AWS_PROFILE`, restart Kiro |
| Custom agents not running | Check EventBridge rules: `aws events list-rules --name-prefix summit-store` |

---

## Key Metrics for Success

During the demo, these should be visible:
- **order-service p99**: 500ms+ (when chaos enabled) → <50ms (when disabled)
- **error rate**: 5%+ (when chaos causes timeouts) → <0.5% (normal)
- **CloudWatch alarms**: transition to ALARM state within 2 min of chaos
- **Investigation start**: within 30s of alarm firing (webhook path)
- **MCP tool calls**: visible in investigation journal
