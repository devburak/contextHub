#!/bin/bash

# Test API Stats Debug Endpoint
# Usage: ./test-api-stats.sh <JWT_TOKEN> <TENANT_ID>

TOKEN=${1:-"your-jwt-token"}
TENANT_ID=${2:-"your-tenant-id"}

echo "Testing API Stats Debug Endpoint..."
echo "Token: ${TOKEN:0:20}..."
echo "Tenant ID: $TENANT_ID"
echo ""

curl -s -X GET "http://localhost:3000/api/dashboard/api-stats-debug?tenantId=$TENANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID" \
  | jq '.'

echo ""
echo "Testing Regular API Stats Endpoint..."
curl -s -X GET "http://localhost:3000/api/dashboard/api-stats?tenantId=$TENANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID" \
  | jq '.'
