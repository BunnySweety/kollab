# Quick Start - Kollab

**Temps de setup**: ~5 minutes  
**Prérequis**: Node.js 20+, Docker, npm

---

## Quick Setup (5 minutes)

### 1. Installation (2 min)

```bash
# Cloner le repo
git clone https://github.com/BunnySweety/kollab.git
cd kollab

# Installer les dépendances
npm run install:all
```

### 2. Configuration (1 min)

```bash
# Créer les fichiers d'environnement
# Consultez apps/api/ENV_VARIABLES.md et apps/web/ENV_VARIABLES.md pour la liste complète
# Les valeurs par défaut fonctionnent pour le développement local !
# 
# Minimum requis pour démarrer :
# - apps/api/.env : DATABASE_URL, AUTH_SECRET, GARAGE_ACCESS_KEY_ID, GARAGE_SECRET_ACCESS_KEY
# - apps/web/.env : VITE_API_URL
```

### 3. Démarrage (2 min)

```bash
# Démarrer PostgreSQL + Redis avec Docker
npm run docker:up

# Attendre que les services soient prêts (5-10 secondes)
# Initialiser la base de données
npm run db:setup

# Démarrer l'application (API + Web)
npm run dev
```

### 4. Accès

```
- Web App:       http://localhost:3000
- API:           http://localhost:4000
- Health Check:  http://localhost:4000/health
- pgAdmin:       http://localhost:8080 (PostgreSQL GUI)
- RedisInsight:  http://localhost:8081 (Redis GUI)
```

**C'est tout ! Votre application est prête ! 🎉**

---

## 📋 Commandes Utiles

### Développement

```bash
# Démarrer tout (Docker + API + Web)
npm run dev

# Démarrer seulement les services Docker
npm run docker:up

# Arrêter les services Docker
npm run docker:down

# Voir les logs Docker
npm run docker:logs

# Redémarrer les services
npm run docker:restart
```

### Base de Données

```bash
# Ouvrir Drizzle Studio (GUI)
npm run db:studio

# Exécuter les migrations
npm run db:migrate

# Charger les données de démo
npm run db:seed

# Reset complet de la DB
npm run db:reset
```

### Redis

```bash
# Ouvrir Redis CLI
npm run redis:cli

# Vider le cache Redis
npm run redis:flush

# Voir les stats Redis
npm run redis:info
```

### Build & Tests

```bash
# Build production
npm run build

# Linter
npm run lint

# Tests (quand implémentés)
npm run test
```

---

## Advanced Configuration

### Variables d'Environnement

#### API (`apps/api/.env`)

```bash
# Database (fourni par Docker)
DATABASE_URL=postgres://kollab:kollab_dev_password@localhost:5432/kollab_dev

# Redis (fourni par Docker)
REDIS_URL=redis://localhost:6379

# Server
PORT=4000
WEBSOCKET_PORT=3001
NODE_ENV=development

# Frontend (pour CORS)
FRONTEND_URL=http://localhost:3000

# MeiliSearch (optionnel)
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=kollab_dev_master_key
```

#### Web (`apps/web/.env`)

```bash
# API URL
VITE_API_URL=http://localhost:4000
```

### Ports Utilisés

| Service | Port | Description |
|---------|------|-------------|
| Web App | 3000 | SvelteKit frontend |
| API | 4000 | Hono backend |
| WebSocket | 3001 | Real-time collaboration |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache |
| MeiliSearch | 7700 | Search engine |
| pgAdmin | 8080 | PostgreSQL GUI |
| RedisInsight | 8081 | Redis GUI |

### Changer les Ports

Si un port est déjà utilisé, modifiez dans :
- `docker-compose.yml` : Ports Docker
- `apps/api/.env` : PORT, WEBSOCKET_PORT
- `apps/web/.env` : VITE_API_URL

---

## Troubleshooting

### Docker ne démarre pas

```bash
# Vérifier Docker est lancé
docker ps

# Nettoyer et redémarrer
npm run docker:clean
npm run docker:up
```

### Erreur "Port already in use"

```bash
# Trouver le processus
lsof -i :4000  # macOS/Linux
netstat -ano | findstr :4000  # Windows

# Tuer le processus ou changer le port
```

### Base de données vide

```bash
# Reset et reseed
npm run db:reset
```

### Redis ne répond pas

```bash
# Redémarrer Redis
docker-compose restart redis

# Vérifier Redis est accessible
npm run redis:cli
> PING  # Should return "PONG"
```

### Cache problématique

```bash
# Vider le cache Redis
npm run redis:flush

# Nettoyer cache build
npm run clean:cache
```

