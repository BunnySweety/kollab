# Variables d'Environnement - Web

Ce fichier liste toutes les variables d'environnement nécessaires pour le frontend Kollab.

Créez un fichier `.env` dans `apps/web/` avec ces variables :

```env
# ============================================
# API Configuration
# ============================================
# URL of the API backend
VITE_API_URL=http://localhost:4000

# ============================================
# Demo Mode Configuration (Frontend)
# ============================================
# Enable/disable demo tasks display (default: true)
# Set to 'false' to completely disable demo tasks
VITE_ENABLE_DEMO_TASKS=true

# Demo Tasks (JSON array - optional)
# VITE_DEMO_TASKS=[{"title":"Design new landing page","description":"Create mockups for the new marketing site","status":"todo","priority":"high","assignee":{"name":"Alice","avatar":null},"dueDateDaysOffset":7,"tags":["design","marketing"]}]

# Demo Projects (JSON array - optional)
# VITE_DEMO_PROJECTS=[{"id":"default","name":"All Tasks"},{"id":"project-1","name":"Product Launch"},{"id":"project-2","name":"Marketing Campaign"}]
```

## Variables Requises

### Obligatoires
- `VITE_API_URL` : URL de l'API backend

### Optionnelles avec valeurs par défaut
- `VITE_ENABLE_DEMO_TASKS` : Activer les tâches demo (défaut: true)

## Notes

- Toutes les variables doivent être préfixées par `VITE_` pour être accessibles dans le code SvelteKit
- Les variables sont exposées au client, ne jamais y mettre de secrets
- Redémarrer le serveur de développement après modification des variables

## Documentation

Pour plus de détails, consultez :
- `DEMO_MODE.md` : Configuration du mode demo frontend

