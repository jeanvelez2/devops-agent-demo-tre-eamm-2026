#!/bin/bash
# Triggers the incident by enabling chaos on order-service
# and reducing payment-service gateway timeout
BASE_URL="${1:-http://localhost:3000}"

echo "Enabling chaos (2000ms delay)..."
curl -s -X POST "$BASE_URL/chaos" -H "Content-Type: application/json" -d '{"delayMs": 2000}'

echo ""
echo "To also reduce payment gateway timeout (triggers cascade failure):"
echo "  aws ecs update-service --cluster summit-store --service payment-service \\"
echo "    --force-new-deployment --overrides '{\"containerOverrides\":[{\"name\":\"app\",\"environment\":[{\"name\":\"GATEWAY_TIMEOUT_MS\",\"value\":\"100\"}]}]}'"
