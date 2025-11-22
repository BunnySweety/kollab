#!/bin/bash
# Script de demarrage simplifie pour Linux/Mac
# Usage: ./scripts/start.sh [--skip-db-setup]
#
# Options:
#   --skip-db-setup : Skip le setup de la base de donnees (pour redemarrages rapides)

set -e  # Exit on error

# Parse arguments
SKIP_DB_SETUP=false
for arg in "$@"; do
    case $arg in
        --skip-db-setup)
        SKIP_DB_SETUP=true
        shift
        ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

check_prerequisite() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Erreur: $2 n'est pas installe ou n'est pas dans le PATH${NC}"
        echo -e "${YELLOW}   Veuillez installer $2 avant de continuer${NC}"
        exit 1
    fi
}

wait_for_service() {
    local service_name=$1
    local max_wait=${2:-30}
    local waited=0
    
    echo -e "${YELLOW}Attente de $service_name...${NC}"
    while [ $waited -lt $max_wait ]; do
        if [ "$service_name" = "PostgreSQL" ]; then
            if docker exec kollab-postgres pg_isready -U kollab &> /dev/null; then
                echo -e "${GREEN}$service_name est pret${NC}"
                return 0
            fi
        elif [ "$service_name" = "Redis" ]; then
            if docker exec kollab-redis redis-cli ping &> /dev/null | grep -q "PONG"; then
                echo -e "${GREEN}$service_name est pret${NC}"
                return 0
            fi
        elif [ "$service_name" = "MeiliSearch" ]; then
            if curl -s http://localhost:7700/health &> /dev/null; then
                echo -e "${GREEN}$service_name est pret${NC}"
                return 0
            fi
        elif [ "$service_name" = "API" ]; then
            if curl -s http://localhost:4000/health &> /dev/null; then
                echo -e "${GREEN}$service_name est pret${NC}"
                return 0
            fi
        elif [ "$service_name" = "Garage" ]; then
            # Méthode 1: HTTP check rapide
            if curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3900/ | grep -qE "^(200|403|404)$"; then
                echo -e "${GREEN}$service_name est pret (HTTP accessible)${NC}"
                return 0
            fi
            # Méthode 2: Docker healthcheck
            HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' kollab-garage 2>/dev/null || echo "none")
            if [ "$HEALTH_STATUS" = "healthy" ]; then
                echo -e "${GREEN}$service_name est pret (healthcheck)${NC}"
                return 0
            fi
        fi
        sleep 1
        waited=$((waited + 1))
    done
    echo -e "${RED}Timeout: $service_name n'est pas pret apres ${max_wait}s${NC}"
    return 1
}

echo -e "${CYAN}Demarrage de Kollab...${NC}"
echo ""

# Verifier les prerequis
echo -e "${YELLOW}Verification des prerequis...${NC}"
check_prerequisite "docker" "Docker"
check_prerequisite "node" "Node.js"
check_prerequisite "npm" "npm"

# Verifier que Docker est en cours d'execution
if ! docker info &> /dev/null; then
    echo -e "${RED}Erreur: Docker n'est pas en cours d'execution${NC}"
    echo -e "${YELLOW}   Veuillez demarrer Docker${NC}"
    exit 1
fi
echo -e "${GREEN}Prerequis OK${NC}"
echo ""

# Step 1: Demarrer Docker
echo -e "${YELLOW}Etape 1: Demarrage des services Docker...${NC}"
docker-compose up -d
if [ $? -ne 0 ]; then
    echo -e "${RED}Erreur lors du demarrage de Docker${NC}"
    exit 1
fi
echo -e "${GREEN}Docker demarre${NC}"
echo ""

# Step 2: Attendre que les services Docker soient prêts
echo -e "${YELLOW}Attente des services Docker...${NC}"

# Vérifier quels services existent
HAS_GARAGE=false
if docker ps --filter name=kollab-garage --format "{{.Names}}" | grep -q kollab-garage; then
    HAS_GARAGE=true
fi

HAS_REDIS=false
if docker ps --filter name=kollab-redis --format "{{.Names}}" | grep -q kollab-redis; then
    HAS_REDIS=true
fi

HAS_MEILI=false
if docker ps --filter name=kollab-meilisearch --format "{{.Names}}" | grep -q kollab-meilisearch; then
    HAS_MEILI=true
fi

