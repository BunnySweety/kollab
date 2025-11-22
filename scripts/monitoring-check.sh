#!/bin/bash

###############################################################################
# Kollab - Monitoring & Health Check Script
# 
# This script checks the health of Kollab application
# Usage: ./scripts/monitoring-check.sh [staging|production]
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-"localhost"}

case $ENVIRONMENT in
  localhost)
    API_URL="http://localhost:4000"
    WEB_URL="http://localhost:3000"
    ;;
  staging)
    API_URL="https://api-staging.kollab.com"
    WEB_URL="https://staging.kollab.com"
    ;;
  production)
    API_URL="https://api.kollab.com"
    WEB_URL="https://kollab.com"
    ;;
  *)
    echo "Usage: $0 [localhost|staging|production]"
    exit 1
    ;;
esac

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Kollab Health Check - $ENVIRONMENT${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Function to check HTTP status
check_endpoint() {
    local url=$1
    local name=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $name... "
    
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
    response_time=$(curl -s -o /dev/null -w "%{time_total}" "$url" || echo "0")
    
    if [ "$status_code" == "$expected_status" ]; then
        echo -e "${GREEN}✓ OK${NC} (${status_code}, ${response_time}s)"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (${status_code})"
        return 1
    fi
}

# Function to check JSON endpoint
check_json_endpoint() {
    local url=$1
    local name=$2
    
    echo "Checking $name..."
    
    response=$(curl -s "$url")
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$status_code" == "200" ]; then
        echo -e "${GREEN}✓ Endpoint accessible${NC}"
        if command -v jq &> /dev/null; then
            echo "$response" | jq '.' 2>/dev/null || echo "$response"
        else
            echo "$response"
            echo -e "${YELLOW}  (Install 'jq' for formatted JSON output)${NC}"
        fi
        return 0
    else
        echo -e "${RED}✗ Failed (${status_code})${NC}"
        return 1
    fi
}

# 1. Check Web Application
echo -e "${YELLOW}[1/6]${NC} Web Application"
check_endpoint "$WEB_URL" "Web App" || true
echo ""

# 2. Check API Health
echo -e "${YELLOW}[2/6]${NC} API Health"
check_json_endpoint "$API_URL/health"
echo ""

# 3. Check Redis Connection
echo -e "${YELLOW}[3/6]${NC} Redis Connection"
health_response=$(curl -s "$API_URL/health")
if command -v jq &> /dev/null; then
    redis_status=$(echo "$health_response" | jq -r '.redis.connected' 2>/dev/null || echo "unknown")
    if [ "$redis_status" == "true" ]; then
        echo -e "${GREEN}✓ Redis connected${NC}"
        
        # Get Redis stats
        redis_memory=$(echo "$health_response" | jq -r '.redis.memory' 2>/dev/null || echo "unknown")
        redis_hit_rate=$(echo "$health_response" | jq -r '.redis.hitRate' 2>/dev/null || echo "unknown")
        redis_db_size=$(echo "$health_response" | jq -r '.redis.dbSize' 2>/dev/null || echo "unknown")
        
        echo "  Memory: $redis_memory"
        echo "  Hit Rate: $redis_hit_rate%"
        echo "  DB Size: $redis_db_size keys"
    else
        echo -e "${YELLOW}⚠ Redis not connected${NC}"
    fi
else
    # Fallback without jq - try to parse JSON with grep/sed
    if echo "$health_response" | grep -q '"connected".*true'; then
        echo -e "${GREEN}✓ Redis connected${NC}"
        echo -e "${YELLOW}  (Install 'jq' for detailed stats)${NC}"
    else
        echo -e "${YELLOW}⚠ Redis connection status unknown${NC}"
        echo -e "${YELLOW}  (Install 'jq' for better parsing)${NC}"
    fi
fi
echo ""

# 4. Check Database Connection (implicit in health check)
echo -e "${YELLOW}[4/6]${NC} Database Connection"
if [ "$status_code" == "200" ]; then
    echo -e "${GREEN}✓ Database accessible (via API)${NC}"
else
    echo -e "${RED}✗ Database connection unknown${NC}"
fi
echo ""

# 5. Check Response Times
echo -e "${YELLOW}[5/6]${NC} Response Time Check"

endpoints=(
    "$API_URL/health:Health"
    "$API_URL/api/auth/csrf-token:CSRF Token"
)

for endpoint_info in "${endpoints[@]}"; do
    IFS=':' read -r endpoint name <<< "$endpoint_info"
    time=$(curl -s -o /dev/null -w "%{time_total}" "$endpoint" || echo "0")
    
    # Convert time to milliseconds (works without bc using awk or shell arithmetic)
    if command -v awk &> /dev/null; then
        time_ms=$(echo "$time 1000" | awk '{printf "%.0f", $1 * $2}')
    elif command -v bc &> /dev/null; then
        time_ms=$(echo "$time * 1000" | bc | cut -d'.' -f1)
    else
        # Fallback: simple shell arithmetic (may lose precision)
        time_ms=$(echo "$time" | awk -F. '{printf "%.0f", $1 * 1000}')
    fi
    
    # Ensure time_ms is a number
    if [ -z "$time_ms" ] || [ "$time_ms" = "0" ]; then
        time_ms=0
    fi
    
    echo -n "  $name: ${time_ms}ms "
    
    if [ "$time_ms" -lt 100 ] 2>/dev/null; then
        echo -e "${GREEN}✓ Excellent${NC}"
    elif [ "$time_ms" -lt 500 ] 2>/dev/null; then
        echo -e "${YELLOW}⚠ Good${NC}"
    else
        echo -e "${RED}✗ Slow${NC}"
    fi
done
echo ""

# 6. Security Headers Check
echo -e "${YELLOW}[6/6]${NC} Security Headers"

headers=$(curl -sI "$API_URL/health")

check_header() {
    local header=$1
    local name=$2
    
    if echo "$headers" | grep -qi "$header"; then
        echo -e "  ${GREEN}✓${NC} $name present"
    else
        echo -e "  ${YELLOW}⚠${NC} $name missing"
    fi
}

check_header "X-Content-Type-Options" "X-Content-Type-Options"
check_header "X-Frame-Options" "X-Frame-Options"
check_header "X-XSS-Protection" "X-XSS-Protection"
check_header "Strict-Transport-Security" "HSTS"
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Summary                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Environment: $ENVIRONMENT"
echo "API URL: $API_URL"
echo "Web URL: $WEB_URL"
echo "Status: Check results above"
echo ""
echo -e "${BLUE}For detailed monitoring, check:${NC}"
echo "  - Application logs"
echo "  - Error tracking (Sentry)"
echo "  - APM dashboard (DataDog/New Relic)"
echo "  - Database metrics"
echo "  - Redis metrics"
echo ""

