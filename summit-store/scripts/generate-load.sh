#!/bin/bash
BASE_URL="${1:-http://localhost:3000}"
INVENTORY_URL="${2:-http://localhost:5001}"

echo "Running k6 load test against $BASE_URL..."
k6 run --env BASE_URL="$BASE_URL" --env INVENTORY_URL="$INVENTORY_URL" "$(dirname "$0")/../loadtest/load.js"
