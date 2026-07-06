# Demo Prompts — AWS DevOps Agent at EAMM TFC Summit 2026

## Pre-Demo Checklist (30 min before)

- [ ] Start load test: `./scripts/generate-load.sh`
- [ ] Verify services healthy: `curl https://$CLOUDFRONT_URL/health`
- [ ] Confirm DevOps Agent web app is accessible
- [ ] Have PR #1 open in browser tab (`https://github.com/jeanvelez2/devops-agent-demo-tre-eamm-2026/pull/1`)
- [ ] Have Kiro open with the summit-store workspace

---

## DEMO 1: Topology Viewer + Pipeline View + Summary Report (3 min)

**Action:** Open the Topology Viewer in the DevOps Agent Operator Web App. Click through all 4 views. Then show Summary Report.

**Talking points:**
- System View: order-service → payment-service → external gateway dependency chain
- Resource View: DynamoDB table, Lambda function, ALB, SQS queues
- **Pipeline View** (NEW): GitHub Actions → Build → Test → Deploy (shows missing canary stage)
- "This was built automatically from infrastructure, code, and observability — I didn't draw this."
- "The Pipeline view shows CI/CD topology — it learned my deployment stages and found the gap."

**Then show Summary Report:**
- Open Artifacts → Summary Report tab
- "This is a living architecture doc — auto-generated, always current, shareable with the team."

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

## DEMO 5: On-Demand Chat + Voice Input + Inline Charts (3 min)

**Pro tip:** Use **voice input** (microphone icon) for the first query to showcase the feature.

**Prompts to use in DevOps Agent chat:**

### Inline Chart — Voice Input (SPEAK this one)
```
Show me the p99 latency trend for order-service over the last 24 hours.
```
→ Renders inline chart directly in the conversation.

### Inline Data Table — Cost Analysis (uses MCP tools)
```
Run a cost analysis on summit-store. Are there any anomalies or optimization opportunities?
```
→ Renders inline data table with cost breakdown by service.

### Architecture & Dependencies
```
What services depend on payment-service and what happens when it degrades?
```

### Custom Chart — Error Rate
```
Show me the error rate trend for order-service over the last 7 days.
```
→ Another inline chart. "No dashboard needed — it renders right here."

### Architecture-Aware Answer (uses Knowledge Skill + AGENTS.md)
```
What would a circuit breaker look like for our payment-service? Include implementation steps specific to our architecture.
```

**Talking points:**
- "I spoke that first query — voice input, transcribed in real-time"
- "Charts and tables render inline — no switching to CloudWatch dashboards"
- "The agent references our specific stack because I steered it with AGENTS.md instructions and architecture skills"

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

**Expected AWS Transform (mention, not live output):**
- After review results load, flash the settings: Release Manager → Settings → Integrations → **AWS Transform** toggle
- "When enabled, you also get code modernization recommendations — deprecated SDK patterns, structural improvements"
- 10-second mention, not a live demo of Transform output

**Talking points:**
- "It didn't just find a missing encryption flag. It understood that removing the SQS step breaks the inventory reservation flow — that's architectural understanding, not pattern matching."
- "You can also integrate AWS Transform here — same review pass surfaces modernization suggestions alongside the safety findings. One PR, two AI perspectives."

---

## DEMO 7: Autonomous Release Testing (3 min)

**Action:** Trigger from the web app or chat.

**Test profile ID:** `ki-88a3e07b-88b2-4158-adf8-4051602bf6d8`

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
- Show `release-tests.yml` in GitHub Actions — "This also runs automatically on every push to main"
- "It generated these tests automatically — I didn't write a single test case."

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

**In chat (show specific agents):**
```
Show me the security posture audit results. Were any IAM violations found?
```

```
What did the log anomaly agent detect? Are there new error patterns?
```

**Show — Asset API (list live + show definitions as code):**

```bash
# Run this live — proves the API exists, safe to execute
aws devopsagent list-assets \
  --agent-space-id $AGENT_SPACE_ID \
  --asset-type CUSTOM_AGENT \
  --region us-east-1
```

Then open `.devopsagent/agents/cost-anomaly.yaml` in the editor:
- "This YAML is the same agent you saw running — defined as code, version controlled"
- "A CI/CD step provisions it via the Asset API. No ClickOps."

**Talking points:**
- "Three agents run while I sleep — capacity checks, security posture audits, and log anomaly detection. Cron jobs with AI reasoning."
- "The security agent already found our overly broad IAM role."
- "Everything here is available through a public API — agents, test profiles, skills, feedback. Define your agents as code in Git, deploy them through CI/CD. Infrastructure-as-code for your AI agents."

---

## DEMO 10: Remote MCP Server (1 min)

**Action:** Show the MCP server integration in the web app.

**Show:**
- Capabilities tab → MCP Servers → summit-store-ops
- 31 tools available across 6 categories (operations, incidents, knowledge, deployments, monitoring, **feature flags**)
- Tool names visible: get_service_health, get_deployment_diff, detect_cost_anomalies, get_feature_flags, toggle_feature_flag, etc.

**In chat (show it being used):**
```
Use the summit-store-ops MCP tools to get the full deployment diff for deploy-2026-0628-001 and explain the risk.
```

