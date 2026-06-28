# Circuit Breaker Implementation Playbook

## Target: payment-service → External Payment Gateway

### When to Use
- External gateway SLA breach (>0.5% error rate or p99 > 2000ms)
- Cascade failure detected from payment-service to order-service

### Implementation Steps

1. **Install circuit breaker library**
   ```bash
   pip install pybreaker
   ```

2. **Wrap gateway call with circuit breaker**
   ```python
   import pybreaker
   
   gateway_breaker = pybreaker.CircuitBreaker(
       fail_max=5,
       reset_timeout=30,
       exclude=[requests.exceptions.ConnectionError]
   )
   
   @gateway_breaker
   def call_gateway(payload, timeout_s):
       return requests.post(GATEWAY_URL, json=payload, timeout=timeout_s)
   ```

3. **Add fallback behavior**
   - Return cached successful response if available
   - Queue payment for retry if circuit is open
   - Return 503 with Retry-After header

4. **Add monitoring**
   - Emit custom CloudWatch metric: `payment-service/circuit-breaker-state`
   - Values: CLOSED=0, HALF_OPEN=1, OPEN=2
   - Create alarm on state=OPEN lasting >5 minutes

5. **Verify**
   - Reduce GATEWAY_TIMEOUT_MS to 100ms
   - Observe circuit opens after 5 failures
   - Confirm order-service receives 503 (not timeout)
   - Confirm circuit resets after 30s
