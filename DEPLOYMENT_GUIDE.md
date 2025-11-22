# 🚀 Guide de Déploiement - Kollab Application

**Version:** 0.1.0 (Post-Audit Sécurisé)
**Date:** 2025-11-08
**Status:** ✅ Prêt pour Production Beta

---

## 📋 PRÉ-REQUIS

### Services Requis
- **Node.js:** >= 20.0.0
- **pnpm:** >= 9.0.0
- **PostgreSQL:** >= 16
- **Redis:** >= 7
- **MeiliSearch:** >= 1.10
- **Garage:** >= 2.1.0 (S3-compatible storage)

### Ports par Défaut
- Frontend (SvelteKit): `3000`
- API Backend (Hono): `4000`
- WebSocket: `3001`
- PostgreSQL: `5432`
- Redis: `6379`
- MeiliSearch: `7700`
- Garage: `3900` (S3 API), `3901` (RPC), `3903` (Admin API)

---

## 🔧 CONFIGURATION ENVIRONNEMENT

### 1. Variables d'Environnement

Créez `.env` à la racine et dans `apps/api/`:

#### Root `.env`
```bash
# Node Environment
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:STRONG_PASSWORD@host:5432/kollab

# Redis
REDIS_URL=redis://host:6379

# Auth (IMPORTANT: Generate strong random string)
AUTH_SECRET=YOUR_SUPER_SECRET_KEY_MINIMUM_32_CHARS_RANDOM

# Frontend
FRONTEND_URL=https://app.yourdomain.com
PUBLIC_API_URL=https://api.yourdomain.com

# Storage (Garage/S3)
S3_ENDPOINT=https://s3.yourdomain.com
S3_ACCESS_KEY=YOUR_ACCESS_KEY
S3_SECRET_KEY=YOUR_SECRET_KEY
S3_BUCKET_NAME=kollab-files
S3_REGION=garage

# Search
MEILISEARCH_URL=https://search.yourdomain.com
MEILISEARCH_MASTER_KEY=YOUR_MEILISEARCH_KEY

# WebSocket
WEBSOCKET_PORT=3001

# Optional: Email (pour notifications futures)
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=YOUR_SMTP_PASSWORD
```

#### Frontend `.env` (`apps/web/.env`)
```bash
VITE_API_URL=https://api.yourdomain.com
```

### 2. Générer AUTH_SECRET Sécurisé

```bash
# Option 1: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: OpenSSL
openssl rand -hex 32

# Option 3: En ligne
# https://generate-secret.vercel.app/32
```

---

## 🐳 DÉPLOIEMENT DOCKER

### Option A: Docker Compose (Recommandé pour Dev/Staging)

```bash
# 1. Cloner le repo
git clone https://github.com/BunnySweety/kollab.git
cd kollab

# 2. Configurer les variables
cp .env.example .env
# Éditer .env avec vos valeurs

# 3. Démarrer tous les services
docker-compose up -d

# 4. Initialiser la base de données
pnpm install
pnpm db:push

# 5. (Optionnel) Charger les templates
pnpm db:seed

# 6. Vérifier les logs
docker-compose logs -f
```

### Option B: Production avec Services Externes

```bash
# 1. Build les applications
pnpm install
pnpm build

# 2. Démarrer l'API
cd apps/api
NODE_ENV=production node dist/index.js

# 3. Démarrer le Frontend (dans un autre terminal)
cd apps/web
node build/index.js
```

---

## ☁️ DÉPLOIEMENT CLOUD

### Vercel (Frontend)

```bash
# 1. Installer Vercel CLI
npm i -g vercel

# 2. Déployer
cd apps/web
vercel --prod

# 3. Configurer variables d'environnement dans Vercel Dashboard
# VITE_API_URL=https://api.yourdomain.com
```

### Railway / Render / Fly.io (Backend)

```bash
# 1. Créer Dockerfile pour l'API
# Voir apps/api/Dockerfile.example

# 2. Déployer
railway up
# ou
render deploy
# ou
fly deploy
```

### Conseils Cloud Spécifiques

#### **Vercel**
- ✅ Excellent pour le frontend SvelteKit
- ✅ Edge functions supportées
- ⚠️ Configuration: `apps/web/vercel.json`

