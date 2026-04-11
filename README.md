# ONDC UCP Seller Portal

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/openclaw-gurusharan/ondc-seller)

Seller web application for ONDC (Open Network for Digital Commerce) Unified Commerce Platform integration.

## Overview

This portal enables sellers to manage their products, process orders, and configure their ONDC integration through a modern web interface built with React, TypeScript, and Vite.

## Features

- **Dashboard**: Order overview with key metrics
- **Product Catalog**: Create, edit, and manage product listings
- **Order Management**: Accept, reject, and track orders
- **Seller Configuration**: ONDC credentials and connection settings
- **AI Agent Chat**: Intelligent assistant for seller support

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Vite 5 + React 18 + TypeScript 5 |
| **Routing** | React Router v6 |
| **Design** | @drams-design/components (Dieter Rams principles) |
| **SDK** | @ondc-sdk/shared |
| **Testing** | Vitest + Testing Library |
| **Code Quality** | ESLint 9 + Prettier 3 |
| **Package Manager** | pnpm 8+ |

## Prerequisites

- Node.js 18+
- pnpm 8+

## Installation

```bash
# Clone repository
git clone <repository-url>
cd ondc-ucp-seller-portal

# Install dependencies
pnpm install
```

## Environment Variables

Create a `.env` file in the project root:

```env
# API Base URL (default: http://localhost:3001)
VITE_API_BASE_URL=http://localhost:3001
```

## Development

```bash
# Start dev server (port 43103)
pnpm dev

# Type check
pnpm typecheck

# Lint code
pnpm lint

# Format code
pnpm format

# Check formatting
pnpm format:check
```

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

## Building

```bash
# Production build
pnpm build

# Preview production build
pnpm preview
```

## CI/CD

The project uses GitHub Actions for continuous integration:

- **Lint & Format**: Runs on every PR (blocks merge on failure)
- **Typecheck**: Validates TypeScript types
- **Build**: Ensures production build succeeds
- **Tests**: Runs full test suite

## Project Structure

```
src/
├── components/      # Reusable UI components
├── pages/          # Route-level pages
├── hooks/          # Custom React hooks
├── types/          # TypeScript type definitions
├── __tests__/      # Test setup and utilities
├── App.tsx         # Root component
└── main.tsx        # Entry point
```

## Deployment

The project is configured for Netlify deployment:

```bash
# Install Netlify CLI
pnpm add -g netlify-cli

# Deploy to preview
netlify deploy
```

See `.netlify/config.toml` for deployment settings.

## Contributing

1. Create a feature branch
2. Make your changes
3. Run `pnpm lint` and `pnpm format`
4. Run `pnpm test` and `pnpm typecheck`
5. Submit a pull request

All PRs must pass CI checks before merging.

## License

MIT
