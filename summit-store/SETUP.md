# Environment & Infrastructure Setup

Complete guide to deploy summit-store from scratch and configure the DevOps Agent integration.

---

## Prerequisites

### Local Tools

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | `brew install node@20` |
| AWS CLI | 2.x | `brew install awscli` |
| AWS CDK | 2.x | `npm install -g aws-cdk` |
| Docker | Latest | Docker Desktop |
| k6 | Latest | `brew install k6` |
| Git | Latest | `brew install git` |

### AWS Account

- Region: `us-east-1`
- CDK bootstrapped: `cdk bootstrap aws://ACCOUNT_ID/us-east-1`
- SSO profile configured (or any auth method that provides valid credentials)

### Authenticate

```bash
# SSO example:
aws sso login --profile <YOUR_AWS_PROFILE>

# Verify
aws sts get-caller-identity --profile <YOUR_AWS_PROFILE>
```

> **Where to find your profile name:** Check `~/.aws/config` for your SSO profile, or use `aws configure list-profiles`.

---

## Step 1: Clone & Install

```bash
git clone <YOUR_REPO_URL>
cd <REPO_NAME>/summit-store

# Install CDK dependencies
cd infrastructure && npm install && cd ..

# Install MCP server dependencies
cd mcp-server && npm install && cd ..
```

---

## Step 2: Deploy Infrastructure

All infrastructure is defined in CDK (TypeScript). There are 7 stacks deployed in order:

```bash
cd infrastructure

# Deploy everything (CDK handles ordering via cross-stack references)
AWS_PROFILE=<YOUR_AWS_PROFILE> npx cdk deploy --all --require-approval never
```

### Individual Stack Deployment (if needed)

```bash
export AWS_PROFILE=<YOUR_AWS_PROFILE>

# 1. Network (VPC, subnets)
npx cdk deploy SummitStoreNetwork

# 2. Database (DynamoDB, SQS, DLQ)
npx cdk deploy SummitStoreDatabase

# 3. Services (ECS Fargate cluster, ALB, 3 services, Lambda notification)
npx cdk deploy SummitStoreServices

# 4. Monitoring (CloudWatch alarms, SNS topic)
npx cdk deploy SummitStoreMonitoring

# 5. CDN (CloudFront + WAF)
npx cdk deploy SummitStoreCdn

# 6. DevOps Agent Trigger (Lambda webhook, SNS subscription, EventBridge rule)
npx cdk deploy SummitStoreDevOpsAgentTrigger

# 7. MCP Server (API Gateway + Lambda)
npx cdk deploy SummitStoreMcpServer
```

### Expected Outputs After Deploy

| Stack | Output | How to retrieve |
|-------|--------|-----------------|
| SummitStoreServices | AlbUrl | `aws cloudformation describe-stacks --stack-name SummitStoreServices --query "Stacks[0].Outputs[?OutputKey=='AlbUrl'].OutputValue" --output text` |
| SummitStoreCdn | CloudFrontUrl | `aws cloudformation describe-stacks --stack-name SummitStoreCdn --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" --output text` |
| SummitStoreDevOpsAgentTrigger | WebhookSecretArn | `aws cloudformation describe-stacks --stack-name SummitStoreDevOpsAgentTrigger --query "Stacks[0].Outputs[?OutputKey=='WebhookSecretArn'].OutputValue" --output text` |
| SummitStoreMcpServer | McpEndpointUrl | `aws cloudformation describe-stacks --stack-name SummitStoreMcpServer --query "Stacks[0].Outputs[?OutputKey=='McpEndpointUrl'].OutputValue" --output text` |

> **Quick reference:** Run `aws cloudformation describe-stacks --query "Stacks[].Outputs[].[OutputKey,OutputValue]" --output table` to see all outputs at once.

---

## Step 3: Configure DevOps Agent Webhook

After deploying the DevOpsAgentTrigger stack, the Lambda is subscribed to alarms but needs the webhook credentials.

### 3.1 Generate Webhook in DevOps Agent Console