# Vérifier les services en parallèle
POSTGRES_READY=false
REDIS_READY=$([[ "$HAS_REDIS" = false ]] && echo "true" || echo "false")
MEILI_READY=$([[ "$HAS_MEILI" = false ]] && echo "true" || echo "false")
GARAGE_READY=$([[ "$HAS_GARAGE" = false ]] && echo "true" || echo "false")
MAX_WAIT=45  # Augmenté de 30s à 45s pour Garage
WAITED=0

while [ $WAITED -lt $MAX_WAIT ] && ([ "$POSTGRES_READY" = false ] || [ "$REDIS_READY" = false ] || [ "$MEILI_READY" = false ] || [ "$GARAGE_READY" = false ]); do
    # Vérifier PostgreSQL (obligatoire)
    if [ "$POSTGRES_READY" = false ]; then
        if docker exec kollab-postgres pg_isready -U kollab &> /dev/null; then
            echo -e "${GREEN}PostgreSQL est pret${NC}"
            POSTGRES_READY=true
        fi
    fi
    
    # Vérifier Redis (si présent)
    if [ "$HAS_REDIS" = true ] && [ "$REDIS_READY" = false ]; then
        if docker exec kollab-redis redis-cli ping 2>&1 | grep -q "PONG"; then
            echo -e "${GREEN}Redis est pret${NC}"
            REDIS_READY=true
        fi
    fi
    
    # Vérifier MeiliSearch (si présent)
    if [ "$HAS_MEILI" = true ] && [ "$MEILI_READY" = false ]; then
        if curl -s http://localhost:7700/health &> /dev/null; then
            echo -e "${GREEN}MeiliSearch est pret${NC}"
            MEILI_READY=true
        fi
    fi
    
    # Vérifier Garage (si présent)
    if [ "$HAS_GARAGE" = true ] && [ "$GARAGE_READY" = false ]; then
        # Méthode 1: HTTP check rapide
        if curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3900/ | grep -qE "^(200|403|404)$"; then
            echo -e "${GREEN}Garage est pret (HTTP accessible)${NC}"
            GARAGE_READY=true
        else
            # Méthode 2: Docker healthcheck
            HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' kollab-garage 2>/dev/null || echo "none")
            if [ "$HEALTH_STATUS" = "healthy" ]; then
                echo -e "${GREEN}Garage est pret (healthcheck: healthy)${NC}"
                GARAGE_READY=true
            fi
        fi
    fi
    
    sleep 1
    WAITED=$((WAITED + 1))
done

# Vérifier les résultats
if [ "$POSTGRES_READY" = false ]; then
    echo -e "${RED}Erreur: PostgreSQL n'est pas pret apres ${MAX_WAIT}s${NC}"
    exit 1
fi

if [ "$HAS_REDIS" = true ] && [ "$REDIS_READY" = false ]; then
    echo -e "${YELLOW}Avertissement: Redis n'est pas pret, mais on continue${NC}"
fi

if [ "$HAS_MEILI" = true ] && [ "$MEILI_READY" = false ]; then
    echo -e "${YELLOW}Avertissement: MeiliSearch n'est pas pret, mais on continue${NC}"
fi

if [ "$HAS_GARAGE" = true ] && [ "$GARAGE_READY" = false ]; then
    echo -e "${YELLOW}Avertissement: Garage n'est pas pret apres ${MAX_WAIT}s, mais on continue${NC}"
    echo -e "${YELLOW}   Garage peut encore demarrer en arriere-plan${NC}"
fi

echo ""

# Step 3: Setup de la base de donnees
if [ "$SKIP_DB_SETUP" = true ]; then
    echo -e "Etape 3: Configuration de la base de donnees... [SKIP]"
    echo ""
else
    echo -e "${YELLOW}Etape 3: Configuration de la base de donnees...${NC}"
    ORIGINAL_DIR=$(pwd)
    cd apps/api

    # Verifier que le fichier .env existe
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}Avertissement: Fichier .env non trouve dans apps/api/${NC}"
        echo -e "${YELLOW}   Veuillez creer le fichier .env avec les variables requises${NC}"
        echo -e "${YELLOW}   Voir apps/api/ENV_VARIABLES.md pour plus d'informations${NC}"
    fi

    npm run db:setup
    if [ $? -ne 0 ]; then
        echo -e "${RED}Erreur lors du setup de la base de donnees${NC}"
        cd "$ORIGINAL_DIR"
        exit 1
    fi
    cd "$ORIGINAL_DIR"
    echo -e "${GREEN}Base de donnees configuree${NC}"
    echo ""
