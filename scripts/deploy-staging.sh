#!/bin/bash

###############################################################################
# Kollab - Staging Deployment Script
# 
# This script automates the deployment to staging environment
# Usage: ./scripts/deploy-staging.sh
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="staging"
API_DIR="apps/api"
WEB_DIR="apps/web"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Kollab Staging Deployment            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Pre-deployment checks
echo -e "${YELLOW}[1/8]${NC} Running pre-deployment checks..."

# Check if on correct branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    echo -e "${RED}✗ Not on 'develop' branch (current: $CURRENT_BRANCH)${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠ Warning: You have uncommitted changes${NC}"
    git status -s
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${GREEN}✓ Pre-deployment checks passed${NC}"
echo ""

# Step 2: Pull latest changes
echo -e "${YELLOW}[2/8]${NC} Pulling latest changes..."
git pull origin develop
echo -e "${GREEN}✓ Code updated${NC}"
echo ""

# Step 3: Install dependencies
echo -e "${YELLOW}[3/8]${NC} Installing dependencies..."
echo "→ API dependencies..."
cd $API_DIR && npm ci --production=false
cd ../..

echo "→ Web dependencies..."
cd $WEB_DIR && npm ci --production=false
cd ../..

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 4: Run linter
echo -e "${YELLOW}[4/8]${NC} Running linter..."
cd $API_DIR && npm run lint || echo "Lint warnings (continuing)"
cd ../..
cd $WEB_DIR && npm run lint || echo "Lint warnings (continuing)"
cd ../..
echo -e "${GREEN}✓ Linter completed${NC}"
echo ""

# Step 5: Run type check
echo -e "${YELLOW}[5/8]${NC} Running type check..."
cd $API_DIR && npm run type-check
cd ../..
cd $WEB_DIR && npm run build  # SvelteKit checks types during build
cd ../..
echo -e "${GREEN}✓ Type check passed${NC}"
echo ""

# Step 6: Build applications
echo -e "${YELLOW}[6/8]${NC} Building applications..."
echo "→ Building API..."
cd $API_DIR && npm run build
cd ../..

echo "→ Building Web..."
cd $WEB_DIR && npm run build
cd ../..

echo -e "${GREEN}✓ Build completed${NC}"
echo ""

# Step 7: Run database migrations (if needed)
echo -e "${YELLOW}[7/8]${NC} Running database migrations..."
echo "Make sure STAGING_DATABASE_URL is set in your environment"
read -p "Run migrations now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd $API_DIR && npm run db:push
    cd ../..
    echo -e "${GREEN}✓ Migrations completed${NC}"
else
    echo -e "${YELLOW}⚠ Skipped migrations${NC}"
fi
echo ""

# Step 8: Deploy (customize based on your hosting)
echo -e "${YELLOW}[8/8]${NC} Deploying to staging..."
echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Deployment Commands                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Choose your deployment method:"
echo ""
echo "  1. Fly.io:"
echo "     cd $API_DIR && flyctl deploy --config fly.staging.toml"
echo "     cd $WEB_DIR && flyctl deploy --config fly.staging.toml"
echo ""
echo "  2. Vercel:"
echo "     cd $WEB_DIR && vercel --prod"
echo ""
echo "  3. Docker:"
echo "     docker build -t kollab-api:staging -f $API_DIR/Dockerfile ."
echo "     docker build -t kollab-web:staging -f $WEB_DIR/Dockerfile ."
echo ""
echo "  4. Manual (SCP/SFTP):"
echo "     scp -r $API_DIR/dist user@staging-server:/path/to/api"
echo "     scp -r $WEB_DIR/build user@staging-server:/path/to/web"
echo ""

read -p "Run deployment command? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Add your deployment command here
    echo -e "${YELLOW}→ Add your deployment command in this script${NC}"
    # Example:
    # cd $API_DIR && flyctl deploy --config fly.staging.toml
    # cd $WEB_DIR && vercel --prod
else
    echo -e "${YELLOW}⚠ Deployment skipped - run manually${NC}"
fi
echo ""

# Post-deployment checks
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Post-Deployment Checklist            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo "  □ Verify staging is accessible"
echo "  □ Check health endpoint: /health"
echo "  □ Test login/logout"
echo "  □ Create a test document"
echo "  □ Test real-time collaboration"
echo "  □ Check Redis connection (in /health response)"
echo "  □ Monitor logs for errors"
echo ""
echo -e "${GREEN}✓ Staging deployment script completed!${NC}"
echo ""
echo -e "${BLUE}Staging URL: https://staging.kollab.com${NC}"
echo -e "${BLUE}Health Check: https://staging.kollab.com/health${NC}"
echo ""

