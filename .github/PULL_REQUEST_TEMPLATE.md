## Description

<!-- Describe briefly the changes made -->

## Type of Change

- [ ] Bug fix (non-breaking correction)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature that breaks compatibility)
- [ ] Documentation only
- [ ] Refactoring (neither bug fix nor new feature)
- [ ] Performance
- [ ] Tests

## Checklist

### Code Quality
- [ ] Code respects project standards (`.cursorrules`)
- [ ] No `any` types used
- [ ] No `console.log` in production
- [ ] Structured logger used (`log.info()`, `log.error()`)
- [ ] No code duplication (DRY)
- [ ] No emojis in code or documentation

### Security
- [ ] Zod validation for all inputs
- [ ] Workspace permissions verification
- [ ] No sensitive data exposed
- [ ] CSRF protection respected

### Performance
- [ ] Redis cache used if appropriate
- [ ] DB indexes added if necessary
- [ ] No N+1 queries

### Tests
- [ ] Unit tests added/updated
- [ ] All tests pass (`npm run test`)
- [ ] Coverage >= 70%

### Documentation
- [ ] **NO new markdown file created** (unless explicitly requested)
- [ ] `CHANGELOG.md` updated if important change
- [ ] Code commented if complex logic
- [ ] TypeScript types documented with JSDoc if necessary

### CI/CD
- [ ] Linting passes (`npm run lint`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] Build passes (`npm run build`)

## Tests Performed

<!-- Describe how you tested the changes -->

## Impact

<!-- Are there impacts on other parts of the system? -->

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## Additional Notes

<!-- Any other important context -->
