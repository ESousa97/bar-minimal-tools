# Style Guide

## CSS / Design System

- Tokens live in `src/styles/tokens.css`
- Base resets in `src/styles/base.css`
- Component styles should be grouped under `src/styles/components/`
- Avoid inline styles when possible

## React

- Keep components small and focused
- Reuse shared logic in `src/utils/`
- Prefer composition over inheritance

## Rust

- Use `clippy` to enforce lint rules
- Keep services isolated by responsibility
