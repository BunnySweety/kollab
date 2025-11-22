# Mode Demo - Configuration Simplifiée

Le mode demo de Kollab permet de créer automatiquement des données de démonstration pour tester l'application.

## Activation

Pour activer le mode demo, il suffit de définir une seule variable :

```env
ENABLE_DEMO_MODE=true
```

C'est tout ! Aucune autre configuration n'est nécessaire.

## Ce qui est créé automatiquement

Lorsque `ENABLE_DEMO_MODE=true`, les éléments suivants sont créés automatiquement :

### Utilisateur demo
- **Email** : `demo@kollab.app`
- **Mot de passe** : `Demo123456!`
- **Nom** : `Demo User`

### Workspace demo
- **Nom** : `Demo Workspace`
- **Slug** : `demo-workspace`
- **Description** : `Demo workspace for testing Kollab`

### Colonnes par défaut
- **To Do** (gris, ordre 0)
- **In Progress** (bleu, ordre 1)
- **Done** (vert, ordre 2)

### Tags demo
- Design (rouge)
- Development (bleu)
- Marketing (vert)
- Backend (orange)
- Frontend (violet)
- Documentation (cyan)

### Tâches demo
6 tâches d'exemple avec différents statuts, priorités et tags.

## Utilisation

1. **Activer le mode demo** dans `apps/api/.env` :
   ```env
   ENABLE_DEMO_MODE=true
   ```

2. **Démarrer l'application** :
   ```bash
   npm run db:setup  # Initialise la DB et crée les données demo
   npm run dev       # Démarre l'API
   ```

3. **Se connecter** avec les identifiants demo :
   - Email : `demo@kollab.app`
   - Mot de passe : `Demo123456!`

## Personnalisation

Le mode demo utilise des valeurs par défaut hardcodées. Pour personnaliser les données demo, vous devez modifier le fichier `apps/api/src/scripts/seed-demo-data.ts`.

## Exécution manuelle

Pour exécuter le seed manuellement sans démarrer le serveur :

```bash
npm run db:seed-demo-data
```

## Notes de sécurité

- ⚠️ **Ne pas utiliser en production** : Le mode demo crée un utilisateur avec des identifiants par défaut
- ⚠️ **Désactiver en production** : Assurez-vous que `ENABLE_DEMO_MODE=false` en production
- ✅ **Idempotent** : Les données ne sont créées que si elles n'existent pas déjà (évite les doublons)

## Désactivation

Pour désactiver le mode demo :

```env
ENABLE_DEMO_MODE=false
```

Ou simplement supprimer la variable du fichier `.env`.
