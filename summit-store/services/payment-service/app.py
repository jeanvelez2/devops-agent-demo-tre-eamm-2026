import os
import json
import uuid
import time
import requests
from flask import Flask, request, jsonify
from aws_xray_sdk.core import xray_recorder, patch_all
from aws_xray_sdk.ext.flask.middleware import XRayMiddleware

patch_all()

app = Flask(__name__)
xray_recorder.configure(service='payment-service')
XRayMiddleware(app, xray_recorder)

GATEWAY_TIMEOUT_MS = int(os.environ.get('GATEWAY_TIMEOUT_MS', '5000'))
GATEWAY_URL = os.environ.get('GATEWAY_URL', 'https://httpbin.org/delay/1')


def log(level, message, **kwargs):
    xray_trace_id = None
    try:
        seg = xray_recorder.current_segment()
        xray_trace_id = seg.trace_id if seg else None
    except Exception:
        pass
    entry = {
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'service': 'payment-service',
        'traceId': kwargs.get('traceId', 'none'),
        'xrayTraceId': xray_trace_id,
        'level': level,
        'message': message,
        **kwargs
    }
    print(json.dumps(entry), flush=True)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'payment-service'})


@app.route('/pay', methods=['POST'])
def pay():
    data = request.get_json()
    order_id = data.get('orderId', 'unknown')
    amount = data.get('amount', 0)
    trace_id = order_id

    log('info', 'Payment request received', traceId=trace_id, amount=amount)

    # TODO: Add circuit breaker here — currently no protection against gateway failures
    # INTENTIONAL WEAKNESS: No circuit breaker on external gateway calls
    try:
        timeout_s = GATEWAY_TIMEOUT_MS / 1000.0
        resp = requests.post(
            GATEWAY_URL,
            json={'amount': amount, 'orderId': order_id},
            timeout=timeout_s
        )
        resp.raise_for_status()
    except requests.Timeout:
        log('error', 'Gateway timeout', traceId=trace_id, timeoutMs=GATEWAY_TIMEOUT_MS)
        return jsonify({'success': False, 'error': 'gateway_timeout'}), 504
    except requests.RequestException as e:
        log('error', 'Gateway error', traceId=trace_id, error=str(e))
        return jsonify({'success': False, 'error': str(e)}), 502

    transaction_id = str(uuid.uuid4())
    log('info', 'Payment processed', traceId=trace_id, transactionId=transaction_id)
    return jsonify({'success': True, 'transactionId': transaction_id})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
