import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const INVENTORY_URL = __ENV.INVENTORY_URL || 'http://localhost:5001';

export const options = {
  stages: [
    { duration: '2m', target: 10 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],
};

const ITEMS = ['item-001', 'item-002', 'item-003', 'item-004', 'item-005'];

export default function () {
  const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];

  // 60% — place orders (hits order-service → payment-service → SQS)
  if (Math.random() < 0.6) {
    const res = http.post(`${BASE_URL}/orders`, JSON.stringify({
      itemId: item,
      quantity: Math.ceil(Math.random() * 3),
      paymentMethod: 'card',
    }), { headers: { 'Content-Type': 'application/json' } });
    check(res, { 'order status 200': (r) => r.status === 200 });
  }

  // 30% — query inventory by status (hits GSI — throttling target)
  if (Math.random() < 0.3) {
    const res = http.get(`${INVENTORY_URL}/stock/status/available`);
    check(res, { 'stock query ok': (r) => r.status === 200 });
  }

  // 10% — check individual stock
  if (Math.random() < 0.1) {
    const res = http.get(`${INVENTORY_URL}/stock/${item}`);
    check(res, { 'stock item ok': (r) => r.status === 200 || r.status === 404 });
  }

  sleep(Math.random() * 2);
}
