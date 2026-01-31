# Contributing to Bar Minimal Tools

Thanks for your interest in contributing to Bar Minimal Tools! This project welcomes contributions that improve stability, performance, and user experience.

## 📋 Prerequisites

- **Node.js** 20+
- **Rust** (stable) + `cargo`
- **Windows 10/11** for full testing (Tauri app)

## 🛠️ Development Setup

```bash
# Install dependencies
npm install

# Run frontend dev server
npm run dev

# Run Tauri app (requires Rust toolchain)
npm run tauri dev
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run type-check

# Lint
npm run lint
```

## ✅ Code Style

- **ESLint** is required for TypeScript
- **Prettier** handles formatting
- **Rustfmt** for Rust formatting
- **Clippy** for Rust linting

To auto-format:

```bash
npm run format
cargo fmt --manifest-path src-tauri/Cargo.toml
```

## 🔒 Security

If you discover a security issue, please follow our [Security Policy](SECURITY.md).

## 📝 Pull Requests

- Use the PR template
- Link the related issue if applicable
- Keep PRs focused and small
- Include tests for any new logic

Thanks for helping improve Bar Minimal Tools!