#### **Railway**
- ✅ PostgreSQL inclus
- ✅ Redis inclus
- ✅ Variables d'env faciles

#### **Render**
- ✅ PostgreSQL managé
- ✅ Redis managé
- ✅ Déploiements automatiques

#### **Fly.io**
- ✅ Excellent pour WebSocket
- ✅ Multi-région
- ✅ PostgreSQL haute disponibilité

---

## 🗄️ CONFIGURATION BASE DE DONNÉES

### 1. Migrations Initiales

```bash
cd apps/api

# Générer les migrations
pnpm db:generate

# Appliquer les migrations
pnpm db:push

# Alternative: Utiliser migrate
pnpm db:migrate
```

### 2. Index Composites (Performance)

Les index suivants sont créés automatiquement:
- ✅ `workspace_members_workspace_user_idx`
- ✅ `tasks_workspace_status_idx`
- ✅ `tasks_project_status_idx`
- ✅ `notifications_recipient_read_idx`

Vérification:
```sql
-- Lister tous les index
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### 3. Connection Pooling

Configuration déjà optimisée dans `apps/api/src/db/index.ts`:
- **Max connections:** 20
- **Idle timeout:** 20s
- **Connection timeout:** 10s
- **Max lifetime:** 30 minutes

Pour environnements à fort trafic, ajustez:
```typescript
max: 50,  // Pour serveurs puissants
```

### 4. Backup Automatique

#### PostgreSQL
```bash
# Backup quotidien
0 2 * * * pg_dump -U postgres kollab > /backups/kollab_$(date +\%Y\%m\%d).sql

# Rétention 7 jours
0 3 * * * find /backups -name "kollab_*.sql" -mtime +7 -delete
```

#### Garage
```bash
# Backup des métadonnées et données
docker exec kollab-garage /garage stats
docker cp kollab-garage:/var/lib/garage/meta /backups/garage-meta_$(date +\%Y\%m\%d)
docker cp kollab-garage:/var/lib/garage/data /backups/garage-data_$(date +\%Y\%m\%d)
```

---

## 🗄️ CONFIGURATION GARAGE (S3)

### 1. Healthcheck Optimisé

Le healthcheck de Garage a été optimisé pour un démarrage fiable :

```yaml
healthcheck:
  # Check que l'API S3 répond - compatible Alpine
  test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3900/ || exit 1"]
  interval: 15s        # Vérification toutes les 15s (réduit la charge)
  timeout: 5s          # Timeout généreux pour éviter les faux positifs
  retries: 5           # 5 tentatives avant de marquer comme unhealthy
  start_period: 30s    # 30s de grâce pour l'initialisation complète
```

**Pourquoi ces valeurs ?**
- `start_period: 30s` : Garage nécessite du temps pour initialiser ses métadonnées et monter les volumes
- `interval: 15s` : Réduit la charge CPU tout en maintenant une surveillance adéquate
- `retries: 5` : Tolère les pics de charge temporaires pendant le démarrage
- `timeout: 5s` : Évite les faux négatifs sur les systèmes plus lents

### 2. Initialisation de Garage

Après le premier démarrage, initialiser Garage :

```bash
# 1. Vérifier le statut
docker exec kollab-garage /garage status

# 2. Créer le layout (si première installation)
docker exec kollab-garage /garage layout assign -z dc1 -c 1 <node-id>
docker exec kollab-garage /garage layout apply --version 1

# 3. Créer une clé d'accès
docker exec kollab-garage /garage key create kollab-key

# 4. Créer le bucket
docker exec kollab-garage /garage bucket create kollab-files

# 5. Permettre l'accès à la clé
docker exec kollab-garage /garage bucket allow --read --write kollab-files --key kollab-key

# 6. Récupérer les credentials
docker exec kollab-garage /garage key info kollab-key
# Noter: Access Key ID et Secret Access Key
```

### 3. Configuration de l'API

Mettre à jour `.env` avec les credentials Garage :

```bash
S3_ENDPOINT=http://localhost:3900
S3_ACCESS_KEY=<access-key-from-step-6>
S3_SECRET_KEY=<secret-key-from-step-6>
S3_BUCKET_NAME=kollab-files
S3_REGION=garage
```

### 4. Test de Connexion

```bash
# Vérifier la connexion S3
npm run test:garage

