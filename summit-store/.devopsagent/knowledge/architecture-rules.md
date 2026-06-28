# Architecture Rules — summit-store

- order-service depends on payment-service synchronously and inventory-service asynchronously via SQS
- DynamoDB GSI on inventory table is capacity-constrained by design — scale target is 5 RCU/WCU on GSI
- Payment gateway external dependency has 99.5% SLA, timeout should be 5000ms minimum
- order-service is the single entry point behind the ALB — all client traffic flows through it
- When payment-service degrades, order-service experiences both increased latency and increased error rate
- SQS dead-letter queue captures failed inventory updates — must be monitored
- Lambda notification function has a 3-second timeout constraint that may be insufficient for SES calls
- No canary deployment exists — all deployments are rolling updates to ECS
