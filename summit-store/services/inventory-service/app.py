import os
import json
import time
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from flask import Flask, request, jsonify
from aws_xray_sdk.core import xray_recorder, patch_all
from aws_xray_sdk.ext.flask.middleware import XRayMiddleware

patch_all()

app = Flask(__name__)
xray_recorder.configure(service='inventory-service')
XRayMiddleware(app, xray_recorder)

DYNAMODB_TABLE = os.environ.get('DYNAMODB_TABLE', 'summit-store-inventory')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
table = dynamodb.Table(DYNAMODB_TABLE)


def log(level, message, **kwargs):
    xray_trace_id = None
    try:
        seg = xray_recorder.current_segment()
        xray_trace_id = seg.trace_id if seg else None
    except Exception:
        pass
    entry = {
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'service': 'inventory-service',
        'traceId': kwargs.get('traceId', 'none'),
        'xrayTraceId': xray_trace_id,
        'level': level,
        'message': message,
        **kwargs
    }
    print(json.dumps(entry), flush=True)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'inventory-service'})


@app.route('/stock/status/<status>', methods=['GET'])
def get_stock_by_status(status):
    """Queries the status-index GSI — this is the throttling target under load."""
    resp = table.query(
        IndexName='status-index',
        KeyConditionExpression=Key('status').eq(status)
    )
    items = [{'itemId': i['itemId'], 'quantity': int(i['quantity']), 'status': i['status']} for i in resp.get('Items', [])]
    return jsonify(items)


@app.route('/stock/<item_id>', methods=['GET'])
def get_stock(item_id):
    resp = table.get_item(Key={'itemId': item_id})
    item = resp.get('Item')
    if not item:
        return jsonify({'error': 'not found'}), 404
    return jsonify({'itemId': item['itemId'], 'quantity': int(item['quantity']), 'status': item.get('status', 'available')})


@app.route('/reserve', methods=['POST'])
def reserve():
    data = request.get_json()
    item_id = data.get('itemId')
    quantity = data.get('quantity', 1)
    trace_id = data.get('traceId', 'none')

    log('info', 'Reserve request', traceId=trace_id, itemId=item_id, quantity=quantity)

    resp = table.get_item(Key={'itemId': item_id})
    item = resp.get('Item')
    if not item:
        return jsonify({'reserved': False, 'error': 'item not found'}), 404

    current = int(item['quantity'])
    if current < quantity:
        return jsonify({'reserved': False, 'error': 'insufficient stock', 'remaining': current}), 409

    new_qty = current - quantity
    try:
        table.update_item(
            Key={'itemId': item_id},
            UpdateExpression='SET quantity = :q',
            ConditionExpression='quantity >= :needed',
            ExpressionAttributeValues={':q': new_qty, ':needed': quantity}
        )
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return jsonify({'reserved': False, 'error': 'insufficient stock (concurrent)'}), 409
        raise
    log('info', 'Stock reserved', traceId=trace_id, itemId=item_id, remaining=new_qty)
    return jsonify({'reserved': True, 'remaining': new_qty})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
