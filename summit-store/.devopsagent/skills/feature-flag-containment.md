---
name: feature-flag-containment
description: Use this skill during incident response when a feature flag toggle can provide faster containment than a full service rollback. Guides the agent to check flag state, assess impact, and recommend toggling a kill switch as immediate mitigation before pursuing longer-term fixes.
---

# Feature Flag Containment Playbook

## When to Use This Skill

Use feature flag containment as the **first mitigation option** when ALL of the following are true:

1. An incident is caused by a recently enabled feature or behavior change
2. A feature flag exists that controls the affected code path
3. Disabling the flag will not cause data loss or inconsistency
4. A full rollback is slower (>3 minutes) or riskier than a flag toggle (<30 seconds)

## Containment Decision Flow

### Step 1: Identify Candidate Flags

Query feature flags for the affected service:
```
get_feature_flags(service_name='<affected-service>', state='enabled')
```

Look for:
- Flags modified within the incident correlation window (last 1-4 hours)
- Flags marked as `killSwitch: true` on the affected dependency
- Flags controlling the code path identified in root cause analysis

### Step 2: Assess Toggle Impact

Before recommending a toggle, evaluate:
```
get_feature_flag_details(flag_key='<candidate-flag>')
```

Check:
- **impactWhenDisabled**: What behavior changes? Is it acceptable as temporary mitigation?
- **dependencies**: Will disabling create a different failure mode?
- **rolloutPercentage**: If partially rolled out, is a rollback to 0% sufficient?

### Step 3: Recommend Containment Action

If a suitable kill switch flag is found:

**Recommend:** "Disable feature flag `<flag-name>` as immediate containment. This will [impact description]. Estimated time to effect: <30 seconds."

**Include in recommendation:**
- The specific `toggle_feature_flag` call with parameters
- Expected behavior change after toggle
- Monitoring to confirm mitigation is working
- Next steps (root cause fix vs. permanent flag removal)

### Step 4: Execute Toggle (if approved)

```
toggle_feature_flag(
  flag_key='<flag>',
  action='disable',
  reason='Incident containment: <brief description of incident>'
)
```

### Step 5: Verify Containment

After toggle, check:
- Error rate returning to baseline within 60 seconds
- No new failure mode introduced by the fallback behavior
- Affected alarms returning to OK state

## When NOT to Use Feature Flag Containment

- **No flag exists** for the affected path → proceed to rollback
- **Flag toggle would cause data loss** (e.g., disabling a migration flag mid-migration)
- **Root cause is infrastructure** (capacity, networking) not application behavior
- **Flag was not recently changed** and the incident is not related to flagged code

## Priority Order for Incident Mitigation

1. **Feature flag toggle** (fastest — <30 seconds, zero deployment)
2. **Traffic shift** (fast — route away from affected instances)
3. **Service rollback** (medium — 3-5 minutes for ECS rolling update)
4. **Infrastructure change** (slow — capacity scaling, config changes)

## summit-store Specific Flags

| Flag | Kill Switch | Service | Use Case |
|------|-------------|---------|----------|
| `payment-gateway-v2` | Yes | payment-service | Disable V2 gateway, fall back to legacy |
| `circuit-breaker-payment` | No | payment-service | Enable to add circuit breaker protection |
| `async-inventory-batching` | No | order-service | Disable batching, return to single-message |
| `order-discount-codes` | No | order-service | Disable discounts if causing calculation errors |
| `enhanced-logging` | No | all | Enable for diagnostic data during investigation |

## Example Scenario

**Incident:** payment-service error rate spiked to 40% after `payment-gateway-v2` was enabled at full rollout.

**Containment recommendation:**
> Disable `payment-gateway-v2` flag immediately. This will route all payment requests through the legacy gateway (slower but stable). Error rate should return to <1% within 30 seconds. Once stable, investigate V2 gateway integration bug at lower priority.

**Command:**
```
toggle_feature_flag(
  flag_key='payment-gateway-v2',
  action='disable',
  reason='Incident INC-2026-0043: V2 gateway causing 40% error rate, reverting to legacy'
)
```
