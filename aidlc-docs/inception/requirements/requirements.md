# Requirements Document — summit-store

## Intent Analysis
- **User Request**: Build a microservices demo application called "summit-store" for showcasing AWS DevOps Agent capabilities at the EAMM TFC Summit
- **Request Type**: New Project (greenfield)
- **Scope**: System-wide — 3 microservices, CDK infrastructure, CI/CD, observability, load testing
- **Complexity**: Complex — multiple services, multiple languages, full AWS stack

## Functional Requirements

### FR-01: Order Service (Node.js 22 / Express)
- Accepts orders via REST API (POST /orders)
- Calls payment-service synchronously for payment processing
- Sends async messages to inventory-service via SQS
- Exposes /health endpoint
- Exposes /chaos endpoint that introduces artificial latency
- Structured JSON logging with correlation IDs (timestamp, service, traceId, level, message)

### FR-02: Payment Service (Python 3.12 / Flask)
- Processes payments via REST API
- Calls external mock payment gateway
- Feature flag GATEWAY_TIMEOUT_MS (env var) controls gateway timeout
- Exposes /health endpoint
- Structured JSON logging with correlation IDs
- **Intentional weakness**: NO circuit breaker on external gateway calls

### FR-03: Inventory Service (Python 3.12 / Flask)
- Manages stock levels using DynamoDB
- Consumes messages from SQS queue for async stock updates
- Exposes /health endpoint
- Structured JSON logging with correlation IDs
- **Intentional weakness**: DynamoDB GSI under-provisioned (100 WCU target)

### FR-04: Infrastructure (CDK v2 TypeScript, us-east-1)
- NetworkStack: VPC, subnets, security groups
- DatabaseStack: DynamoDB table with GSI (intentionally under-provisioned)
- ServicesStack: ECS Fargate services (3), ALB, SQS queue, Lambda notification function
- MonitoringStack: CloudWatch alarms (p99 latency >500ms, error rate >5%, DynamoDB throttling)
- CloudFormation outputs: ALB URL, service ARNs, DynamoDB table name
- **Intentional weaknesses**:
  - Lambda timeout 3s (too short for SES calls)
  - Missing alarm on SQS dead-letter queue depth
  - One IAM role with overly broad permissions (s3:*)

### FR-05: CI/CD (GitHub Actions)
- Separate workflow per service (build, test, deploy to ECS)
- **Intentional weakness**: No canary deployment stage

### FR-06: Load Testing
- k6 scripts generating realistic e-commerce traffic
- Scripts in loadtest/ directory

### FR-07: Utility Scripts
- deploy.sh — CDK deployment
- trigger-incident.sh — calls /chaos endpoint
- generate-load.sh — runs k6 load test

### FR-08: DevOps Agent Configuration
- .devopsagent/skills/circuit-breaker-playbook.md (Custom Skill example)
- .devopsagent/knowledge/architecture-rules.md (Knowledge Items content)

## Non-Functional Requirements

### NFR-01: Code Simplicity
- Each service MUST be under 200 lines of application code
- Intentional weaknesses must be realistic but discoverable
- Comments marking where improvements should go (NOT implemented)

### NFR-02: Observability
- CloudWatch metrics, logs, and X-Ray tracing on all services
- Application Signals configured for service-level monitoring
- Structured JSON logging with correlation IDs across all services

### NFR-03: Security (Extension Enabled)
- Security baseline rules enforced as blocking constraints
- Note: One IAM role intentionally has overly broad permissions (for demo discovery)

### NFR-04: Resiliency (Extension Enabled)
- Resiliency baseline applied as directional best practices
- Note: Intentional gaps exist (no circuit breaker, no retries) for DevOps Agent to discover

### NFR-05: Testing (Extension Enabled)
- Property-based testing rules enforced
- Unit tests for core business logic

### FR-09: Demo Branches (Pre-made PRs)
- **demo/bad-change branch**: Removes error handling from order-service + adds an unencrypted S3 bucket (for Release Manager PRR Gate demo)
- **demo/add-discount branch**: Adds new discount logic to order-service — a legitimate functional change (for Autonomous Release Testing demo)

### FR-10: Release Standards
- .devopsagent/standards/release-standards.md — natural language standards the PRR Gate evaluates against:
  - "All S3 buckets must have encryption enabled"
  - "Error handling must not be removed without replacement"
  - "IAM policies must follow least privilege"

### FR-11: Custom Agent Definition
- .devopsagent/agents/capacity-check.yaml — Custom Agent for Scheduled Workflows demo
  - Trigger: every 6 hours
  - Workflow: check DynamoDB capacity
  - Action: post to Slack if approaching limits

### FR-12: Kiro Integration
- README instructions for connecting Kiro to DevOps Agent via Remote MCP + Personal Access Token

### FR-13: Monitoring Alarm Design (Triage Demo)
- MonitoringStack MUST ensure 2+ alarms on order-service fire from a single upstream failure
- Specifically: payment-service timeout must cause BOTH p99 latency alarm AND error rate alarm simultaneously
- Required for Triage Agent duplicate detection demo

### FR-14: README Demo Preparation Section
- Document 24h+ load test requirement for baseline topology
- Document pre-investigation cycle needed for prevention recommendations
- Document pre-created branches (demo/bad-change, demo/add-discount)

## Technical Decisions
- **Region**: us-east-1
- **Node.js**: 22 LTS
- **Python**: 3.12
- **CDK**: v2 (latest stable)
- **Project Structure**: `summit-store/` subdirectory at workspace root

## Project Structure
```
summit-store/
├── infrastructure/         (CDK stacks - TypeScript)
├── services/
│   ├── order-service/      (Node.js 22 / Express)
│   ├── payment-service/    (Python 3.12 / Flask)
│   └── inventory-service/  (Python 3.12 / Flask)
├── .github/workflows/      (CI/CD - GitHub Actions)
├── loadtest/               (k6 scripts)
├── scripts/
│   ├── deploy.sh
│   ├── trigger-incident.sh
│   └── generate-load.sh
├── .devopsagent/
│   ├── skills/circuit-breaker-playbook.md
│   ├── knowledge/architecture-rules.md
│   ├── standards/release-standards.md
│   └── agents/capacity-check.yaml
└── README.md
```
