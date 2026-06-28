# Unit of Work Dependencies

## Dependency Matrix

| Unit | Depends On | Reason |
|---|---|---|
| order-service | — | Entry point, no code dependencies on other units |
| payment-service | — | Independent service |
| inventory-service | — | Independent service |
| infrastructure | order-service, payment-service, inventory-service | References Dockerfiles and service configs |
| ci-cd | order-service, payment-service, inventory-service | Builds and deploys services |
| supporting-files | order-service, infrastructure | Scripts reference ALB URL and service endpoints |

## Recommended Build Order

1. **order-service, payment-service, inventory-service** (parallel — no inter-dependencies)
2. **infrastructure** (references service Dockerfiles)
3. **ci-cd** (references service directories)
4. **supporting-files** (references endpoints and infrastructure outputs)
