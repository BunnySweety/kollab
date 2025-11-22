# 🤝 Contributing to Kollab

First off, thank you for considering contributing to Kollab! 🎉

Following these guidelines helps to communicate that you respect the time of the developers managing and developing this open source project. In return, they should reciprocate that respect in addressing your issue, assessing changes, and helping you finalize your pull requests.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

---

## 📜 Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

**Key principles**:
- Be respectful and inclusive
- Assume good intentions
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other community members

---

## 🚀 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**When reporting a bug, include**:
- **Clear, descriptive title**
- **Step-by-step reproduction steps**
- **Expected behavior** vs **actual behavior**
- **Screenshots** (if applicable)
- **Environment details**: OS, browser, Node version
- **Console errors** (if any)

**Example**:

```markdown
**Title**: Document export fails with special characters in title

**Steps to reproduce**:
1. Create a document with title "Test: É&É"
2. Click "Export to PDF"
3. See error message

**Expected**: PDF downloads successfully
**Actual**: Error "Invalid filename" displayed

**Environment**:
- OS: Windows 11
- Browser: Chrome 119
- Node: 20.9.0

**Console Error**:
```
Error: ENOENT: no such file or directory, open 'Test: É&É.pdf'
```
```

### Suggesting Features

Feature suggestions are tracked as GitHub issues.

**When suggesting a feature, include**:
- **Clear, descriptive title**
- **Problem statement**: What problem does this solve?
- **Proposed solution**: How should this work?
- **Alternatives considered**: What other solutions did you think of?
- **Additional context**: Screenshots, mockups, examples

### Contributing Code

1. **Find an issue** to work on (or create one)
2. **Comment** on the issue to let others know you're working on it
3. **Fork** the repository
4. **Create a branch** from `develop`
5. **Make your changes**
6. **Test thoroughly**
7. **Submit a pull request**

---

## 🛠️ Development Setup

