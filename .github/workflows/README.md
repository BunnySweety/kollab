# 🚀 CI/CD Workflows

Ce répertoire contient les workflows GitHub Actions pour l'intégration continue et le déploiement continu de Kollab.

---

## 📋 Workflows Disponibles

### 1. `ci.yml` - Continuous Integration
**Trigger**: Push sur toutes les branches, Pull Requests vers `main`/`develop`

**Jobs**:
- ✅ **Lint & Type Check**: Vérifie la qualité du code (ESLint, TypeScript)
- ✅ **Build**: Compile l'API et le Web
- ✅ **Unit Tests**: Tests unitaires (actuellement en attente d'implémentation)
- ✅ **Integration Tests**: Tests d'intégration avec PostgreSQL et Redis
- ✅ **Security Audit**: `npm audit` pour détecter les vulnérabilités
- ✅ **Code Quality**: Métriques de qualité du code

**Durée estimée**: 5-8 minutes

### 2. `deploy-staging.yml` - Staging Deployment
**Trigger**: Push sur `develop`, Manual dispatch

**Jobs**:
- 🏗️ Build API & Web (optimized)
- 🗄️ Database migrations (staging)
- 🚀 Deploy to staging environment
- 🧪 Smoke tests

**Environment**: `staging`  
**URL**: https://staging.kollab.com

**Durée estimée**: 3-5 minutes

### 3. `deploy-production.yml` - Production Deployment
**Trigger**: Push sur `main`, Version tags (`v*.*.*`), Manual dispatch

**Jobs**:
- ✅ Pre-deployment checks (security, coverage)
- 💾 Database backup
- 🏗️ Build API & Web (production)
- 🗄️ Database migrations (with backup)
- 🚀 Deploy to production
- 🧪 Smoke tests & monitoring
- 📊 Post-deployment monitoring (5 min)
- ⏪ Rollback capability (manual)

**Environment**: `production`  
**URL**: https://kollab.com

**Durée estimée**: 8-12 minutes

---

## 🔐 Configuration des Secrets

### Secrets Requis

#### Staging Environment
```
STAGING_API_URL=https://api-staging.kollab.com
STAGING_DATABASE_URL=postgres://user:pass@host:5432/db_staging
STAGING_API_KEY=<deployment_key>
STAGING_WEB_KEY=<deployment_key>
```

#### Production Environment
```
PRODUCTION_API_URL=https://api.kollab.com
PRODUCTION_DATABASE_URL=postgres://user:pass@host:5432/db_production
PRODUCTION_API_KEY=<deployment_key>
PRODUCTION_WEB_KEY=<deployment_key>
```

#### Frontend (API et Web)
```
VITE_API_URL=https://api.kollab.com
```

### Ajouter des Secrets

1. Aller dans **Settings** > **Secrets and variables** > **Actions**
2. Cliquer sur **New repository secret**
3. Ajouter le nom et la valeur du secret
4. Sauvegarder

---

## 🌍 Environments GitHub

Configure les environnements pour protection et approbations:

### Créer les Environments

1. **Settings** > **Environments** > **New environment**

2. **staging**:
   - Protection rules: None (auto-deploy)
   - Environment secrets: STAGING_*

3. **production**:
   - ✅ Required reviewers: @team-lead, @devops
   - ✅ Wait timer: 5 minutes
   - ✅ Deployment branches: `main` only
   - Environment secrets: PRODUCTION_*

4. **production-rollback**:
   - ✅ Required reviewers: @team-lead
   - For emergency rollbacks only

---

## 📊 Status Badges

Ajoutez ces badges dans votre README.md principal:

```markdown
![CI Pipeline](https://github.com/your-org/kollab/actions/workflows/ci.yml/badge.svg)
![Deploy Staging](https://github.com/your-org/kollab/actions/workflows/deploy-staging.yml/badge.svg)
![Deploy Production](https://github.com/your-org/kollab/actions/workflows/deploy-production.yml/badge.svg)
```

---

## 🔧 Personnalisation

### Configurer le Déploiement

Les workflows incluent des placeholders pour les commandes de déploiement. Personnalisez selon votre infrastructure:

#### Exemples par Plateforme

**Vercel**:
```yaml
- name: Deploy to Vercel
  run: |
    cd apps/web
    npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

**Fly.io**:
```yaml
- name: Deploy to Fly.io
  run: |
    cd apps/api
    flyctl deploy --remote-only
  env:
    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**Docker + Kubernetes**:
```yaml
- name: Build & Push Docker Image
  run: |
    docker build -t registry.kollab.com/api:${{ github.sha }} ./apps/api
    docker push registry.kollab.com/api:${{ github.sha }}

- name: Deploy to Kubernetes
  run: |
    kubectl set image deployment/kollab-api api=registry.kollab.com/api:${{ github.sha }}
    kubectl rollout status deployment/kollab-api
```

**AWS (S3 + CloudFront)**:
```yaml
- name: Deploy to AWS
  run: |
    aws s3 sync apps/web/dist s3://kollab-prod --delete
    aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DIST_ID }} --paths "/*"
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### Ajouter des Notifications

**Slack**:
```yaml
- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
    payload: |
      {
        "text": "Deployment to production completed: ${{ job.status }}"
      }
```

**Discord**:
```yaml
- name: Notify Discord
  run: |
    curl -H "Content-Type: application/json" \
      -d '{"content": "🚀 Deployed to production: ${{ github.sha }}"}' \
      ${{ secrets.DISCORD_WEBHOOK_URL }}
```

---

## 🧪 Tests en Local

### Tester le Workflow CI Localement

Utilisez [act](https://github.com/nektos/act) pour exécuter les workflows localement:

```bash
# Installer act
brew install act  # macOS
# or
choco install act  # Windows

# Exécuter le workflow CI
act push -W .github/workflows/ci.yml

# Exécuter un job spécifique
act -j lint
act -j build
```

### Variables d'Environnement Locales

Créez `.secrets` pour les tests locaux (ne pas committer):

```bash
# .secrets
STAGING_API_URL=http://localhost:4000
DATABASE_URL=postgres://localhost:5432/test
```

Exécuter avec secrets:
```bash
act --secret-file .secrets
```

---

## 🐛 Dépannage

### Workflow Bloqué

**Symptôme**: Le workflow ne démarre pas ou reste en attente

**Solutions**:
1. Vérifier les limites de concurrence (`concurrency`)
2. Annuler les runs en cours dans l'onglet Actions
3. Vérifier les permissions du workflow (Settings > Actions > General)

### Échec de Build

**Symptôme**: Le job `build` échoue

**Solutions**:
1. Vérifier les logs détaillés dans GitHub Actions
2. Reproduire localement: `cd apps/api && npm ci && npm run build`
3. Vérifier les dépendances manquantes
4. Vérifier les variables d'environnement

### Échec de Déploiement

**Symptôme**: Le déploiement échoue après le build

**Solutions**:
1. Vérifier que tous les secrets sont configurés
2. Vérifier les permissions d'accès (SSH, API keys)
3. Tester la commande de déploiement localement
4. Vérifier les logs du serveur cible

### Tests d'Intégration Échouent

**Symptôme**: Le job `test-integration` échoue

**Solutions**:
1. Vérifier que PostgreSQL et Redis services démarrent correctement
2. Vérifier les health checks des services
3. Augmenter les timeouts si nécessaire
4. Vérifier les migrations de base de données

---

## 📈 Métriques & Monitoring

### Métriques à Surveiller

1. **Build Time**: Objectif < 5 min (actuellement ~3-5 min)
2. **Test Coverage**: Objectif 60%+ (actuellement 0%)
3. **Deployment Frequency**: Cible 5-10x/semaine
4. **Mean Time to Recovery (MTTR)**: Objectif < 15 min
5. **Change Failure Rate**: Objectif < 15%

### Dashboards Recommandés

- **GitHub Actions Dashboard**: Built-in metrics
- **DataDog/New Relic**: APM et monitoring applicatif
- **Sentry**: Error tracking et performance
- **Grafana**: Métriques custom et alerting

---

## 🔄 Stratégie de Déploiement

### Gitflow

```
main (production)
├─ develop (staging)
   ├─ feature/new-feature
   ├─ bugfix/fix-issue
   └─ hotfix/critical-fix
```

### Déploiements

1. **Feature Branch** → **Develop** (via PR)
   - CI checks
   - Code review
   - Merge → Deploy to Staging

2. **Develop** → **Main** (via PR)
   - CI checks
   - Staging tests validation
   - Manual approval
   - Merge → Deploy to Production

3. **Hotfix** → **Main** (direct)
   - Bypass develop for critical fixes
   - Deploy immediately to Production
   - Backport to develop

### Rollback Strategy

1. **Automated**: Revert merge commit
2. **Manual**: `workflow_dispatch` trigger rollback job
3. **Database**: Restore from backup (created pre-deployment)

---

## 📚 Ressources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Environment Protection Rules](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)

---

**Maintenu par**: DevOps Team  
**Dernière mise à jour**: 13 novembre 2025  
**Version**: 1.0

