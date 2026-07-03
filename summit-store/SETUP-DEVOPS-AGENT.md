# DevOps Agent Configuration Guide

## Completion Status

| # | Step | Status |
|---|------|--------|
| 1 | Refresh MCP tool list (31 tools) | ✅ Done |
| 2 | Upload `feature-flag-containment` skill | ✅ Done |
| 3 | Upload `skip-known-flapping` skill | ✅ Done |
| 4 | Upload/sync AGENTS.md | ✅ Done |
| 5 | Create `security-posture` custom agent | ✅ Done |
| 6 | Create `log-anomaly` custom agent | ✅ Done |
| 7 | Create `cost-anomaly` custom agent | ✅ Done |
| 8 | Test profile + CI/CD workflow | ✅ Done (`ki-88a3e07b-88b2-4158-adf8-4051602bf6d8`) |
| 9 | Enable automated PR reviews | ✅ Done (not yet tested) |
| 10 | Verify release standards | ✅ Done (uploaded as Generic skill) |

---

## Steps 5–8: Reference (Completed)

<details>
<summary>Click to expand completed step details</summary>

### Step 5: Create `security-posture` Custom Agent

✅ **DONE**

Choose **Form** method:

| Field | Value |
|-------|-------|
| **Name** | `security-posture` |
| **System prompt** | See below |
| **Skills** | Select `summit-store-architecture` |

**System prompt:**
```markdown
You are a security auditing agent for the summit-store application.

## Goal
Audit IAM roles, S3 bucket policies, and security groups for summit-store services. Flag overly broad permissions, public access, and drift from least-privilege baseline.

## Approach
1. Call `get_known_issues` with category='security' to get the current known security issues.
2. Use AWS tools to check IAM roles matching 'summit-store-*' for wildcard actions (s3:*, *).
3. Check S3 buckets matching 'summit-store-*' for public access or missing encryption.
4. Check security groups tagged with project=summit-store for inbound rules allowing 0.0.0.0/0 on non-HTTP ports.
5. Compare findings against the known issues list to identify NEW violations vs. already-tracked ones.

## Constraints
- Read-only access — do not modify any IAM policies, bucket policies, or security groups.
- Only audit resources tagged or named with 'summit-store'.
- Flag findings as NEW if not already in the known issues list.

## Output
Produce a recommendation with:
- A table listing each finding with resource ARN, violation type, and severity (HIGH/MEDIUM/LOW).
- For each HIGH finding, include the specific policy statement or rule that violates least privilege.
- A summary paragraph with the overall security posture assessment.
- Effort level for each remediation (LOW/MEDIUM/HIGH).
```

**After creation, assign MCP tools via Chat:**
```
Add the get_known_issues, get_architecture, and get_service_dependencies tools to my security-posture agent.
```

**Set up schedule trigger:**
1. Go to the agent detail page → **Triggers** tab → **+** button
2. Enter: `cron(0 */6 ? * * *)`
3. Choose **Create**

---

## Step 6: Create `log-anomaly` Custom Agent

✅ **DONE**

**Navigate to:** DevOps Agent Web App → Agents → Custom Agents → **Create agent**

Choose **Form** method:

| Field | Value |
|-------|-------|
| **Name** | `log-anomaly` |
| **System prompt** | See below |
| **Skills** | Select `summit-store-architecture` |

**System prompt:**
```markdown
You are a log analysis agent for the summit-store application.

## Goal
Review CloudWatch Logs from the past 24 hours across all summit-store services. Compare error patterns against a 7-day baseline. Flag new exception types and error rate spikes.

## Approach
1. Query CloudWatch Logs Insights for the past 24 hours across these log groups:
   - /ecs/summit-store/order-service
   - /ecs/summit-store/payment-service
   - /ecs/summit-store/inventory-service
2. Filter for level="ERROR" or level="WARN" entries.
3. Group errors by service and message pattern.
4. Query the same log groups for the past 7 days to establish a baseline of known error patterns.
5. Identify:
   - NEW error patterns (messages seen in the last 24h but NOT in the previous 6 days)
   - Error rate spikes (>200% of 7-day daily average for any service)
6. For each new pattern, include the full error message, service name, and count.

## Constraints
- Read-only access — do not modify any log groups or alarms.
- Ignore log entries with level="INFO" or level="DEBUG".
- The nightly batch job (03:00-04:00 UTC) generates expected DynamoDB throttle warnings — do NOT flag those as anomalies.

## Output
Produce a recommendation with:
- A summary: "X new error patterns detected, Y services have elevated error rates"
- A table of new error patterns with service, message, count, and first-seen timestamp.
- A table of error rate changes (24h vs 7-day average) per service.
- If no anomalies found, state "All clear — no new patterns or rate spikes detected."
```

**After creation, assign MCP tools via Chat:**
```
Add the get_service_health and get_known_issues tools to my log-anomaly agent.
```

**Set up schedule trigger:**
1. Go to the agent detail page → **Triggers** tab → **+** button
2. Enter: `cron(0 */6 ? * * *)`
3. Choose **Create**

---

## Step 7: Create `cost-anomaly` Custom Agent

✅ **DONE**

**Navigate to:** DevOps Agent Web App → Agents → Custom Agents → **Create agent**

Choose **Form** method:

| Field | Value |
|-------|-------|
| **Name** | `cost-anomaly` |
| **System prompt** | See below |
| **Skills** | Select `summit-store-architecture` |