### Prerequisites

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **Docker** ([Download](https://www.docker.com/get-started))
- **npm** 10+
- **Git**

### Initial Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/kollab.git
cd kollab

# 2. Add upstream remote
git remote add upstream https://github.com/your-org/kollab.git

# 3. Install dependencies
npm run install:all

# 4. Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 5. Start Docker services
npm run docker:up

# 6. Initialize database
npm run db:setup

# 7. Start development server
npm run dev
```

### Verify Setup

- Web App: http://localhost:3000
- API: http://localhost:4000
- Health Check: http://localhost:4000/health

---

## 🔄 Development Workflow

### 1. Sync with Upstream

```bash
git checkout develop
git pull upstream develop
```

### 2. Create Feature Branch

```bash
# Branch naming convention:
# feature/description   - for new features
# fix/description       - for bug fixes
# docs/description      - for documentation
# refactor/description  - for refactoring
# test/description      - for adding tests

git checkout -b feature/add-dark-mode
```

### 3. Make Changes

```bash
# Start development server (auto-reload)
npm run dev

# Make your changes
# Test in browser
```

### 4. Test Your Changes

```bash
# Run linter
npm run lint

# Run type check
npm run type-check

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Build to ensure no errors
npm run build

# Validate everything (lint + type-check + test)
npm run validate
```

### 5. Commit Your Changes

```bash
# Validate your changes before committing
npm run validate  # Runs lint + type-check + tests

# Stage your changes
git add .

# Commit with conventional commit message
git commit -m "feat: add dark mode toggle"
```

**Recommended**: Set up pre-commit hooks to automatically validate code quality before each commit. See [Pre-commit Hooks](#pre-commit-hooks-recommended) section below.

See [Commit Guidelines](#commit-guidelines) for commit message format.

### 6. Push to Your Fork

```bash
git push origin feature/add-dark-mode
```

### 7. Create Pull Request

- Go to GitHub
- Click "Compare & pull request"
- Fill in the PR template
- Request review from maintainers

---

## 🔧 Pre-commit Hooks (Recommended)

Setting up pre-commit hooks ensures code quality automatically before each commit, catching issues early.

### Option 1: Using Husky + lint-staged (Recommended)

```bash
# Install dependencies (at project root)
npm install --save-dev husky lint-staged

# Initialize husky
npx husky init

# Create pre-commit hook
echo "npx lint-staged" > .husky/pre-commit
```

**Add to `package.json`**:

```json
{
  "lint-staged": {
    "apps/api/src/**/*.{ts,js}": [
      "cd apps/api && npm run lint -- --fix",
      "cd apps/api && npm run type-check"
    ],
    "apps/web/src/**/*.{ts,js,svelte}": [
      "cd apps/web && npm run lint -- --fix",
      "cd apps/web && npm run type-check"
    ]
  }
}
```

### Option 2: Manual Validation

If you prefer not to use hooks, always run before committing:

```bash
npm run validate  # Runs all checks
```

### What Gets Checked

- ✅ **Linting**: ESLint checks code style
- ✅ **Type checking**: TypeScript validates types
- ✅ **Tests**: Unit tests run on affected files
- ✅ **Formatting**: Code style consistency

### Benefits

- **Early detection**: Catch issues before code review
- **Consistent quality**: All code meets standards
- **Faster reviews**: Reviewers focus on logic, not style
- **Confidence**: Know your code is solid before pushing

---

## 📐 Coding Standards

### TypeScript

```typescript
// ✅ DO: Use explicit types
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ❌ DON'T: Use 'any' type
function calculateTotal(items: any): any {
  return items.reduce((sum: any, item: any) => sum + item.price, 0);
}
```

### Naming Conventions

```typescript
// Variables & Functions: camelCase
const userName = "John";
function getUserById(id: string) { }

// Classes & Types: PascalCase
class UserService { }
type UserProfile = { };

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = "https://api.kollab.com";

// Private properties: _prefix
class User {
  private _password: string;
}

// Files: kebab-case
// user-service.ts, api-client.ts, workspace-helpers.ts
```

### File Structure

```typescript
// 1. Imports (external, then internal)
import { Hono } from 'hono';
import { z } from 'zod';

import { db } from '../db';
import { users } from '../db/schema';

// 2. Constants
const MAX_PAGE_SIZE = 100;

// 3. Types & Interfaces
type UserCreateInput = {
  email: string;
  password: string;
};

// 4. Main logic
export function createUserRoute() {
  // ...
}
```

### Error Handling

```typescript
// ✅ DO: Handle errors gracefully
try {
  const result = await riskyOperation();
  return c.json({ success: true, data: result });
} catch (error) {
  console.error('Operation failed:', error);
  return c.json({ error: 'Operation failed' }, 500);
}

// ❌ DON'T: Ignore errors
const result = await riskyOperation(); // Might throw!
```

### Comments

```typescript
// ✅ DO: Comment complex logic
/**
 * Checks if user has access to workspace with caching
 * Cache is invalidated when membership changes
 * 
 * @param workspaceId - Workspace ID to check
 * @param userId - User ID to check
 * @returns Membership object or null
 */
export async function checkWorkspaceMembership(
  workspaceId: string,
  userId: string
) {
  // Try cache first to avoid DB query
  const cacheKey = `${CACHE_KEYS.WORKSPACE_MEMBER}${userId}:${workspaceId}`;
  const cached = await cacheGet(cacheKey);
  
  if (cached !== undefined) {
    return cached;
  }
  
  // Cache miss - query database
  const membership = await db.query.workspaceMembers.findFirst({
    where: (members, { eq, and }) => and(
      eq(members.workspaceId, workspaceId),
      eq(members.userId, userId)
    )
  });
  
  // Store in cache for 5 minutes
  await cacheSet(cacheKey, membership, CACHE_TTL.WORKSPACE_MEMBER);
  
  return membership;
}

// ❌ DON'T: State the obvious
const total = 0; // Initialize total to zero
```

---

## 📝 Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring (no functional changes)
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, config, etc.)
- `ci`: CI/CD changes

### Scopes (optional)

- `api`: Backend API
- `web`: Frontend
- `db`: Database
- `auth`: Authentication
- `cache`: Caching
- `docs`: Documentation
- `ci`: CI/CD

### Examples

```bash
# Simple feature
git commit -m "feat: add dark mode toggle"

# Feature with scope
git commit -m "feat(auth): add password reset functionality"

# Bug fix with description
git commit -m "fix(api): prevent race condition in workspace creation"

# Breaking change
git commit -m "feat(api)!: change workspace API response format

BREAKING CHANGE: workspace.members is now workspace.memberships"

# Multiple lines
git commit -m "refactor(cache): improve Redis connection handling

- Add connection retry logic
- Improve error messages
- Add connection pool monitoring"
```

### Commit Best Practices

- ✅ Write in present tense ("add feature" not "added feature")
- ✅ Keep first line under 72 characters
- ✅ Reference issues when applicable (`fix #123`)
- ✅ Make atomic commits (one logical change per commit)
- ❌ Don't commit broken code
- ❌ Don't commit commented-out code
- ❌ Don't commit `console.log` debugging statements

---

## 🔀 Pull Request Process

### Before Submitting

- [ ] Code follows the project's coding standards
- [ ] All tests pass (`npm run test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Type check passes (`npm run type-check`)
- [ ] Build succeeds (`npm run build`)
- [ ] Manual testing completed
- [ ] Documentation updated (if needed)
- [ ] Commits follow commit guidelines

### PR Title Format

Use the same format as commit messages:

```
feat(auth): add OAuth2 support
fix(api): resolve memory leak in WebSocket handler
docs: update deployment guide
```

### PR Description Template

```markdown
## Description
Brief description of the changes

## Related Issue
Fixes #123

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Changes Made
- List key changes
- Be specific
- Include rationale

## Screenshots (if applicable)
Add screenshots for UI changes

## Testing
- [ ] Tested locally
- [ ] Added unit tests
- [ ] Added integration tests
- [ ] Manual testing checklist:
  - [ ] Feature X works
  - [ ] Edge case Y handled
  - [ ] Error handling tested

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests added/updated
- [ ] All tests pass
```

### Review Process

1. **Automated Checks**: CI pipeline runs automatically
2. **Code Review**: Maintainer reviews your code
3. **Feedback**: Address any requested changes
4. **Approval**: Once approved, your PR will be merged
5. **Cleanup**: Delete your feature branch after merge

### Review Guidelines

**For Contributors**:
- Be responsive to feedback
- Don't take criticism personally
- Ask questions if unclear
- Update your PR based on feedback

**For Reviewers**:
- Be constructive and specific
- Praise good work
- Suggest, don't demand
- Focus on code, not the person

---

## 🧪 Testing

### Current State

- ✅ **Linting**: ESLint configured for API and Web
- ✅ **Type checking**: TypeScript strict mode enabled
- ✅ **API Unit tests**: Vitest configured (auth, export, workspace tests)
- ✅ **Web Unit tests**: Vitest + jsdom configured (31 tests, 84.78% coverage)
- 📋 **E2E tests**: Playwright documentation available (`apps/web/E2E_SETUP.md`)
- ⏳ **Integration tests**: Planned for future releases

### Running Tests

```bash
# Run all tests
npm run test

# Run tests for specific app
npm run test:api
npm run test:web

# Run with coverage report
npm run test:coverage

# Run tests in watch mode (for development)
cd apps/web && npm test -- --watch

# Run tests with UI (Web only)
cd apps/web && npm run test:ui
```

### Writing Unit Tests

**API Tests** (Vitest + Node):

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { app } from '../index';

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register a new user', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        password: 'securepass123'
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user.email).toBe('test@example.com');
  });
});
```

**Web Tests** (Vitest + jsdom):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { theme } from './theme';

describe('Theme Store', () => {
  it('should initialize with system theme', () => {
    const { subscribe, init } = theme;
    init();
    expect(get(subscribe)).toBe('system');
  });

  it('should toggle between light and dark', () => {
    const { toggle, subscribe, set } = theme;
    set('light');
    toggle();
    expect(get(subscribe)).toBe('dark');
  });
});
```

### Test Coverage Goals

- **Minimum coverage**: 70% for all new code
- **Critical paths**: 90%+ coverage
- **Current API coverage**: 70%+ (auth, export, workspace)
- **Current Web coverage**: 84.78% (api-client, stores, utils)

### E2E Testing

For E2E tests with Playwright, refer to `apps/web/E2E_SETUP.md` for complete setup instructions

---

## 📖 Documentation

### When to Update Documentation

- Adding a new feature
- Changing existing functionality
- Adding new environment variables
- Changing API endpoints
- Updating dependencies

### Documentation Files

- `README.md`: Project overview
- `QUICK_START.md`: Quick setup guide
- `DEPLOYMENT_GUIDE.md`: Deployment instructions
- `CONTRIBUTING.md`: This file
- `PRODUCTION_CHECKLIST.md`: Pre-deployment checklist
- `.github/workflows/README.md`: CI/CD documentation

### API Documentation

Document new endpoints:

```typescript
/**
 * GET /api/workspaces/:id
 * 
 * Get workspace details by ID
 * 
 * @param id - Workspace ID
 * @returns Workspace object with members
 * 
 * @example
 * GET /api/workspaces/ws-123
 * Response:
 * {
 *   "id": "ws-123",
 *   "name": "My Workspace",
 *   "members": [...]
 * }
 */
```

---

## 🎯 Good First Issues

Looking for something to work on? Check issues labeled:
- `good first issue`: Simple tasks for beginners
- `help wanted`: Tasks that need contributors
- `documentation`: Documentation improvements

---

## 📞 Getting Help

- **Documentation**: Read the [docs](./docs)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/kollab/discussions)
- **Issues**: [GitHub Issues](https://github.com/your-org/kollab/issues)
- **Discord**: [Join our Discord](https://discord.gg/kollab)

---

## 🙏 Thank You!

Your contributions make Kollab better for everyone. Thank you for taking the time to contribute! 🎉

**Happy coding!** 🚀

---

*Last updated: November 13, 2025*