# Ou manuellement avec curl
curl -X PUT http://localhost:3900/kollab-files/test.txt \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -d "Hello Garage"
```

### 5. Monitoring Garage

```bash
# Stats en temps réel
docker exec kollab-garage /garage stats

# Vérifier l'état des nodes
docker exec kollab-garage /garage status

# Voir les buckets
docker exec kollab-garage /garage bucket list

# Voir les clés
docker exec kollab-garage /garage key list
```

### 6. Troubleshooting Garage

**Problème : Healthcheck échoue constamment**
```bash
# 1. Vérifier les logs
docker logs kollab-garage

# 2. Tester manuellement le port
docker exec kollab-garage wget -O- http://localhost:3900/

# 3. Vérifier que le serveur écoute
docker exec kollab-garage netstat -tlnp | grep 3900

# 4. Si nécessaire, augmenter start_period à 60s
```

**Problème : "Layout not configured"**
```bash
# Initialiser le layout (voir étape 2 ci-dessus)
docker exec kollab-garage /garage layout assign -z dc1 -c 1 <node-id>
docker exec kollab-garage /garage layout apply --version 1
```

**Problème : Upload échoue**
```bash
# Vérifier les permissions du bucket
docker exec kollab-garage /garage bucket info kollab-files

# Vérifier les permissions de la clé
docker exec kollab-garage /garage key info kollab-key

# Re-donner les permissions
docker exec kollab-garage /garage bucket allow --read --write kollab-files --key kollab-key
```

---

## 🔒 SÉCURITÉ PRODUCTION

### 1. Checklist Sécurité

- [ ] `AUTH_SECRET` généré aléatoirement (32+ chars)
- [ ] Mots de passe DB/Redis/Garage changés (pas de défaut)
- [ ] HTTPS/TLS activé partout
- [ ] CORS configuré strictement (`FRONTEND_URL` uniquement)
- [ ] Rate limiting actif (vérifier logs)
- [ ] Cookies `httpOnly` + `secure` + `sameSite=strict`
- [ ] Headers de sécurité configurés (voir ci-dessous)
- [ ] Firewall configuré (ports 4000, 3001 internes seulement)

### 2. Headers de Sécurité

Ajouter dans `apps/api/src/index.ts` (déjà partiellement fait):

```typescript
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  await next();
});
```

### 3. Content Security Policy

Pour le frontend (`apps/web/src/hooks.server.ts`):

```typescript
export async function handle({ event, resolve }) {
  const response = await resolve(event);

  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  );

  return response;
}
```

---

## 📊 MONITORING & LOGGING

### 1. Sentry (Recommandé)

```bash
# Installation
pnpm add @sentry/node @sentry/svelte

# Configuration API
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0
});
```

### 2. Logs Structurés

```bash
# Remplacer console.log par Winston/Pino
pnpm add pino pino-pretty

# apps/api/src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});
```

### 3. Métriques

```bash
# Prometheus + Grafana
pnpm add prom-client

# Exposer /metrics endpoint
import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.get('/metrics', (c) => {
  c.header('Content-Type', register.contentType);
  return c.text(register.metrics());
});
```

---

## 🧪 TESTS PRÉ-DÉPLOIEMENT

### 1. Tests de Sécurité

```bash
# A. Vérifier rate limiting
for i in {1..10}; do
  curl -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Devrait bloquer après la 5ème tentative (429 Too Many Requests)

# B. Tester exigences password
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"weak","name":"Test"}'
# Devrait rejeter (400 Bad Request)

# C. Tester mass assignment
curl -X PATCH http://localhost:4000/api/workspaces/test-workspace \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{"name":"Updated","createdBy":"malicious-uuid"}'
# Devrait update name mais pas createdBy
```

### 2. Tests de Performance

```bash
# Installation
npm i -g autocannon

# Test throughput API
autocannon -c 50 -d 30 http://localhost:4000/api/workspaces

