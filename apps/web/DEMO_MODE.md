# Mode Demo - Configuration Frontend

Ce document décrit les variables d'environnement disponibles pour configurer le mode demo dans le frontend SvelteKit.

## Variables d'environnement

### Activation des tâches demo

```env
# Activer/désactiver l'affichage des tâches demo (par défaut: activé)
# Définir à 'false' pour désactiver complètement les tâches demo
VITE_ENABLE_DEMO_TASKS=true
```

### Configuration des tâches demo

Les tâches demo peuvent être personnalisées via une variable JSON :

```env
# Format JSON: tableau d'objets avec title, description, status, priority, assignee, dueDateDaysOffset, tags
VITE_DEMO_TASKS=[{"title":"Design new landing page","description":"Create mockups for the new marketing site","status":"todo","priority":"high","assignee":{"name":"Alice","avatar":null},"dueDateDaysOffset":7,"tags":["design","marketing"]}]
```

Structure d'une tâche demo :
- `id` (string, optionnel) : ID de la tâche (généré automatiquement si non fourni)
- `title` (string) : Titre de la tâche
- `description` (string) : Description de la tâche
- `status` (string) : Statut parmi `todo`, `in_progress`, `done`, `cancelled`
- `priority` (string) : Priorité parmi `low`, `medium`, `high`, `urgent`
- `assignee` (object | null) : Assigné avec `name` (string) et `avatar` (string | null)
- `dueDateDaysOffset` (number | null) : Nombre de jours depuis maintenant (positif = futur, négatif = passé, null = pas de date)
- `tags` (string[]) : Tableau des tags

Exemple de personnalisation :

```env
VITE_DEMO_TASKS=[{"title":"Créer le design du site","description":"Designer les maquettes du nouveau site web","status":"todo","priority":"high","assignee":{"name":"Alice","avatar":null},"dueDateDaysOffset":7,"tags":["design","ui"]},{"title":"Implémenter l'authentification","description":"Ajouter OAuth et authentification email","status":"in_progress","priority":"urgent","assignee":{"name":"Bob","avatar":null},"dueDateDaysOffset":3,"tags":["backend","security"]}]
```

## Utilisation

1. Créer ou modifier le fichier `.env` dans `apps/web/`
2. Ajouter les variables souhaitées
3. Redémarrer le serveur de développement

### Configuration des projets demo

Les projets demo peuvent être personnalisés via une variable JSON :

```env
# Format JSON: tableau d'objets avec id et name
VITE_DEMO_PROJECTS=[{"id":"default","name":"All Tasks"},{"id":"project-1","name":"Product Launch"},{"id":"project-2","name":"Marketing Campaign"}]
```

Structure d'un projet demo :
- `id` (string, optionnel) : ID du projet (généré automatiquement si non fourni)
- `name` (string) : Nom du projet

## Notes

- Les variables d'environnement doivent être préfixées par `VITE_` pour être accessibles dans le code SvelteKit
- Les valeurs par défaut sont utilisées si les variables ne sont pas définies
- Les tâches demo ne sont affichées que si aucun workspace n'est sélectionné
- Pour désactiver complètement les tâches demo, définir `VITE_ENABLE_DEMO_TASKS=false`
- Les dates sont calculées dynamiquement à partir de `dueDateDaysOffset` pour toujours être relatives à la date actuelle

## Intégration avec le backend

Le mode demo frontend est indépendant du mode demo backend (`ENABLE_DEMO_MODE`). 

- **Backend demo mode** : Crée des données persistantes en base de données
- **Frontend demo tasks** : Affiche des tâches temporaires uniquement dans le navigateur (non persistantes)

Pour une expérience complète, il est recommandé d'utiliser le mode demo backend qui crée des données persistantes.

