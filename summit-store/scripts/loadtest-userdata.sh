#!/bin/bash
yum install -y git

# Install k6
rpm --import https://dl.k6.io/key.pgp
cat <<EOF > /etc/yum.repos.d/k6.repo
[k6]
name=k6
baseurl=https://dl.k6.io/rpm
enabled=1
gpgcheck=1
gpgkey=https://dl.k6.io/key.pgp
EOF
yum install -y k6

# Write the load test script
cat <<'SCRIPT' > /home/ec2-user/load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://internal-Summit-ALBAE-CWM6Pph1dwA0-1020411062.us-east-1.elb.amazonaws.com';
const INVENTORY_URL = BASE_URL;

export const options = {
  stages: [
    { duration: '5m', target: 20 },
    { duration: '24h', target: 20 },
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
    check(res, { 'order ok': (r) => r.status === 200 });
  }

  if (Math.random() < 0.3) {
    http.get(`${BASE_URL}/stock/status/available`);
  }

  if (Math.random() < 0.1) {
    http.get(`${BASE_URL}/stock/${item}`);
  }

  sleep(Math.random() * 3 + 1);
}
SCRIPT

# Run k6 in background (survives SSH disconnect)
nohup k6 run /home/ec2-user/load.js > /home/ec2-user/k6.log 2>&1 &