# Résultats attendus:
# - Latency p99 < 500ms
# - Throughput > 500 req/sec
# - 0 erreurs
```

### 3. Tests de Connection Pooling

```sql
-- Pendant le test de charge, vérifier:
SELECT
  application_name,
  state,
  count(*)
FROM pg_stat_activity
WHERE application_name = 'kollab-api'
GROUP BY application_name, state;

-- Résultat attendu:
-- kollab-api | active | 10-20
-- Jamais > 20 connexions
```

---

## 🔄 MISE À JOUR / ROLLBACK

### Procédure de Mise à Jour

```bash
# 1. Backup DB
pg_dump kollab > backup_before_update.sql

# 2. Pull nouveau code
git pull origin main

# 3. Install dépendances
pnpm install

# 4. Run migrations
cd apps/api
pnpm db:migrate

# 5. Build
cd ../..
pnpm build

# 6. Restart services
pm2 restart kollab-api
pm2 restart kollab-web
```

### Rollback d'Urgence

```bash
# 1. Revert code
git reset --hard PREVIOUS_COMMIT

# 2. Rebuild
pnpm install
pnpm build

# 3. Restore DB (si nécessaire)
psql kollab < backup_before_update.sql

# 4. Restart
pm2 restart all
```

---

## 📱 HEALTHCHECKS

### Endpoints à Monitorer

```bash
# 1. API Health
GET /health
# Response: { "status": "ok", "timestamp": "..." }

# 2. Database
GET /health/db
# Response: { "database": "connected" }

# 3. Redis
GET /health/redis
# Response: { "redis": "connected" }

# 4. WebSocket
# Tester connection sur ws://host:3001
```

### Configuration UptimeRobot / Pingdom

```yaml
Monitors:
  - URL: https://api.yourdomain.com/health
    Interval: 5 minutes
    Expected: "ok"

  - URL: https://app.yourdomain.com
    Interval: 5 minutes
    Expected: 200 OK

  - URL: wss://api.yourdomain.com:3001
    Interval: 10 minutes
    Type: Port Monitor
```

---

## 🐛 TROUBLESHOOTING

### Problème: "DATABASE_URL is required"
**Solution:** Vérifier que `.env` est chargé
```bash
echo $DATABASE_URL  # Doit afficher l'URL
source .env
```

### Problème: "Too many connections"
**Solution:** Vérifier connection pooling
```typescript
// apps/api/src/db/index.ts
max: 20,  // Réduire si nécessaire
```

### Problème: Rate limiting trop strict
**Solution:** Ajuster limites
```typescript
// apps/api/src/middleware/rate-limiter.ts
maxRequests: 10,  // Augmenter si besoin
```

### Problème: WebSocket déconnexions fréquentes
**Solution:** Vérifier timeout reverse proxy
```nginx
# nginx.conf
proxy_read_timeout 600s;
proxy_send_timeout 600s;
```

---

## 📞 SUPPORT

### Logs à Fournir
```bash
# API Logs
pm2 logs kollab-api --lines 100

# Database Logs
tail -f /var/log/postgresql/postgresql-16-main.log

# System Resources
htop
df -h
free -m
```

### Informations Système
```bash
# Version
node --version
pnpm --version
psql --version

# Configuration
cat apps/api/package.json | grep version
git rev-parse HEAD
```

---

## ✅ CHECKLIST FINALE

Avant de marquer le déploiement comme réussi:

- [ ] Toutes les variables d'environnement configurées
- [ ] Base de données migrée et accessible
- [ ] Tests de sécurité passés (rate limiting, password policy)
- [ ] Performance acceptable (< 500ms p99)
- [ ] Monitoring configuré (Sentry, logs, métriques)
- [ ] Backups automatiques configurés
- [ ] HTTPS actif avec certificat valide
- [ ] DNS configuré correctement
- [ ] Documentation d'équipe mise à jour
- [ ] Plan de rollback testé

---

**🎉 Félicitations ! Votre instance Kollab est prête pour la production.**

Pour toute question: voir [SECURITY_FIXES_APPLIED.md](./SECURITY_FIXES_APPLIED.md) et [IMPROVEMENTS_COMPLETED.md](./IMPROVEMENTS_COMPLETED.md)
