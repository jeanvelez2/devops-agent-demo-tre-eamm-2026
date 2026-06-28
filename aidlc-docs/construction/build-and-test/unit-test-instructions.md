# Unit Test Execution

## order-service

```bash
cd summit-store/services/order-service
npm test
```

Expected: Basic endpoint tests pass (health, orders).

## payment-service

```bash
cd summit-store/services/payment-service
python -m pytest
```

Expected: Health endpoint and payment logic tests.

## inventory-service

```bash
cd summit-store/services/inventory-service
python -m pytest
```

Expected: Health endpoint, stock query, reservation logic tests.

## CDK Infrastructure

```bash
cd summit-store/infrastructure
npx tsc --noEmit
npx cdk synth
```

Expected: All 4 stacks synthesize without errors.
