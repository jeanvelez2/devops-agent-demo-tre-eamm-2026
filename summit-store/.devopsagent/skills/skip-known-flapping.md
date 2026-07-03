---
name: skip-known-flapping
description: Skip low-priority incidents caused by known flapping alarms. Use this skill to filter out DynamoDB GSI throttling alarms that fire briefly during the nightly inventory reconciliation batch job, avoiding unnecessary investigations for expected transient behavior.
---

# Skip Known Flapping — DynamoDB GSI Throttling

Skip incidents that meet ALL of the following criteria:

1. The source alarm is `dynamodb-gsi-throttling` (on the `status-index` GSI)
2. The incident arrived between **03:00 UTC** and **04:30 UTC** on any day
3. The throttle event count in the alarm is **fewer than 50 events** in the evaluation period

## Reason

The nightly inventory reconciliation batch job runs between 03:00-04:00 UTC and generates a brief spike of writes to the DynamoDB GSI (`status-index`). Because the GSI is intentionally under-provisioned at 5 WCU, throttling is expected during this window and resolves automatically once the batch completes.

This is a **known issue** tracked in the architecture knowledge base (see `get_known_issues(category='performance')`).

## Do NOT Skip If

- Throttle event count exceeds 50 events (indicates abnormal load beyond batch job)
- The alarm fires **outside** the 03:00-04:30 UTC window
- The alarm is accompanied by a simultaneous `order-service-error-rate` alarm (indicates cascading impact)
- Severity is HIGH or CRITICAL

## Related

- Known issue: "DynamoDB GSI under-provisioned" (planned remediation: enable auto-scaling)
- Custom agent `capacity-check` monitors GSI utilization every 6 hours
- Prevention recommendation: Enable DynamoDB auto-scaling on `status-index` GSI
