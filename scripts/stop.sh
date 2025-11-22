#!/bin/bash
# Script d'arret simplifie pour Linux/Mac
# Usage: ./scripts/stop.sh

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}Arret de Kollab...${NC}"
echo ""

# Step 1: Arreter les processus Node.js sur les ports Kollab
echo -e "${YELLOW}Etape 1: Arret des processus Node.js Kollab...${NC}"

stop_process_on_port() {
    local port=$1
    local service_name=$2
    local stopped=false
    
    # Try multiple methods to find and kill process on port
    if command -v lsof &> /dev/null; then
        # Linux/Mac with lsof
        pid=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$pid" ]; then
            # Verify it's a node/tsx process
            process_name=$(ps -p $pid -o comm= 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo "")
            if echo "$process_name" | grep -qE "(node|tsx)"; then
                kill -9 $pid 2>/dev/null || true
                echo -e "  ${GREEN}Processus arrete sur le port $port ($service_name, PID: $pid, Process: $process_name)${NC}"
                stopped=true
            fi
        fi
    elif command -v fuser &> /dev/null; then
        # Linux with fuser
        pid=$(fuser $port/tcp 2>/dev/null | awk '{print $1}')
        if [ ! -z "$pid" ]; then
            process_name=$(ps -p $pid -o comm= 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo "")
            if echo "$process_name" | grep -qE "(node|tsx)"; then
                kill -9 $pid 2>/dev/null || true
                echo -e "  ${GREEN}Processus arrete sur le port $port ($service_name, PID: $pid, Process: $process_name)${NC}"
                stopped=true
            fi
        fi
    elif command -v netstat &> /dev/null; then
        # Fallback with netstat (works on most systems)
        pid=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | head -1)
        if [ ! -z "$pid" ] && [ "$pid" != "-" ]; then
            process_name=$(ps -p $pid -o comm= 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo "")
            if echo "$process_name" | grep -qE "(node|tsx)"; then
                kill -9 $pid 2>/dev/null || true
                echo -e "  ${GREEN}Processus arrete sur le port $port ($service_name, PID: $pid, Process: $process_name)${NC}"
                stopped=true
            fi
        fi
    fi
    
    if [ "$stopped" = true ]; then
        return 0
    fi
    return 1
}

ports_stopped=0

# Arreter les processus sur les ports Kollab
stop_process_on_port 3000 "Web" && ports_stopped=$((ports_stopped + 1))
stop_process_on_port 4000 "API" && ports_stopped=$((ports_stopped + 1))
stop_process_on_port 3001 "WebSocket" && ports_stopped=$((ports_stopped + 1))

# Attendre un peu pour que les processus se terminent
sleep 2

# Verifier si des processus sont encore en cours
remaining=""
for port in 3000 4000 3001; do
    has_process=false
    if command -v lsof &> /dev/null; then
        pid=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$pid" ]; then
            process_name=$(ps -p $pid -o comm= 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo "")
            if echo "$process_name" | grep -qE "(node|tsx)"; then
                has_process=true
            fi
        fi
    fi
    
    if [ "$has_process" = true ]; then
        case $port in
            3000) remaining="${remaining}Web (3000) " ;;
            4000) remaining="${remaining}API (4000) " ;;
            3001) remaining="${remaining}WebSocket (3001) " ;;
        esac
    fi
done

if [ -z "$remaining" ]; then
    if [ $ports_stopped -gt 0 ]; then
        echo -e "${GREEN}Tous les processus Kollab ont ete arretes${NC}"
    else
        echo -e "${GREEN}Aucun processus Kollab en cours d'execution${NC}"
    fi
else
    echo -e "${YELLOW}Avertissement: Les ports suivants sont encore utilises: ${remaining}${NC}"
    echo -e "  Vous pouvez les arreter manuellement si necessaire"
fi
echo ""

# Step 2: Arreter les services Docker
echo -e "${YELLOW}Etape 2: Arret des services Docker...${NC}"

# Compter les conteneurs avant l'arrêt
containers_before=$(docker ps --filter "name=kollab-" --format "{{.Names}}" 2>/dev/null | wc -l)
docker_stopped=0

if docker-compose down 2>/dev/null; then
    docker_stopped=$containers_before
    echo -e "${GREEN}Services Docker arretes ($docker_stopped conteneur(s))${NC}"
else
    # Essayer avec "docker compose" (nouvelle syntaxe)
    if docker compose down 2>/dev/null; then
        docker_stopped=$containers_before
        echo -e "${GREEN}Services Docker arretes ($docker_stopped conteneur(s))${NC}"
    else
        echo -e "${YELLOW}Avertissement: Erreur lors de l'arret des services Docker${NC}"
        echo -e "  Certains conteneurs peuvent encore etre en cours d'arret"
    fi
fi

# Vérifier qu'ils sont vraiment arrêtés
sleep 2
containers_after=$(docker ps --filter "name=kollab-" --format "{{.Names}}" 2>/dev/null)
if [ ! -z "$containers_after" ]; then
    containers_count=$(echo "$containers_after" | wc -l)
    echo -e "${YELLOW}   Avertissement: $containers_count conteneur(s) encore en cours${NC}"
    echo "$containers_after" | while read container; do
        echo -e "     - $container"
    done
fi

echo ""

# Résumé final
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  KOLLAB - Arret termine${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""
echo -e "${YELLOW}Statistiques:${NC}"
if [ $ports_stopped -gt 0 ]; then
    echo -e "  ${GREEN}Processus Node.js arretes: $ports_stopped${NC}"
else
    echo -e "  Processus Node.js arretes: $ports_stopped"
fi
if [ $docker_stopped -gt 0 ]; then
    echo -e "  ${GREEN}Conteneurs Docker arretes: $docker_stopped${NC}"
else
    echo -e "  Conteneurs Docker arretes: $docker_stopped"
fi
echo ""
echo -e "${GREEN}Tous les services Kollab ont ete arretes${NC}"
echo ""

