# Configuration des Tests E2E pour Kollab Web

## Vue d'ensemble

Ce document décrit comment configurer les tests End-to-End (E2E) pour l'application Kollab Web en utilisant Playwright.

## Pourquoi Playwright ?

- Support multi-navigateurs (Chromium, Firefox, WebKit)
- API moderne et puissante
- Capture automatique de screenshots et vidéos
- Excellent pour les tests d'intégration complexes
- Support natif de TypeScript

## Installation (À faire)

```bash
# Dans apps/web
npm install -D @playwright/test
npx playwright install
```

## Structure proposée

```
apps/web/
├── tests/
│   ├── e2e/
│   │   ├── auth/
│   │   │   ├── login.spec.ts
│   │   │   └── register.spec.ts
│   │   ├── workspace/
│   │   │   ├── projects.spec.ts
│   │   │   ├── documents.spec.ts
│   │   │   └── tasks.spec.ts
│   │   └── fixtures/
│   │       └── test-data.ts
│   └── ...
├── playwright.config.ts
└── package.json
```

## Configuration proposée (playwright.config.ts)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Exemples de tests

### Test d'authentification

```typescript
// tests/e2e/auth/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[name="email"]', 'user@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/workspace');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });
});
```

### Test de projet

```typescript
// tests/e2e/workspace/projects.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="email"]', 'user@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/workspace');
  });

  test('should create a new project', async ({ page }) => {
    await page.goto('/workspace/projects');
    await page.click('button:has-text("New Project")');
    
    await page.fill('input[name="name"]', 'Test Project');
    await page.fill('textarea[name="description"]', 'Test Description');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Test Project')).toBeVisible();
  });

  test('should filter projects by status', async ({ page }) => {
    await page.goto('/workspace/projects');
    
    await page.click('[data-testid="filter-status"]');
    await page.click('text=Active');
    
    // Verify only active projects are shown
    const projects = await page.locator('[data-testid="project-card"]').all();
    for (const project of projects) {
      await expect(project.locator('[data-testid="project-status"]'))
        .toHaveText('Active');
    }
  });
});
```

### Fixtures pour données de test

```typescript
// tests/e2e/fixtures/test-data.ts
export const testUsers = {
  admin: {
    email: 'admin@test.com',
    password: 'admin123',
  },
  user: {
    email: 'user@test.com',
    password: 'user123',
  },
};

export const testProjects = {
  basic: {
    name: 'Test Project',
    description: 'A test project',
    status: 'active',
  },
  archived: {
    name: 'Archived Project',
    description: 'An archived project',
    status: 'archived',
  },
};
```

## Scripts package.json

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report"
  }
}
```

## Bonnes pratiques

### 1. Utiliser data-testid pour les sélecteurs

```svelte
<button data-testid="create-project-btn">Create Project</button>
```

```typescript
await page.click('[data-testid="create-project-btn"]');
```

### 2. Isoler les tests

Chaque test doit être indépendant et ne pas dépendre d'autres tests.

### 3. Nettoyer après les tests

```typescript
test.afterEach(async ({ page }) => {
  // Cleanup test data
  await page.evaluate(() => localStorage.clear());
});
```

### 4. Utiliser des attentes explicites

```typescript
// Bon
await expect(page.locator('text=Success')).toBeVisible();

// Éviter
await page.waitForTimeout(1000); // Fragile
```

### 5. Grouper les tests logiquement

```typescript
test.describe('Project Management', () => {
  test.describe('Creation', () => {
    test('should create with all fields', async ({ page }) => {});
    test('should create with minimum fields', async ({ page }) => {});
  });

  test.describe('Edition', () => {
    test('should update project name', async ({ page }) => {});
    test('should update project status', async ({ page }) => {});
  });
});
```

## Prochaines étapes

1. **Installation** : `npm install -D @playwright/test`
2. **Configuration** : Créer `playwright.config.ts`
3. **Premier test** : Créer un test simple de login
4. **CI/CD** : Intégrer dans le pipeline GitHub Actions
5. **Couverture** : Viser 70%+ des flux critiques

## Ressources

- [Documentation Playwright](https://playwright.dev/)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [API Reference](https://playwright.dev/docs/api/class-playwright)
- [Debugging](https://playwright.dev/docs/debug)

## Note

Les tests E2E doivent compléter, pas remplacer, les tests unitaires. Utilisez E2E pour:
- Flux utilisateur critiques
- Intégration entre composants
- Tests de bout en bout
- Tests de régression

Les tests unitaires restent essentiels pour:
- Logique métier
- Composants isolés
- Cas limites
- Performances de test rapides