1. Go to **AWS DevOps Agent console** → your Agent Space
2. Navigate to **Capabilities** tab → **Webhook** section → **Configure**
3. Click **Generate webhook** → select **HMAC**
4. **Save** the webhook URL and secret (you won't see them again)

### 3.2 Store Credentials in Secrets Manager

```bash
aws secretsmanager put-secret-value \
  --secret-id summit-store-devops-agent-webhook \
  --secret-string '{"webhookUrl":"<YOUR_WEBHOOK_URL>","webhookSecret":"<YOUR_HMAC_SECRET>","authType":"HMAC"}' \
  --region us-east-1 \
  --profile <YOUR_AWS_PROFILE>
```

> **Where to find:** DevOps Agent console → Agent Space → Capabilities → Webhook → the URL and secret shown after generating.

### 3.3 Verify Webhook Works

```bash
# Trigger a test alarm
aws cloudwatch set-alarm-state \
  --alarm-name order-service-p99-latency \
  --state-value ALARM \
  --state-reason "Setup verification test" \
  --region us-east-1 \
  --profile <YOUR_AWS_PROFILE>

# Check Lambda logs (wait 10 seconds)
aws logs tail /aws/lambda/summit-store-devops-agent-trigger \
  --since 1m --follow \
  --profile <YOUR_AWS_PROFILE> \
  --region us-east-1
```

Expected log output:
```
INFO  Loaded webhook credentials from Secrets Manager
INFO  Processing alarm: order-service-p99-latency, state: ALARM
INFO  Webhook response: 200 - {"message": "Webhook received"}
```

### 3.4 Reset Alarm After Test

```bash
aws cloudwatch set-alarm-state \
  --alarm-name order-service-p99-latency \
  --state-value OK \
  --state-reason "Test complete" \
  --region us-east-1 \
  --profile <YOUR_AWS_PROFILE>
```

---

## Step 4: Configure DevOps Agent — Agent Space

### 4.1 Create Agent Space (if not already created)

1. Go to **AWS DevOps Agent console** (us-east-1)
2. **Create Agent Space** → name: `summit-store-demo`
3. Create IAM roles (auto-create option)
4. Primary source: your AWS account (auto-added)

### 4.2 Connect Integrations

| Integration | Steps |
|-------------|-------|
| **GitHub** | Agent Space → Integrations → GitHub → Connect → Authorize `<GITHUB_OWNER>/<REPO_NAME>` with READ_WRITE |
| **Slack** | Agent Space → Integrations → Slack → Connect → Select workspace → Channel: `#summit-store-incidents` |
| **CloudWatch** | Auto-configured via IAM role (no action needed) |

### 4.3 Register MCP Server

1. Go to **Capability Providers** (side nav) → **MCP Server** → **Register**
2. Fill in:
   - **Name**: `summit-store-ops`
   - **Endpoint URL**: `<MCP_ENDPOINT>` (from CDK output `SummitStoreMcpServer.McpEndpointUrl`)
   - **Description**: `Operational intelligence for summit-store — 26 tools across service health, incidents, architecture, deployments, and cost monitoring`
3. **Authentication**: Select **AWS SigV4**
   - Create IAM role with trust policy for `aidevops.amazonaws.com`
   - Attach `execute-api:Invoke` permission on the API Gateway
   - **Region**: `us-east-1`
   - **Service Name**: `execute-api`
4. **Submit**

### 4.4 Add MCP Tools to Agent Space

1. Agent Space → **Capabilities** tab → **MCP Servers** → **Add**
2. Select `summit-store-ops`
3. Choose **Allow all tools** (26 tools)
4. Click **Add**

### 4.5 Upload Skills

**Architecture Skill:**

1. Agent Space (Operator Web App) → **Knowledge** → **Skills** tab → **Add skill** → **Create skill**
2. Name: `summit-store-architecture`
3. Description: `Architecture knowledge for the Summit Store application. Load this skill when investigating issues or answering questions about summit-store services including order-service, payment-service, and inventory-service. Contains critical information about service dependencies, DynamoDB constraints, and external integrations.`
4. Agent Type: **Generic**
5. Instructions: paste content from `.devopsagent/skills/summit-store-architecture.md` (everything below the frontmatter `---` block)

**Circuit Breaker Skill:**

1. **Add skill** → **Create skill**
2. Name: `circuit-breaker-playbook`
3. Description: `Step-by-step circuit breaker implementation for payment-service external gateway calls. Use when recommending mitigations for payment-service cascade failures or gateway timeout issues.`
4. Agent Type: Deselect Generic, select **Incident Mitigation**
5. Instructions: paste content from `.devopsagent/skills/circuit-breaker-playbook.md`

**Skip Scheduled Maintenance Skill:**

1. **Add skill** → **Create skill**
2. Name: `skip-scheduled-maintenance`
3. Description: `Skip low-priority incidents during a scheduled maintenance window. Use this skill to automatically filter MEDIUM and LOW severity alarms that fire during planned maintenance, avoiding unnecessary investigations for expected disruptions.`
4. Agent Type: Deselect Generic, select **Incident Triage**
5. Instructions: paste content from `.devopsagent/skills/skip-scheduled-maintenance.md`

### 4.6 Create Test Profile (Release Testing)

1. Operator Web App → **Release Manager** → **Test profiles** → **Add test profile**
2. Name: `summit-store-api`
3. Target URL: `<CLOUDFRONT_URL>` (from CDK output `SummitStoreCdn.CloudFrontUrl`)
4. Test type: **API testing**
5. Click **Add test profile**

---

## Step 5: Verify End-to-End

### 5.1 Health Check

```bash
curl -s https://<CLOUDFRONT_URL>/health
# Expected: {"status":"ok","service":"order-service"}
```

### 5.2 Place a Test Order

```bash
curl -s -X POST https://<CLOUDFRONT_URL>/orders \
  -H "Content-Type: application/json" \
  -d '{"itemId":"ITEM-001","quantity":1,"paymentMethod":"credit_card"}'
# Expected: {"orderId":"...","status":"completed"}
```

### 5.3 Verify MCP Server

```bash
curl -s -X POST <MCP_ENDPOINT> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'MCP Tools: {len(d[\"result\"][\"tools\"])}')"
# Expected: MCP Tools: 26
```

### 5.4 Verify DevOps Agent Chat

In the DevOps Agent Operator Web App chat:
```
What services do you know about in my agent space? Can you access the summit-store-ops MCP tools?
```

Expected: Agent lists services and confirms MCP tool access.

---

## Step 6: Seed Demo Data

### 6.1 Start Sustained Load (24h before demo)

```bash
# Option A: k6 locally
cd loadtest
k6 run --env BASE_URL=https://<CLOUDFRONT_URL> load.js

# Option B: Simple curl loop
while true; do
  curl -s -X POST https://<CLOUDFRONT_URL>/orders \
    -H "Content-Type: application/json" \
    -d '{"itemId":"ITEM-001","quantity":1,"paymentMethod":"credit_card"}' > /dev/null
  sleep 2
done
```

This populates:
- Topology Viewer (service maps)
- Application Signals (SLO data)
- CloudWatch metrics baseline (for anomaly detection)

### 6.2 Run One Investigation Cycle

Trigger an incident and let it complete so prevention recommendations are generated:

```bash
# Enable chaos for 5 minutes
curl -X POST https://<CLOUDFRONT_URL>/chaos \
  -H "Content-Type: application/json" \
  -d '{"delayMs": 3000}'

# Wait for alarm to fire and investigation to complete (~8 min)
sleep 480

# Disable chaos
curl -X DELETE https://<CLOUDFRONT_URL>/chaos
```

### 6.3 Prepare Demo Branches

Branches already exist:
- `demo/bad-release` — PR #1 (removes error handling + unencrypted S3 bucket)
- `demo/bad-change` — alternative bad PR
- `demo/add-discount` — feature PR for release testing demo

---

## Step 7: Kiro IDE Integration

### 7.1 Configure MCP Connection

Create/update `.kiro/settings/mcp.json` in the workspace:

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
      "env": { "AWS_PROFILE": "<YOUR_AWS_PROFILE>" }
    }
  }
}
```

### 7.2 Generate Access Token

1. DevOps Agent console → Agent Space → **Settings** → **Access Tokens**
2. **Create** → Name: `Kiro` → Scope: `agent:operate` → Create
3. Copy the token (format: `aidevops_v1_...`)

### 7.3 Set Environment Variable

```bash
export DEVOPS_AGENT_TOKEN=aidevops_v1_YOUR_TOKEN_HERE
```

### 7.4 Verify in Kiro

Open Kiro, then ask:
```
What services are in my DevOps Agent space?
```

---

## Infrastructure Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS Account (us-east-1)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌───────────────────────────────────────┐   │
│  │ CloudFront  │───▶│  ALB (internet-facing)                │   │
│  │   + WAF     │    │                                       │   │
│  └─────────────┘    └──────┬───────────────────────────────-┘   │
│                            │                                     │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │           ECS Fargate Cluster (summit-store)               │  │
│  │                         │                                  │  │
│  │  ┌─────────────┐  ┌────┴────────┐  ┌──────────────────┐  │  │
│  │  │order-service│─▶│payment-svc  │  │ inventory-service│  │  │
│  │  │  (2 tasks)  │  │  (1 task)   │  │   (1 task)       │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘  │  │
│  │         │                 │                   │            │  │
│  └─────────┼─────────────────┼───────────────────┼────────────┘  │
│            │                 │                   │               │
│            ▼                 ▼                   ▼               │
│  ┌────────────────┐ ┌──────────────┐  ┌──────────────────────┐  │
│  │  SQS Queue     │ │  External    │  │  DynamoDB            │  │
│  │ (order-events) │ │  Gateway     │  │ (summit-store-inv)   │  │
│  │  └─▶ DLQ      │ │ (httpbin.org)│  │  └─▶ GSI:status-idx │  │
│  └────────────────┘ └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │            Monitoring & Automation                           │ │
│  │                                                             │ │
│  │  CloudWatch Alarms ──▶ SNS (summit-store-alarms)            │ │
│  │                              │                              │ │
│  │  EventBridge Rule ───────────┼──▶ Lambda (webhook trigger)  │ │
│  │                              └──▶ Lambda (webhook trigger)  │ │
│  │                                         │                   │ │
│  │                                         ▼                   │ │
│  │                              Secrets Manager (webhook creds) │ │
│  │                                         │                   │ │
│  │                                         ▼                   │ │
│  │                              DevOps Agent Webhook (HMAC)     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │            MCP Server (summit-store-ops)                     │ │
│  │                                                             │ │
│  │  API Gateway (HTTP) ──▶ Lambda (26 tools)                   │ │
│  │    /mcp                   ├─ operations (5)                 │ │
│  │                           ├─ incidents (6)                  │ │
│  │                           ├─ knowledge (5)                  │ │
│  │                           ├─ deployments (6)                │ │
│  │                           └─ monitoring (4) ──▶ CloudWatch  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Teardown

```bash
cd infrastructure

# Destroy all stacks (reverse order)
AWS_PROFILE=<YOUR_AWS_PROFILE> npx cdk destroy --all --force
```

**Warning:** This permanently deletes all resources including DynamoDB data, CloudWatch logs, and Secrets Manager secrets. The DynamoDB table and log groups have `RemovalPolicy.DESTROY` set.

---

## Troubleshooting

| Problem | Command | Fix |
|---------|---------|-----|
| CDK can't resolve account | `aws sts get-caller-identity --profile ...` | Re-run `aws sso login --profile ...` |
| Services not starting | `aws ecs list-tasks --cluster summit-store` | Check ECS task logs in CloudWatch |
| Webhook not firing | `aws logs tail /aws/lambda/summit-store-devops-agent-trigger` | Verify Secrets Manager has correct webhook URL |
| MCP server 500 | `aws logs tail /aws/lambda/summit-store-mcp-server` | Check CloudWatch logs for import/runtime errors |
| Alarms stuck in INSUFFICIENT_DATA | Wait for traffic | Start load test to generate metric data |
| CDK deploy fails on network change | Deploy fails with cross-stack reference error | Deploy only the specific stack that changed, not `--all` |
| Docker build fails | `docker buildx ls` | Ensure Docker is running and buildx is available |