**Talking point:** "Any data source your team has — incident management, deployment systems, architecture docs, feature flags — you can expose as an MCP server. The agent discovers the tools automatically and uses them during investigations. This one has 31 tools I built in an afternoon."

---

## DEMO 11: Feature Flag Kill Switch (2 min)

**Action:** Show feature flags as a faster-than-rollback incident containment option.

**In chat (query flags):**
```
What feature flags are available for payment-service? Are any marked as kill switches?
```

**In chat (containment during incident):**
```
The payment-gateway-v2 flag was recently enabled and we're seeing errors. What's the fastest containment option?
```

**In chat (assess coverage):**
```
Assess feature flag coverage for order-service. What critical paths are unprotected?
```

**In chat (show audit trail):**
```
Show me the feature flag audit log for the last 72 hours. Who changed what?
```

**Talking point:** "Feature flag toggle is instant — under 30 seconds to contain an incident vs 3-5 minutes for a rollback. The agent knows which flags are kill switches and recommends toggling them before attempting a full rollback. Every toggle is audited."

---

## DEMO 12: Knowledge System — AGENTS.md, Memories, Skills Gallery (2 min)

**Action:** Show the Knowledge page in the web app (3 tabs: Instructions, Skills, Memories).

**Show — Instructions (AGENTS.md):**
- Open Instructions tab → show the agent-level instructions
- "For payment-service incidents: always check GATEWAY_TIMEOUT_MS value first"
- "Prefer feature flag toggles over rollbacks"
- "These are injected into every agent response"

**Show — Memories:**
- Memories created from prior investigations:
  - "payment-service gateway timeout at 100ms was root cause of INC-2026-0042"
  - "DynamoDB GSI throttling between 03:00-04:00 UTC is expected from nightly batch"

**Show — Community Skills Gallery (quick flash):**
- Browse → Import → "Don't start from zero"

**Show — Import Skills from Repository (live):**
- Knowledge → Skills → **Import from repository**
- Paste: `https://github.com/jeanvelez2/devops-agent-demo-tre-eamm-2026/tree/main/summit-store/.devopsagent/skills/circuit-breaker-playbook.md`
- Show instant import with name/description auto-detected
- Click **Sync** to pull latest version

**Or via CLI (show in terminal):**
```bash
aws devopsagent create-asset \
  --agent-space-id $AGENT_SPACE_ID \
  --asset-type SKILL \
  --name "circuit-breaker-playbook" \
  --content '{"sourceUrl": "https://github.com/jeanvelez2/devops-agent-demo-tre-eamm-2026/tree/main/summit-store/.devopsagent/skills/circuit-breaker-playbook.md"}' \
  --region us-east-1
```

**In chat (demonstrate memory recall):**
```
Payment-service latency is spiking again. What did you learn from the last time this happened?
```

**In chat (demonstrate AGENTS.md influence):**
```
What should I check first when payment-service has high error rates?
```
→ Agent responds with GATEWAY_TIMEOUT_MS check (steered by AGENTS.md).

**Talking points:**
- "AGENTS.md is your system prompt. Memories are what it learned. Skills are what you taught it."
- "After the first incident it skips dead ends — MTTR drops from 45 to 8 minutes."
- "Community Skills Gallery means you can import proven patterns from other teams with one click."
- "And for your own skills — import directly from your GitHub repo. Point to a SKILL.md, and it syncs on demand. Skills-as-code, version controlled, no drift."

---

## DEMO 13: Quality Dashboard + Human Labeling (1 min)

**Action:** Show the labeling UI and quality dashboard in the web app.

**Show:**
- Completed investigation with labeling buttons (Accurate / Inaccurate / Partially Correct)
- Quality dashboard trending: accuracy 72% → 91%, MTTR 45 min → 8 min, recommendation acceptance 60% → 85%

**Talking point:** "We label whether the agent got it right. This governance layer proves the system is getting better over time. MTTR dropped from 45 to 8 minutes — that's the business case."

---

## DEMO 14: A2A Protocol + Multi-Agent Orchestration (1 min)

**Action:** Show headless invocation from Kiro via A2A protocol.

**In Kiro:**
```
Check if my current code changes would pass a release readiness review before I push.
```

**In Kiro (health check without leaving IDE):**
```
What's the current health status of summit-store? Any active incidents?
```

**Show:**
- Kiro calls DevOps Agent via A2A (no web app switch)
- Results returned directly in IDE

**Talking point:** "DevOps Agent isn't just a web app — it's a headless service. Any coding agent, CI/CD system, or planning agent can invoke it via A2A or MCP protocols. This is 'DevOps Agent as an API'."

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

## BONUS: Feature Flag Containment Flow

Use these prompts to show the flag-based incident response:

### Step 1 — Identify the problem
```
Payment-service errors spiked to 40% after the latest flag change. What flags were recently modified?
```

### Step 2 — Recommend containment
```
Should I disable payment-gateway-v2 as containment? What's the impact?
```

### Step 3 — Execute toggle
```
Disable the payment-gateway-v2 flag. Reason: incident containment for error rate spike.
```

### Step 4 — Verify containment
```
Check payment-service error rate after the flag toggle. Is it recovering?
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

```
What feature flags are configured for summit-store? Which ones are kill switches?
```

```
Show me all custom agent execution results from the past 24 hours.
```

```
What did you learn from past investigations? Show me your memories for payment-service.
```
