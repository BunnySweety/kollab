# Configuration Garage (S3-compatible Storage)

Ce document décrit les variables d'environnement nécessaires pour configurer Garage, le stockage S3-compatible utilisé par Kollab.

## Variables d'environnement requises

### Credentials (obligatoires)

```env
# Access Key ID pour Garage
GARAGE_ACCESS_KEY_ID=GK71665a025dbc2130e74c50fb

# Secret Access Key pour Garage
GARAGE_SECRET_ACCESS_KEY=99799ac0b355d7d3f6f77ff8f4bd3e67a7b1dc6813024b9f0b1f5b24efcc8c89
```

**Important** : Ces credentials sont obligatoires. Sans eux, les fonctionnalités d'upload de fichiers seront désactivées.

### Configuration (optionnelles)

```env
# Endpoint Garage (par défaut: http://localhost:3900 en dev, http://garage:3900 en prod)
GARAGE_ENDPOINT=http://localhost:3900

# Nom du bucket (par défaut: kollab)
GARAGE_BUCKET=kollab

# Région Garage (par défaut: garage)
GARAGE_REGION=garage

# URL publique de l'API pour générer les URLs de proxy (par défaut: http://localhost:4000)
# Utilisée pour générer les URLs permanentes des fichiers uploadés
PUBLIC_API_URL=http://localhost:4000

# Taille maximale des fichiers uploadés en bytes (par défaut: 10MB = 10485760)
MAX_UPLOAD_SIZE_BYTES=10485760
```

## Configuration par environnement

### Développement local

```env
GARAGE_ENDPOINT=http://localhost:3900
GARAGE_ACCESS_KEY_ID=GK71665a025dbc2130e74c50fb
GARAGE_SECRET_ACCESS_KEY=99799ac0b355d7d3f6f77ff8f4bd3e67a7b1dc6813024b9f0b1f5b24efcc8c89
GARAGE_BUCKET=kollab
PUBLIC_API_URL=http://localhost:4000
```

### Production (Docker)

```env
GARAGE_ENDPOINT=http://garage:3900
GARAGE_ACCESS_KEY_ID=<production-key-id>
GARAGE_SECRET_ACCESS_KEY=<production-secret-key>
GARAGE_BUCKET=kollab
PUBLIC_API_URL=https://api.yourdomain.com
MAX_UPLOAD_SIZE_BYTES=52428800  # 50MB en production
```

## Initialisation de Garage

Pour initialiser Garage (créer le bucket, configurer les permissions) :

```bash
npm run db:init-garage
```

Ou directement :

```bash
cd apps/api
tsx src/scripts/init-garage.ts
```

## Types de fichiers supportés

- **Covers de tâches** : Images uniquement (`image/*`)
- **Pièces jointes de tâches** : Tous types de fichiers
- **Covers de documents** : Images uniquement (`image/*`)
- **Avatars** : Images uniquement (`image/*`)

## Limites

- **Taille maximale par défaut** : 10MB
- **Taille maximale configurable** : Via `MAX_UPLOAD_SIZE_BYTES`
- Les fichiers sont stockés avec des clés uniques basées sur le timestamp et un ID aléatoire

## Structure des clés S3

Les fichiers sont organisés selon leur type :

- `tasks/{taskId}/covers/{timestamp}-{randomId}.{ext}` - Covers de tâches
- `tasks/{taskId}/attachments/{timestamp}-{filename}` - Pièces jointes de tâches
- `documents/covers/{timestamp}-{randomId}.{ext}` - Covers de documents
- `avatars/{userId}/{timestamp}-{randomId}.{ext}` - Avatars

## URLs de fichiers

Les fichiers uploadés sont servis via un endpoint proxy permanent :

```
{PUBLIC_API_URL}/api/upload/file/{encoded-key}
```

Ces URLs ne expirent jamais et sont servies par le backend, permettant un contrôle d'accès et des headers CORS appropriés.

## Sécurité

- Les credentials Garage doivent être stockés de manière sécurisée (variables d'environnement, secrets manager)
- Ne jamais commiter les credentials dans le code source
- Utiliser des credentials différents pour chaque environnement (dev, staging, production)
- Les fichiers sont accessibles uniquement via le proxy backend (pas d'accès direct à Garage)

## Dépannage

### Erreur : "Garage is not configured"

Vérifiez que `GARAGE_ACCESS_KEY_ID` et `GARAGE_SECRET_ACCESS_KEY` sont définis dans votre fichier `.env`.

### Erreur : "Failed to upload file to Garage"

1. Vérifiez que Garage est démarré : `docker ps | grep garage`
2. Vérifiez que `GARAGE_ENDPOINT` est correct
3. Vérifiez que les credentials sont valides
4. Vérifiez que le bucket existe : `garage bucket info kollab`

### Erreur : "File size exceeds limit"

Augmentez `MAX_UPLOAD_SIZE_BYTES` dans votre `.env` si nécessaire.