---

## 📚 Prochaines Étapes

### Pour les Développeurs

1. **Read the documentation**:
   - `TRAVAIL_ACCOMPLI_FINAL.md` - Vue d'ensemble complète
   - `MIGRATION_API_CLIENT_COMPLETE.md` - Architecture API
   - `CSRF_PROTECTION_IMPLEMENTED.md` - Sécurité CSRF
   - `REDIS_CACHE_IMPLEMENTED.md` - Système de cache
   - `CICD_CONFIGURATION_COMPLETE.md` - CI/CD

2. **Configure your IDE**:
   - Installer ESLint extension
   - Installer TypeScript extension
   - Configurer Prettier (optionnel)

3. 🧪 **Contribuer**:
   - Créer une branche: `git checkout -b feature/ma-feature`
   - Faire vos modifications
   - Tester localement
   - Commit + Push
   - Créer une Pull Request

### Pour le Déploiement

1. **Staging Deployment**:
   - Voir `CICD_CONFIGURATION_COMPLETE.md`
   - Configurer GitHub secrets
   - Push vers branch `develop`

2. **Production Deployment**:
   - Lire `DEPLOYMENT_GUIDE.md`
   - Configurer Redis en production
   - Configurer PostgreSQL en production
   - Push vers branch `main` (avec approval)

---

## Development Tips

### Performance Optimale

```bash
# Utiliser seulement les services nécessaires
docker-compose up -d postgres redis  # Minimum requis

# Sans MeiliSearch si search pas nécessaire
docker-compose up -d postgres redis
```

### Debug

```bash
# Voir les logs API en temps réel
cd apps/api && npm run dev

# Voir les logs Web en temps réel
cd apps/web && npm run dev

# Logs Docker
npm run docker:logs
```

### Workflow Recommandé

1. **Matin**: `npm run docker:up` + `npm run dev`
2. **Développement**: Modifier le code, hot-reload automatique
3. **Test**: Vérifier dans le navigateur
4. **Commit**: `git add .` + `git commit -m "feat: ..."`
5. **Soir**: `npm run docker:down` (optionnel, peut rester actif)

---

## First Launch Checklist

- [ ] Node.js 20+ installé (`node --version`)
- [ ] Docker installé et lancé (`docker ps`)
- [ ] npm 10+ installé (`npm --version`)
- [ ] Port 3000, 4000, 5432, 6379 libres
- [ ] Dépendances installées (`npm run install:all`)
- [ ] Fichiers .env copiés
- [ ] Docker services démarrés (`npm run docker:up`)
- [ ] Database initialisée (`npm run db:setup`)
- [ ] Application lancée (`npm run dev`)
- [ ] Navigateur ouvert sur http://localhost:3000
- [ ] Compte créé (register)
- [ ] Premier document créé
- [ ] **🎉 Ça marche !**

---

## 🆘 Support

### Documentation

- `TRAVAIL_ACCOMPLI_FINAL.md` - Vue d'ensemble
- `QUICK_START.md` - Ce guide (démarrage rapide)
- `DEPLOYMENT_GUIDE.md` - Guide déploiement complet
- Dossier `apps/api/` - Documentation backend
- Dossier `apps/web/` - Documentation frontend

### Problèmes Courants

1. **"Cannot connect to database"**
   → Vérifier Docker: `docker ps | grep postgres`

2. **"Redis connection failed"**
   → Vérifier Docker: `docker ps | grep redis`
   → Note: App fonctionne sans Redis (juste plus lent)

3. **"Port 4000 already in use"**
   → Changer PORT dans `apps/api/.env`

4. **"Module not found"**
   → Réinstaller: `npm run install:all`

### Logs & Debug

```bash
# Logs API
cd apps/api && npm run dev

# Logs Web  
cd apps/web && npm run dev

# Logs Docker
docker-compose logs -f

# Logs PostgreSQL
docker-compose logs -f postgres

# Logs Redis
docker-compose logs -f redis
```

---

## 🎓 Ressources

### Technos Utilisées

- **Backend**: Hono, TypeScript, Drizzle ORM, Lucia Auth
- **Frontend**: SvelteKit, TypeScript, TailwindCSS
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Search**: MeiliSearch (optionnel)
- **Real-time**: Socket.io, Yjs
- **CI/CD**: GitHub Actions

### Documentation Externe

- [Hono Documentation](https://hono.dev/)
- [SvelteKit Docs](https://kit.svelte.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Redis Commands](https://redis.io/commands/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)

---

**Happy coding!**

*Last updated: 13 novembre 2025*
