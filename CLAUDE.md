# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mongoose-query-toolkit is a TypeScript library that provides a unified interface for handling Mongoose queries with support for search, filtering, pagination, sorting, field selection, and population. It's designed to be used as an npm package.

## Commands

### Build
```bash
npm run build
```
Compiles TypeScript to JavaScript in the `dist/` directory. The build automatically runs before npm publish via the `prepare` script.

### Test
```bash
npm test              # Run all tests
npm test -- --watch   # Run tests in watch mode
```
Tests are located in `src/__tests__/` and use Jest with ts-jest preset. Test files must match the pattern `**/__tests__/**/*.test.ts`.

### Lint
```bash
npm run lint
```
Runs ESLint on all TypeScript files in `src/`. The project uses `@typescript-eslint` with explicit function return types and explicit any types disabled.

## Architecture

### Core Component: QueryToolkit Class

The entire library consists of a single class `QueryToolkit<T>` in [src/index.ts](src/index.ts) that wraps a Mongoose model and provides a fluent query interface.

**Key Design Patterns:**

1. **Configuration-based Security**: The constructor accepts whitelists for searchable, filterable, selectable, and populatable fields. This prevents arbitrary field access and provides fine-grained control over what fields can be queried.

2. **Query Building Pipeline**: The `findWithOptions` method orchestrates multiple private methods that build different query components:
   - `buildSearchQuery` - Creates `$or` regex queries across searchFields
   - `buildFilterQuery` - Builds exact match filters for filterableFields
   - `parseSortString` - Converts comma-separated sort strings (e.g., `-createdAt,name`) into MongoDB sort objects
   - `buildSelectQuery` - Converts comma-separated field lists into Mongoose select syntax
   - `buildPopulateFields` - Parses and validates fields to populate

3. **Chain Application**: Query operations are chained in a specific order on the Mongoose query: `find → sort → select → populate → skip → limit → exec`

4. **Parallel Execution**: Document fetching and count queries run in parallel using `Promise.all` for performance.

### Type System

- `QueryOptions`: Interface for incoming query parameters (q, page, limit, sort, select, populate, + dynamic filter fields)
- `PaginationResult<T>`: Interface for returned results with metadata (docs, totalDocs, page, totalPages, hasNextPage, hasPrevPage)
- Generic type `<T extends Document>` ensures type safety with the Mongoose model

### Testing Strategy

Tests in [src/__tests__/index.test.ts](src/__tests__/index.test.ts) use extensive Jest mocking to simulate Mongoose query chains without requiring a real database. The mock setup handles the fluent API by returning objects with all necessary methods (sort, select, skip, limit, populate, exec).

## TypeScript Configuration

- Target: ES2018, CommonJS modules
- Output: `dist/` directory with declaration files (`.d.ts`)
- Strict mode enabled
- Test files (`**/*.test.ts`) excluded from compilation