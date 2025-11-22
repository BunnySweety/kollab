# Variables d'Environnement - API

Ce fichier liste toutes les variables d'environnement nécessaires pour l'API Kollab.

Créez un fichier `.env` dans `apps/api/` avec ces variables :

```env
# ============================================
# Server Configuration
# ============================================
NODE_ENV=development
PORT=4000
WEBSOCKET_PORT=3001

# ============================================
# Database
# ============================================
DATABASE_URL=postgresql://postgres:password@localhost:5432/kollab

# ============================================
# Redis
# ============================================
REDIS_URL=redis://localhost:6379

# ============================================
# Authentication
# ============================================
# Generate a secure random string: openssl rand -hex 32
AUTH_SECRET=your-super-secret-auth-key-minimum-32-characters-long

# Session expiration in days (default: 30, range: 1-365)
# Sessions will automatically expire after this period for security
SESSION_EXPIRY_DAYS=30

# ============================================
# Frontend / CORS
# ============================================
FRONTEND_URL=http://localhost:3000
PUBLIC_API_URL=http://localhost:4000

# ============================================
# Garage (S3-compatible Storage)
# ============================================
# REQUIRED: Garage credentials (no defaults for security)
GARAGE_ENDPOINT=http://localhost:3900
GARAGE_ACCESS_KEY_ID=your-garage-access-key-id
GARAGE_SECRET_ACCESS_KEY=your-garage-secret-access-key
GARAGE_BUCKET=kollab
GARAGE_REGION=garage

# Maximum upload size in bytes (default: 10MB = 10485760)
MAX_UPLOAD_SIZE_BYTES=10485760

# ============================================
# MeiliSearch (Optional)
# ============================================
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=your-meilisearch-master-key

# ============================================
# Demo Mode Configuration
# ============================================
# Enable demo mode to automatically seed demo data on startup
# When enabled, creates demo user (demo@kollab.app / Demo123456!), workspace, columns, tags, and tasks
# Set to 'true' to enable, 'false' to disable
# All demo data uses hardcoded default values - no additional configuration needed
ENABLE_DEMO_MODE=false

# ============================================
# Email (Optional - for future notifications)
# ============================================
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=noreply@example.com
# SMTP_PASSWORD=your-smtp-password
```

## Variables Requises

### Obligatoires
- `DATABASE_URL` : URL de connexion PostgreSQL
- `AUTH_SECRET` : Secret pour l'authentification (minimum 32 caractères)
- `GARAGE_ACCESS_KEY_ID` : Access Key ID pour Garage (obligatoire pour l'upload)
- `GARAGE_SECRET_ACCESS_KEY` : Secret Access Key pour Garage (obligatoire pour l'upload)

### Optionnelles avec valeurs par défaut
- `PORT` : Port du serveur API (défaut: 4000)
- `WEBSOCKET_PORT` : Port WebSocket (défaut: 3001)
- `REDIS_URL` : URL Redis (défaut: redis://localhost:6379)
- `FRONTEND_URL` : URL du frontend pour CORS (défaut: http://localhost:3000)
- `PUBLIC_API_URL` : URL publique de l'API (défaut: http://localhost:4000)
- `GARAGE_ENDPOINT` : Endpoint Garage (défaut: http://localhost:3900)
- `GARAGE_BUCKET` : Nom du bucket Garage (défaut: kollab)
- `GARAGE_REGION` : Région Garage (défaut: garage)
- `MAX_UPLOAD_SIZE_BYTES` : Taille max upload (défaut: 10MB)

## Documentation

Pour plus de détails, consultez :
- `DEMO_MODE.md` : Configuration du mode demo
- `GARAGE_CONFIG.md` : Configuration Garage/S3

