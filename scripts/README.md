# Scripts Kollab - Guide d'Utilisation

Ce dossier contient les scripts de démarrage et d'arrêt pour le projet Kollab.

## Scripts Disponibles

### Scripts de Démarrage

#### Windows (PowerShell)
```powershell
# Démarrage normal (avec setup de la base de données)
.\scripts\start.ps1

# Démarrage rapide (skip le setup DB)
.\scripts\start.ps1 -SkipDbSetup
```

#### Linux/Mac (Bash)
```bash
# Démarrage normal (avec setup de la base de données)
./scripts/start.sh

# Démarrage rapide (skip le setup DB)
./scripts/start.sh --skip-db-setup
```

### Scripts d'Arrêt

#### Windows (PowerShell)
```powershell
.\scripts\stop.ps1
```

#### Linux/Mac (Bash)
```bash
./scripts/stop.sh
```

---

## Fonctionnalités

### Scripts Start

**Vérifications Automatiques :**
- ✅ Vérification des prérequis (Docker, Node.js, npm)
- ✅ Vérification que Docker est en cours d'exécution
- ✅ Vérification du répertoire de travail

**Démarrage des Services :**
1. **Services Docker** (avec healthcheck) :
   - PostgreSQL (obligatoire, timeout 45s)
   - Redis (optionnel, timeout 45s)
   - MeiliSearch (optionnel, timeout 45s)
   - Garage S3 (optionnel, timeout 45s avec healthcheck amélioré)

2. **Setup de la Base de Données** :
   - Exécution automatique des migrations
   - Peut être skippé avec l'option `--skip-db-setup`

3. **Nettoyage des Ports** :
   - Arrêt automatique des processus Node.js sur les ports 3000, 4000, 3001
   - Vérification que les ports sont libres avant de démarrer

4. **Serveurs Node.js** :
   - API Backend (port 4000) en arrière-plan
   - Frontend Web (port 3000) en premier plan

**Résumé au Démarrage :**
```
================================================
  KOLLAB - Tous les services sont demarres!
================================================

Services Web:
  Frontend: http://localhost:3000
  API:      http://localhost:4000
  Health:   http://localhost:4000/health

Services Docker:
  PostgreSQL:  localhost:5432
  Redis:       localhost:6379
  MeiliSearch: http://localhost:7700
  Garage S3:   http://localhost:3900

Outils d'administration:
  pgAdmin:     http://localhost:8080
  RedisInsight: http://localhost:8081
```

### Scripts Stop

**Arrêt Automatique :**
1. **Processus Node.js** :
   - Détection et arrêt des processus sur les ports 3000, 4000, 3001
   - Vérification que seuls les processus Node.js/tsx sont arrêtés

2. **Conteneurs Docker** :
   - Arrêt de tous les conteneurs Kollab
   - Support de `docker-compose` et `docker compose`
   - Vérification post-arrêt

**Statistiques Finales :**
```
================================================
  KOLLAB - Arret termine
================================================

Statistiques:
  Processus Node.js arretes: 2
  Conteneurs Docker arretes: 5

Tous les services Kollab ont ete arretes
```

---

## Options Avancées

### Option --skip-db-setup

L'option `--skip-db-setup` permet de redémarrer rapidement l'application sans réexécuter les migrations de la base de données.

**Quand l'utiliser :**
- ✅ Redémarrage après un crash
- ✅ Développement rapide sans changements de schéma
- ✅ Tests répétés

**Quand NE PAS l'utiliser :**
- ❌ Premier démarrage du projet
- ❌ Après un `git pull` avec nouvelles migrations
- ❌ Après des changements dans le schéma de la base de données

**Exemple d'utilisation :**
```powershell
# Windows - Premier démarrage
.\scripts\start.ps1

# Windows - Redémarrages suivants
.\scripts\start.ps1 -SkipDbSetup

# Linux/Mac - Premier démarrage
./scripts/start.sh

# Linux/Mac - Redémarrages suivants
./scripts/start.sh --skip-db-setup
```

---

## Timeouts et Healthchecks

### Garage S3 (Optimisé)

Le healthcheck de Garage a été optimisé pour un démarrage fiable :

