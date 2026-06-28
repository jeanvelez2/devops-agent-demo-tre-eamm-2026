# Components

## order-service
- **Purpose**: Accepts orders, orchestrates payment and inventory updates
- **Technology**: Node.js 22 / Express
- **Responsibilities**:
  - REST API: POST /orders, GET /health, POST /chaos
  - Synchronous call to payment-service
  - Async message to inventory-service via SQS
  - Structured JSON logging with correlation IDs
  - Chaos endpoint introduces artificial latency
- **Intentional weakness**: No retry logic on payment-service calls

## payment-service
- **Purpose**: Processes payments via external mock gateway
- **Technology**: Python 3.12 / Flask
- **Responsibilities**:
  - REST API: POST /pay, GET /health
  - Calls external mock payment gateway with configurable timeout (GATEWAY_TIMEOUT_MS)
  - Structured JSON logging with correlation IDs
- **Intentional weakness**: No circuit breaker on external gateway calls

## inventory-service
- **Purpose**: Manages stock levels using DynamoDB
- **Technology**: Python 3.12 / Flask
- **Responsibilities**:
  - REST API: POST /reserve, GET /stock/{item_id}, GET /health
  - SQS consumer for async stock updates from order-service
  - DynamoDB read/write operations
  - Structured JSON logging with correlation IDs
- **Intentional weakness**: DynamoDB GSI under-provisioned

## infrastructure (CDK)
- **Purpose**: All AWS infrastructure as code
- **Technology**: CDK v2 TypeScript
- **Responsibilities**:
  - NetworkStack: VPC, subnets, security groups
  - DatabaseStack: DynamoDB table + GSI
  - ServicesStack: ECS Fargate (3 services), ALB, SQS queue, Lambda
  - MonitoringStack: CloudWatch alarms (p99 latency, error rate on order-service, DynamoDB throttling)
- **Intentional weaknesses**: Lambda 3s timeout, missing DLQ alarm, overly broad IAM role

## devopsagent-config
- **Purpose**: DevOps Agent configuration files for demo scenarios
- **Responsibilities**:
  - Custom Skill: circuit-breaker-playbook.md
  - Knowledge Items: architecture-rules.md
  - Release Standards: release-standards.md
  - Custom Agent: capacity-check.yaml
