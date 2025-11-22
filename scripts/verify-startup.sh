#!/bin/bash

# Script de verification du lancement de Kollab
# Usage: ./scripts/verify-startup.sh

set -e

echo "======================================"
echo "  Verification Kollab - Demarrage"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 est installe"
        return 0
    else
        echo -e "${RED}✗${NC} $1 n'est pas installe"
        return 1
    fi
}

check_port() {
    # Try multiple methods for cross-platform compatibility
    if command -v nc &> /dev/null && nc -z localhost $1 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Port $1 est accessible ($2)"
        return 0
    elif command -v timeout &> /dev/null && timeout 1 bash -c "echo > /dev/tcp/localhost/$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Port $1 est accessible ($2)"
        return 0
    elif curl -s --connect-timeout 1 "http://localhost:$1" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Port $1 est accessible ($2)"
        return 0
    else
        echo -e "${RED}✗${NC} Port $1 n'est pas accessible ($2)"
        return 1
    fi
}

check_url() {
    if curl -s $1 > /dev/null; then
        echo -e "${GREEN}✓${NC} $1 repond correctement"
        return 0
    else
        echo -e "${RED}✗${NC} $1 ne repond pas"
        return 1
    fi
}

# 1. Verifier les prerequis
echo "1. Verification des prerequis..."
echo "--------------------------------"

check_command node || exit 1
check_command npm || exit 1
check_command docker || exit 1

NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)

echo "   Node.js: $NODE_VERSION"
echo "   npm: $NPM_VERSION"
echo ""

# 2. Verifier Docker
echo "2. Verification Docker..."
echo "-------------------------"

if docker ps &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker est demarre"
    
    # Verifier les conteneurs Kollab
    if docker ps | grep -q "kollab-postgres"; then
        echo -e "${GREEN}✓${NC} PostgreSQL container est en cours d'execution"
    else
        echo -e "${YELLOW}⚠${NC} PostgreSQL container n'est pas en cours d'execution"
        echo "   Lancer: docker-compose up -d postgres"
    fi
    
    if docker ps | grep -q "kollab-redis"; then
        echo -e "${GREEN}✓${NC} Redis container est en cours d'execution"
    else
        echo -e "${YELLOW}⚠${NC} Redis container n'est pas en cours d'execution"
        echo "   Lancer: docker-compose up -d redis"
    fi
else
    echo -e "${RED}✗${NC} Docker n'est pas demarre"
    echo "   Demarrer Docker Desktop et reessayer"
    exit 1
fi

echo ""

# 3. Verifier les ports
echo "3. Verification des ports..."
echo "----------------------------"

check_port 5432 "PostgreSQL" || echo "   Lancer: docker-compose up -d postgres"
check_port 6379 "Redis" || echo "   Lancer: docker-compose up -d redis"

API_RUNNING=false
WEB_RUNNING=false

if check_port 4000 "API"; then
    API_RUNNING=true
else
    echo "   Lancer: cd apps/api && npm run dev"
fi

if check_port 3000 "Web"; then
    WEB_RUNNING=true
else
    echo "   Lancer: cd apps/web && npm run dev"
fi

echo ""

# 4. Verifier les services HTTP
echo "4. Verification des services HTTP..."
echo "------------------------------------"

if [ "$API_RUNNING" = true ]; then
    check_url "http://localhost:4000/health" || echo "   L'API ne repond pas correctement"
else
    echo -e "${YELLOW}⚠${NC} API n'est pas demarree, impossible de tester"
fi

if [ "$WEB_RUNNING" = true ]; then
    check_url "http://localhost:3000" || echo "   Le Web ne repond pas correctement"
else
    echo -e "${YELLOW}⚠${NC} Web n'est pas demarre, impossible de tester"
fi

echo ""

# 5. Resume
echo "5. Resume de verification"
echo "-------------------------"

ALL_OK=true

if ! docker ps | grep -q "kollab-postgres"; then
    echo -e "${RED}✗${NC} PostgreSQL n'est pas pret"
    ALL_OK=false
fi

if ! docker ps | grep -q "kollab-redis"; then
    echo -e "${RED}✗${NC} Redis n'est pas pret"
    ALL_OK=false
fi

if [ "$API_RUNNING" = false ]; then
    echo -e "${YELLOW}⚠${NC} API n'est pas demarree"
    ALL_OK=false
fi

if [ "$WEB_RUNNING" = false ]; then
    echo -e "${YELLOW}⚠${NC} Web n'est pas demarre"
    ALL_OK=false
fi

echo ""

if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ Tous les services sont operationnels${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Application accessible sur:"
    echo "  - Web: http://localhost:3000"
    echo "  - API: http://localhost:4000"
    echo "  - API Health: http://localhost:4000/health"
    echo ""
else
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}⚠ Certains services ne sont pas prets${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
    echo "Pour demarrer l'application complete:"
    echo "  Option 1 (Recommandee): ./scripts/start.sh"
    echo "  Option 2: npm start"
    echo "  Option 3 (Manuelle):"
    echo "    1. docker-compose up -d"
    echo "    2. cd apps/api && npm run dev"
    echo "    3. cd apps/web && npm run dev"
    echo ""
fi

exit 0

