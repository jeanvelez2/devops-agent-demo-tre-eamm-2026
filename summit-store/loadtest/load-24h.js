import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '5m', target: 20 },
    { duration: '23h50m', target: 20 },
    { duration: '5m', target: 0 },
  ],
};

const ITEMS = ['item-001', 'item-002', 'item-003', 'item-004', 'item-005'];

export default function () {
  const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];

  if (Math.random() < 0.6) {
    const res = http.post(`${BASE_URL}/orders`, JSON.stringify({
      itemId: item,
      quantity: Math.ceil(Math.random() * 3),
      paymentMethod: 'card',
    }), { headers: { 'Content-Type': 'application/json' } });
    check(res, { 'order 200': (r) => r.status === 200 });
  }

  if (Math.random() < 0.3) {
    http.get(`${BASE_URL}/health`);
  }

  sleep(1 + Math.random() * 4);
}