- **start_period:** 30s (temps d'initialisation)
- **interval:** 15s (fréquence de vérification)
- **timeout:** 5s (temps d'attente par vérification)
- **retries:** 5 (tentatives avant échec)

**Méthodes de vérification (dans l'ordre) :**
1. HTTP check sur `http://localhost:3900/` (rapide)
2. Docker healthcheck status (moyen)
3. Garage status command (lent, fallback)

### Autres Services

- **PostgreSQL:** 45s max (vérification avec `pg_isready`)
- **Redis:** 45s max (vérification avec `redis-cli ping`)
- **MeiliSearch:** 45s max (vérification avec endpoint `/health`)
- **API Backend:** 60s max (vérification avec endpoint `/health`)

---

## Troubleshooting

### "Docker n'est pas en cours d'execution"

**Solution :**
```bash
# Démarrer Docker Desktop (Windows/Mac)
# Ou sur Linux :
sudo systemctl start docker
```

### "Le port XXX est encore utilisé"

**Solution manuelle (Windows) :**
```powershell
# Trouver le processus
netstat -ano | findstr :3000

# Arrêter le processus (remplacer PID)
Stop-Process -Id <PID> -Force
```

**Solution manuelle (Linux/Mac) :**
```bash
# Trouver et arrêter le processus
lsof -ti:3000 | xargs kill -9
```

### "PostgreSQL n'est pas pret apres 45s"

**Solutions :**
1. Vérifier que le conteneur est démarré : `docker ps | grep postgres`
2. Vérifier les logs : `docker logs kollab-postgres`
3. Redémarrer Docker Desktop
4. Nettoyer les volumes : `docker-compose down -v` puis redémarrer

### "Garage n'est pas pret apres 45s"

C'est un **avertissement**, pas une erreur. Garage continue de démarrer en arrière-plan.

**Vérifications :**
```bash
# Vérifier les logs
docker logs kollab-garage

# Vérifier le status manuellement
docker exec kollab-garage /garage status

# Tester l'accès HTTP
curl http://localhost:3900/
```

**Si Garage ne démarre jamais :**
1. Vérifier la configuration : `cat garage.toml`
2. Vérifier les volumes : `docker volume ls | grep garage`
3. Réinitialiser Garage : voir `DEPLOYMENT_GUIDE.md`

### "Erreur lors du setup de la base de donnees"

**Solutions :**
1. Vérifier le fichier `.env` dans `apps/api/`
2. Vérifier la variable `DATABASE_URL`
3. Vérifier que PostgreSQL est accessible
4. Voir les détails de l'erreur dans la sortie du script

---

## Développement

### Modifier les Scripts

**Structure des scripts :**
```
scripts/
├── start.ps1          # Windows (PowerShell)
├── start.sh           # Linux/Mac (Bash)
├── stop.ps1           # Windows (PowerShell)
├── stop.sh            # Linux/Mac (Bash)
└── README.md          # Ce fichier
```

**Bonnes pratiques :**
- Maintenir la parité entre `.ps1` et `.sh`
- Toujours tester sur Windows ET Linux/Mac
- Documenter les nouvelles options
- Mettre à jour le CHANGELOG

### Ajouter un Nouveau Service

1. Ajouter le service dans `docker-compose.yml`
2. Ajouter une fonction de healthcheck dans `start.ps1` et `start.sh`
3. Ajouter la vérification dans la boucle principale
4. Mettre à jour le résumé final
5. Documenter dans ce README

---

## Logs et Débogage

### Voir les Logs en Temps Réel

**API Backend :**
```bash
# Windows
type C:\Users\<USER>\AppData\Local\Temp\kollab-api.log

# Linux/Mac
tail -f /tmp/kollab-api.log
```

**Services Docker :**
```bash
docker logs -f kollab-postgres
docker logs -f kollab-redis
docker logs -f kollab-meilisearch
docker logs -f kollab-garage
```

**Tous les services :**
```bash
docker-compose logs -f
```

### Mode Verbeux

Pour plus de détails, vous pouvez modifier les scripts :

**Windows :**
```powershell
# Au début du script start.ps1
$VerbosePreference = "Continue"
```

**Linux/Mac :**
```bash
# Au début du script start.sh
set -x  # Active le mode debug
```

---

## Performances

### Temps de Démarrage Typiques

| Étape | Temps Normal | Avec --skip-db-setup |
|-------|--------------|----------------------|
| Docker Services | 20-30s | 20-30s |
| DB Setup | 10-15s | 0s (skipped) |
| Port Cleanup | 1-2s | 1-2s |
| API Start | 5-10s | 5-10s |
| Web Start | 5-10s | 5-10s |
| **TOTAL** | **41-67s** | **31-52s** |

*Note : Garage peut prendre jusqu'à 45s pour être complètement prêt, mais l'application démarre pendant ce temps.*

### Optimisations

Les scripts incluent plusieurs optimisations :
- Vérifications en parallèle des services Docker
- Healthchecks optimisés (méthodes multiples)
- Timeouts adaptés à chaque service
- Skip optionnel du setup DB
- Nettoyage automatique des ports

---

## Support

Pour toute question ou problème :
1. Consulter ce README
2. Consulter `DEPLOYMENT_GUIDE.md`
3. Vérifier les logs des services
4. Consulter `TROUBLESHOOTING.md` (si disponible)

---

**Version:** 2.0.22  
**Dernière mise à jour:** 19 novembre 2025

