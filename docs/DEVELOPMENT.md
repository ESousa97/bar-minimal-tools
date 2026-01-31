# Development Guide

## Prerequisites

- Node.js 20+
- Rust (stable)
- Windows 10/11

## Setup

```bash
npm install
```

## Run

```bash
npm run dev          # Frontend only
npm run tauri dev    # Full desktop app
```

## Quality Checks

```bash
npm run lint
npm run type-check
npm test
npm run test:coverage
```

## Rust Commands

```bash
npm run lint:rust
npm run test:rust
npm run format:rust
```

## Commit Convention

This project uses **Conventional Commits**.

Examples:

- `feat: add task switcher widget`
- `fix: handle null GPU temp`
- `chore: update dependencies`
