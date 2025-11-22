# Configuration GitHub MCP pour Cursor

Ce guide explique comment configurer le serveur MCP GitHub dans Cursor pour accéder aux ressources GitHub de votre projet.

## Prérequis

1. Un compte GitHub avec accès au dépôt du projet
2. Un Personal Access Token (PAT) GitHub avec les permissions appropriées
3. Cursor IDE installé et à jour

## Étape 1 : Créer un Personal Access Token GitHub

1. Allez sur GitHub : https://github.com/settings/tokens
2. Cliquez sur **"Generate new token"** > **"Generate new token (classic)"**
3. Donnez un nom descriptif : `Cursor MCP - Kollab`
4. Sélectionnez les scopes suivants :
   - `repo` (accès complet aux dépôts)
   - `read:org` (lecture des organisations, si applicable)
   - `read:user` (lecture du profil utilisateur)
5. Cliquez sur **"Generate token"**
6. **Copiez le token immédiatement** (il ne sera plus visible après)

## Étape 2 : Configurer MCP GitHub dans Cursor

### Méthode 1 : Via l'Interface Cursor (si disponible)

1. Ouvrez Cursor
2. Allez dans **Settings** (ou `Ctrl+,` / `Cmd+,`)
3. Dans la barre de recherche des paramètres, tapez **"MCP"**
4. Si vous voyez une section **"Fonctionnalités"** > **"MCP"**, cliquez dessus
5. Cliquez sur **"+ Ajouter un nouveau serveur MCP"** ou **"Add Server"**
6. Remplissez le formulaire :
   - **Nom** : `github`
   - **Type** : `stdio`
   - **Commande** : `npx`
   - **Arguments** : `-y`, `@modelcontextprotocol/server-github`
   - **Variables d'environnement** : Ajoutez `GITHUB_PERSONAL_ACCESS_TOKEN` avec votre token

### Méthode 2 : Via le Fichier de Configuration (Recommandé)

Si vous ne trouvez pas l'option MCP dans les paramètres, configurez directement via le fichier JSON :

1. **Localisez le fichier de configuration Cursor** :

   **Windows** :
   - Ouvrez l'Explorateur de fichiers
   - Dans la barre d'adresse, tapez : `%APPDATA%\Cursor\User`
   - Ou naviguez vers : `C:\Users\VOTRE_NOM_UTILISATEUR\AppData\Roaming\Cursor\User`
   - Ouvrez le fichier `settings.json`

   **macOS** :
   - Ouvrez Finder
   - Appuyez sur `Cmd+Shift+G` (Aller au dossier)
   - Tapez : `~/Library/Application Support/Cursor/User`
   - Ouvrez le fichier `settings.json`

   **Linux** :
   - Ouvrez votre gestionnaire de fichiers
   - Naviguez vers : `~/.config/Cursor/User`
   - Ouvrez le fichier `settings.json`

   **Astuce** : Si le fichier n'existe pas, créez-le avec le contenu JSON de base.

2. **Ouvrez le fichier `settings.json`** dans un éditeur de texte (Cursor, VS Code, Notepad++, etc.)

3. **Ajoutez la section `mcpServers`** dans le fichier JSON :

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "VOTRE_TOKEN_ICI"
      }
    }
  }
}
```

**Important** : Si le fichier `settings.json` contient déjà d'autres configurations, ajoutez simplement la section `mcpServers` au même niveau. Par exemple :

```json
{
  "editor.fontSize": 14,
  "editor.tabSize": 2,
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "VOTRE_TOKEN_ICI"
      }
    }
  }
}
```

4. **Remplacez `VOTRE_TOKEN_ICI`** par votre Personal Access Token GitHub
5. **Sauvegardez le fichier**
6. **Redémarrez Cursor complètement** (fermez toutes les fenêtres et rouvrez)

### Méthode 3 : Via la Palette de Commandes

1. Ouvrez la palette de commandes : `Ctrl+Shift+P` (Windows/Linux) ou `Cmd+Shift+P` (macOS)
2. Tapez **"MCP"** ou **"Model Context Protocol"**
3. Si une commande apparaît pour configurer MCP, utilisez-la
4. Sinon, utilisez la Méthode 2 (fichier de configuration)

## Étape 3 : Vérifier la Configuration

1. Redémarrez Cursor
2. Ouvrez la palette de commandes (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Tapez **"MCP"** et vérifiez que le serveur GitHub apparaît
4. Vous devriez voir des ressources GitHub disponibles dans les outils MCP

## Utilisation

Une fois configuré, vous pouvez :

- Accéder aux issues GitHub du projet
- Lire les pull requests
- Consulter les fichiers du dépôt
- Accéder aux discussions et commentaires
- Utiliser les ressources GitHub dans vos conversations avec l'IA

## Sécurité

**Important** :
- Ne commitez JAMAIS votre token dans le dépôt
- Le token est stocké localement dans votre configuration Cursor
- Si votre token est compromis, révoquez-le immédiatement sur GitHub
- Utilisez des tokens avec des permissions minimales nécessaires

## Dépannage

### Je ne trouve pas l'option MCP dans les paramètres

**C'est normal !** La configuration MCP dans Cursor se fait principalement via le fichier `settings.json`. Suivez la **Méthode 2** ci-dessus.

### Le serveur MCP ne démarre pas

1. Vérifiez que Node.js est installé :
   ```bash
   node --version
   ```
   (Doit être Node.js 18+)

2. Vérifiez que `npx` fonctionne :
   ```bash
   npx --version
   ```

3. Testez manuellement le serveur GitHub MCP :
   ```bash
   npx -y @modelcontextprotocol/server-github
   ```

4. Vérifiez que le token est correct dans le fichier `settings.json`
5. Vérifiez la syntaxe JSON du fichier `settings.json` (pas de virgule en trop)
6. Consultez les logs Cursor :
   - Ouvrez la palette de commandes (`Ctrl+Shift+P`)
   - Tapez "Output" ou "Log"
   - Sélectionnez "MCP" ou "Model Context Protocol" dans la liste

### Erreur d'authentification

1. Vérifiez que le token n'a pas expiré sur GitHub
2. Vérifiez que les scopes du token sont corrects (`repo`, `read:org`, `read:user`)
3. Régénérez le token si nécessaire
4. Vérifiez que le token est bien entre guillemets dans le JSON : `"VOTRE_TOKEN"`

### Ressources GitHub non disponibles

1. Vérifiez que le dépôt existe et que vous y avez accès
2. Vérifiez que le token a les permissions `repo`
3. Redémarrez Cursor complètement après la configuration
4. Attendez quelques secondes après le démarrage pour que MCP se connecte

### Le fichier settings.json n'existe pas

1. Créez le fichier manuellement à l'emplacement indiqué
2. Ajoutez simplement le contenu JSON avec la configuration MCP
3. Redémarrez Cursor

### Vérifier que MCP fonctionne

1. Redémarrez Cursor
2. Ouvrez la palette de commandes (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Tapez **"MCP"** - vous devriez voir des commandes liées à MCP
4. Ou utilisez `list_mcp_resources` dans une conversation avec l'IA pour vérifier les ressources disponibles

## Ressources

- [Documentation MCP GitHub](https://github.com/modelcontextprotocol/servers/tree/main/src/github)
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Cursor Documentation](https://cursor.sh/docs)

