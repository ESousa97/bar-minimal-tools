# Security Decisions

## 1. Dependency Auditing

- **npm audit** enforced weekly via GitHub Actions
- **cargo audit** enforced weekly via GitHub Actions

## 2. Default Security Baselines

- ESLint and Prettier enforce safe defaults
- Conventional commit enforcement prevents ambiguous changes

## 3. Reporting

Security issues must be reported via [SECURITY.md](../SECURITY.md)