**System prompt:**
```markdown
You are a cost monitoring agent for the summit-store application.

## Goal
Monitor AWS costs for summit-store resources daily. Compare the last 24 hours against a 7-day baseline to detect spending anomalies. Identify top cost drivers and flag unexpected spikes.

## Approach
1. Call `get_cost_summary` with period_days=7 and group_by='SERVICE' to get the cost breakdown.
2. Call `detect_cost_anomalies` with threshold_percent=150 to identify metrics exceeding baseline.
3. Call `get_resource_utilization` with resource_type='all' to check if high costs correlate with high utilization.
4. Pay special attention to:
   - NAT Gateway data processing (often the hidden cost driver for VPC-based ECS)
   - DynamoDB read/write capacity (may spike if GSI throttling causes retries)
   - ECS Fargate costs (check if tasks scaled up unexpectedly)
5. Compare today's costs against the same day last week to account for weekly patterns.

## Constraints
- Read-only access — do not modify any resources or scaling policies.
- Only report anomalies that exceed 150% of the 7-day baseline.
- If total daily spend is under $5, report "Costs nominal" without detailed analysis.

## Output
Produce a recommendation with:
- Daily spend total and comparison to 7-day average.
- Top 5 cost drivers with dollar amounts and percentage of total.
- Any anomalies detected with severity rating and probable cause.
- If NAT Gateway exceeds $2/day, recommend VPC endpoint evaluation.
- Effort level for each cost optimization recommendation.
```

**After creation, assign MCP tools via Chat:**
```
Add the get_cost_summary, detect_cost_anomalies, and get_resource_utilization tools to my cost-anomaly agent.
```

**Set up schedule trigger:**
1. Go to the agent detail page → **Triggers** tab → **+** button
2. Enter: `cron(0 8 ? * * *)`
3. Choose **Create**

---

## Step 8: Verify Test Profile `summit-store-api`

✅ **DONE** — Test profile ID: `ki-88a3e07b-88b2-4158-adf8-4051602bf6d8`

**CI/CD Integration created:** `.github/workflows/release-tests.yml`

**Required GitHub repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value | Where to find |
|--------|-------|---------------|
| `DEVOPS_AGENT_WEBHOOK_URL` | Your Agent Space webhook URL | DevOps Agent Admin Console → Agent Space → Webhooks |
| `DEVOPS_AGENT_WEBHOOK_SECRET` | The HMAC signing secret | Created when you set up the webhook |

Once secrets are configured, every push to `main` or PR will trigger autonomous release testing.

---

</details>

---

## Step 9: Verify Automated PR Reviews Are Enabled

**Navigate to:** DevOps Agent Web App → Admin Console → Capabilities → GitHub integration → **Code Review and Automated Testing**

Verify these settings for your summit-store repository:

| Setting | Expected State |
|---------|---------------|
| **Auto trigger change review** | ✅ Enabled |
| **Automated verification testing** | ✅ Enabled |
| **Runtime role** | (Optional) Set if builds need access to private registries |

If not enabled:
1. Find your repository in the repository list
2. Check both boxes: **Auto trigger change review** and **Automated verification testing**
3. Choose **Save**

Once enabled, any new PR (including `demo/bad-release`) will automatically trigger a release readiness review with inline comments.

---

## Step 10: Verify Release Standards Are Active

Release standards are evaluated through **Skills** — specifically, any skill loaded by the Release Readiness agent. Your standards should already be active if:

1. The `release-standards.md` content was uploaded as a skill (step 2-4 above), OR
2. The AGENTS.md instructions reference enforcing those standards (already done)

**To verify, ask in DevOps Agent chat:**
```
What release standards do you evaluate code changes against?
```

The agent should respond with rules from your `release-standards.md`:
- All S3 buckets must have encryption enabled
- Error handling must not be removed without replacement
- IAM policies must follow least privilege
- All new endpoints must have corresponding health checks
- etc.

**If standards are NOT being evaluated:**

Upload the standards as a skill with agent type "Release Readiness":

1. Go to: Knowledge → Skills → **Create skill**
2. Name: `release-standards`
3. Agent type: **Release Readiness** (this scopes it to code reviews only)
4. Content: paste the contents of `.devopsagent/standards/release-standards.md`
5. Save

Alternatively, import from your GitHub repo:
```
Import skill from https://github.com/<OWNER>/<REPO>/tree/main/summit-store/.devopsagent/standards/release-standards.md
```

---

## Verification Checklist

After completing all steps, run these checks:

| Check | How | Expected Result |
|-------|-----|-----------------|
| Custom agents created | Agents page → Custom Agents section | 4 agents listed (capacity-check, security-posture, log-anomaly, cost-anomaly) |
| Agents scheduled | Each agent → Triggers tab | Triggers showing next run time |
| Test profile exists | Release Manager → Test profiles | `summit-store-api` with CloudFront URL |
| Auto PR review enabled | Capabilities → GitHub → Code Review | Checkbox enabled for your repo |
| Standards evaluated | Chat: "What standards do you enforce?" | Lists your release standards rules |
| Run a test agent | Agents → security-posture → **Run Now** | Invocation starts, finds the overly broad IAM role |

---

## Quick Reference — Agent Names and Schedules

| Agent | Schedule Expression | Next Steps After Creation |
|-------|-------------------|--------------------------|
| `security-posture` | `cron(0 */6 ? * * *)` | Run Now to verify it finds the s3:* IAM violation |
| `log-anomaly` | `cron(0 */6 ? * * *)` | Run Now to verify it queries CloudWatch Logs |
| `cost-anomaly` | `cron(0 8 ? * * *)` | Run Now to verify it calls get_cost_summary |
