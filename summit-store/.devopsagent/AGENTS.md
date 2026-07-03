# Summit Store — Agent Instructions

## Context
This is a demo environment for a microservices e-commerce backend called summit-store, running on ECS Fargate in a single AWS account.

## General Behavior

- Always include the affected service name and incident ID when posting to Slack.
- When investigating latency issues, check recent deployments first — most incidents in this environment are caused by configuration changes.
- Prefer the custom MCP server tools (summit-store-ops) over generic CloudWatch queries when both could answer the question. The MCP tools return richer context.
- When recommending mitigations, check feature flags first. A flag toggle is faster than a rollback.

## Investigation Instructions

- For payment-service incidents: always check GATEWAY_TIMEOUT_MS value in the current task definition. A value below 5000ms is almost certainly the root cause.
- For inventory-service throttling: check if the incident occurred between 03:00-04:30 UTC. If so, it's the nightly batch job and can be skipped (see skip-known-flapping skill).
- When two or more alarms fire within 5 minutes of each other on order-service, assume they share a root cause and link them.
- Always query `get_deployment_diff` for the most recent deployment when a config-change hypothesis is active.

## Investigation Priorities
- When investigating order-service failures, always check payment-service health first — synchronous dependency.
- When DynamoDB throttling is detected, check the status-index GSI specifically (provisioned at 100 WCU).
- When payment-service timeouts occur, check the GATEWAY_TIMEOUT_MS environment variable — values below 5000ms cause cascade failures.

## Response Style
- Be specific. Reference service names, environment variables, and resource names.
- Include confidence scores on hypotheses.
- When recommending mitigations, provide the exact CLI command or configuration change needed.
- Keep summaries under 5 sentences. Details go in the evidence section.

## Known Gaps (intentional)
- No circuit breaker on payment-service external gateway calls
- No retry logic on order-service payment calls
- No canary deployments in CI/CD pipeline
- No CloudWatch alarm on SQS dead-letter queue depth
- IAM role with overly broad s3:* permissions

Do not recommend fixing these during active incident mitigation — they are for prevention recommendations only.

## Chat Instructions

- When asked about architecture, load the summit-store-architecture skill and reference specific component names.
- When asked about costs, use the `get_cost_summary` and `detect_cost_anomalies` MCP tools for live data rather than estimating.
- For "what would X look like" questions, reference the relevant skill (e.g., circuit-breaker-playbook) and provide implementation steps specific to our stack (Python/Flask for payment-service, Node.js/Express for order-service).

## Release Readiness Instructions

- Enforce all rules in `.devopsagent/standards/release-standards.md` as blocking.
- Pay special attention to IAM changes — our order-service already has an overly broad role (s3:*) that should not get worse.
- Flag any removal of error handling as HIGH severity — silent failures are worse than loud failures.
- When reviewing SQS-related changes, verify the DLQ configuration is preserved. Removing async inventory queuing breaks the order-to-inventory data path.

## Custom Agent Instructions

- When the capacity-check agent detects >80% GSI utilization, include the specific WCU numbers and a recommendation to enable auto-scaling.
- When the security-posture agent finds IAM violations, include the exact policy ARN and the offending statement.
- When the cost-anomaly agent detects a spike, compare against the previous week's same-day cost to account for weekly patterns.

## Tone and Format

- Be concise in Slack posts — limit to 5 lines maximum.
- Use bullet points for mitigation steps.
- Always include a "Next steps" section in investigation summaries.
- When providing recommendations, include effort level (LOW/MEDIUM/HIGH) and estimated time to implement.