fi

# Step 4: Verifier et arreter les processus existants
echo -e "${YELLOW}Etape 4: Verification des ports...${NC}"

stop_process_on_port() {
    local port=$1
    local service_name=$2
    
    # Trouver le PID du processus utilisant le port
    local pid=$(lsof -ti:$port 2>/dev/null || fuser $port/tcp 2>/dev/null | awk '{print $1}' || echo "")
    
    if [ ! -z "$pid" ]; then
        # Verifier que c'est un processus Node.js
        if ps -p $pid > /dev/null 2>&1; then
            local process_name=$(ps -p $pid -o comm= 2>/dev/null || echo "")
            if [[ "$process_name" == *"node"* ]] || [[ "$process_name" == *"tsx"* ]]; then
                echo -e "${YELLOW}  Arret du processus sur le port $port ($service_name, PID: $pid)${NC}"
                kill -9 $pid 2>/dev/null || true
            fi
        fi
    fi
}

# Arreter les processus existants sur les ports Kollab
stop_process_on_port 3000 "Web"
stop_process_on_port 4000 "API"
stop_process_on_port 3001 "WebSocket"

# Attendre un peu pour que les ports soient liberes
sleep 1
echo ""

# Step 5: Demarrer les serveurs
echo -e "${YELLOW}Etape 5: Demarrage des serveurs...${NC}"
echo -e "   ${CYAN}API: http://localhost:4000${NC}"
echo -e "   ${CYAN}Web: http://localhost:3000${NC}"
echo ""

# Demarrer l'API en arriere-plan
echo -e "${YELLOW}Demarrage de l'API...${NC}"
cd apps/api
npm run dev > /tmp/kollab-api.log 2>&1 &
API_PID=$!
cd "$ORIGINAL_DIR"

# Attendre que l'API soit pret
sleep 2
if ! wait_for_service "API" 60; then
    echo -e "${YELLOW}Avertissement: L'API n'est pas pret apres 60 secondes${NC}"
    echo -e "${YELLOW}   Verifiez les logs: tail -f /tmp/kollab-api.log${NC}"
    echo -e "${YELLOW}   L'API pourrait toujours demarrer, mais il y a peut-etre un probleme${NC}"
else
    echo -e "${GREEN}API demarree avec succes${NC}"
fi

echo ""
echo -e "${YELLOW}Demarrage du serveur web...${NC}"

# Afficher le résumé des services
echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  KOLLAB - Tous les services sont demarres!   ${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""
echo -e "${YELLOW}Services Web:${NC}"
echo -e "  ${GREEN}Frontend: http://localhost:3000${NC}"
echo -e "  ${GREEN}API:      http://localhost:4000${NC}"
echo -e "  ${GREEN}Health:   http://localhost:4000/health${NC}"
echo ""
echo -e "${YELLOW}Services Docker:${NC}"
echo -e "  ${GREEN}PostgreSQL:  localhost:5432${NC}"
if [ "$HAS_REDIS" = true ]; then echo -e "  ${GREEN}Redis:       localhost:6379${NC}"; fi
if [ "$HAS_MEILI" = true ]; then echo -e "  ${GREEN}MeiliSearch: http://localhost:7700${NC}"; fi
if [ "$HAS_GARAGE" = true ]; then echo -e "  ${GREEN}Garage S3:   http://localhost:3900${NC}"; fi
echo ""
echo -e "${YELLOW}Outils d'administration:${NC}"
echo -e "  pgAdmin:     http://localhost:8080"
echo -e "  RedisInsight: http://localhost:8081"
echo ""
echo -e "${YELLOW}Appuyez sur Ctrl+C pour arreter tous les serveurs${NC}"
echo ""

# Fonction de nettoyage
cleanup() {
    echo -e "\n${YELLOW}Arret des serveurs...${NC}"
    if [ ! -z "$API_PID" ]; then
        kill $API_PID 2>/dev/null
        echo -e "${GREEN}API arretee${NC}"
    fi
    exit 0
}

trap cleanup INT TERM

# Demarrer le web en premier plan (pour voir les logs)
cd apps/web
npm run dev

# Nettoyer si on sort
cleanup

