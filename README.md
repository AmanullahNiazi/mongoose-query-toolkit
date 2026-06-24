# mongoose-query-toolkit

A powerful and flexible toolkit for handling Mongoose queries with support for search, filtering, pagination, sorting, and field selection.

## Features

- 🔍 **Search**: Easily search across multiple fields (regex or `$text` index mode)
- 🔁 **Filtering**: Exact-match, multi-value (`$in`), and operator filters (`gte`, `lte`, `ne`, ...)
- 📄 **Pagination**: Offset-based and cursor-based (keyset) pagination
- 📊 **Sorting**: Sort results by any field (ascending or descending)
- 🔎 **Field Selection**: Select only the fields you need in the response
- 🔗 **Population**: Eager-load referenced documents, with optional per-path field selection
- ⚡ **Lean Queries**: Return plain JS objects for faster read-only responses
- 🔢 **Count Mode**: Get document counts without fetching data
- 🎯 **Single-document helpers**: `findOne` and `exists`
- 📋 **Query Presets**: Define and reuse named query configurations
- 🛡️ **Hardened**: Regex/NoSQL-injection safe with bounded pagination

## Installation

```bash
npm install mongoose-query-toolkit
```

## Usage

```typescript
import { QueryToolkit } from 'mongoose-query-toolkit';
import { User } from './models/user';

// Initialize the toolkit with your Mongoose model
const userQueryToolkit = new QueryToolkit(User, {
  searchFields: ['name', 'email'],
  filterableFields: ['status', 'role'],
  selectableFields: ['name', 'email', 'status', 'role', 'createdAt'],
  populatableFields: ['profile', 'posts', 'comments']
});

// Use the toolkit to query your data
async function getUsers() {
  const result = await userQueryToolkit.findWithOptions({
    q: 'john',              // Search term
    status: 'active',       // Filter
    page: 1,               // Page number
    limit: 10,             // Items per page
    sort: '-createdAt,name', // Sort by createdAt DESC and name ASC
    select: 'name,email,status', // Only return these fields
    populate: 'profile,posts' // Eager-load referenced documents
  });

  console.log(result);
  // {
  //   docs: [...],         // Array of documents
  //   totalDocs: 100,      // Total number of documents
  //   limit: 10,           // Items per page
  //   page: 1,             // Current page
  //   totalPages: 10,      // Total number of pages
  //   hasNextPage: true,   // If there's a next page
  //   hasPrevPage: false   // If there's a previous page
  // }
}
```

## API Reference

### QueryToolkit

#### Constructor

```typescript
new QueryToolkit(model, options)
```

- `model`: Mongoose model
- `options`: Configuration object
  - `searchFields`: Array of fields to search in
  - `filterableFields`: Array of fields that can be filtered
  - `selectableFields`: Array of fields that can be selected (if empty, all fields can be selected)
  - `populatableFields`: Array of fields that can be populated (if empty, all fields can be populated)
  - `defaultLimit`: Default page size when `limit` is omitted or invalid (default: `10`)
  - `maxLimit`: Maximum allowed page size; larger `limit` values are clamped to this (default: `100`)
  - `searchMode`: `'regex'` (default) or `'text'` to use a MongoDB `$text` index for search
  - `lean`: When `true`, all queries return plain JS objects by default (default: `false`)
  - `splitCommaValues`: When `true`, a comma-separated filter string (e.g. `status=active,pending`) is treated as a multi-value `$in`. Off by default so values that legitimately contain commas keep exact-match semantics (default: `false`)

#### Security & input handling

The toolkit is hardened against common API abuse:

- **Regex injection / ReDoS**: search terms are escaped before being used in `$regex`, so special characters cannot break or hang the query.
- **NoSQL operator injection**: filter values must be primitives or arrays of primitives. Object values (e.g. `?status[$ne]=active`) are rejected, preventing operator injection on whitelisted fields.
- **Pagination bounds**: `page` and `limit` are coerced from strings, `page` is forced to `>= 1`, and `limit` is clamped to `[1, maxLimit]` to prevent unbounded collection scans.
- **Select safety**: mixing inclusion and exclusion fields (which MongoDB rejects) is normalized by dropping exclusions in favor of inclusions.

#### Methods

##### findWithOptions(options)

```typescript
interface QueryOptions {
  q?: string;              // Search term
  page?: number;           // Page number (default: 1)
  limit?: number;          // Items per page (default: 10)
  sort?: string;           // Sort string (e.g., '-createdAt,name')
  select?: string;         // Fields to select (e.g., 'name,email' or '-password,-__v')
  populate?: string;       // Fields to populate (e.g., 'profile,posts,comments')
  [key: string]: any;      // Additional filter fields
}
```

Returns a promise that resolves to:

```typescript
interface PaginationResult<T> {
  docs: T[];              // Array of documents
  totalDocs: number;      // Total number of documents
  limit: number;          // Items per page
  page: number;           // Current page
  totalPages: number;     // Total number of pages
  hasNextPage: boolean;   // If there's a next page
  hasPrevPage: boolean;   // If there's a previous page
}
```

##### countWithOptions(options)

Get the total count of documents matching the query without fetching the actual documents. This is more efficient than `findWithOptions` when you only need the count.

```typescript
// Count all active users
const totalActive = await userQueryToolkit.countWithOptions({
  status: 'active'
});
console.log(totalActive); // 42

// Count with search
const searchResults = await userQueryToolkit.countWithOptions({
  q: 'john',
  status: 'active'
});
console.log(searchResults); // 5

// Count with multiple filters
const adminCount = await userQueryToolkit.countWithOptions({
  status: 'active',
  role: 'admin'
});
console.log(adminCount); // 3
```

**Note:** `countWithOptions` supports the same query options as `findWithOptions` (search term `q` and filter fields), but ignores pagination, sorting, field selection, and population options since they don't affect the count.

Returns a promise that resolves to a `number` representing the total count of matching documents.

### Advanced Filtering

#### Multi-value filters (`$in`)

Pass an array for any filterable field to match multiple values:

```typescript
await userQueryToolkit.findWithOptions({ status: ['active', 'pending'] });
// → { status: { $in: ['active', 'pending'] } }
```

To accept comma-separated strings (e.g. from a query string `?status=active,pending`),
enable `splitCommaValues` in the constructor. It is **off by default** so that values
which legitimately contain commas (names, addresses) keep exact-match semantics:

```typescript
const toolkit = new QueryToolkit(User, {
  filterableFields: ['status'],
  splitCommaValues: true,
});
await toolkit.findWithOptions({ status: 'active,pending' });
// → { status: { $in: ['active', 'pending'] } }
```

Alternatively, use the explicit `in` operator (see below) regardless of this setting.

#### Operator filters

Pass an object of operators for ranges and comparisons. Only a safe, whitelisted
set of operators is allowed — anything else (including raw `$`-prefixed keys) is
silently dropped to prevent NoSQL injection.

| Public operator | MongoDB |
| --------------- | ------- |
| `eq`            | `$eq`   |
| `ne`            | `$ne`   |
| `gt`            | `$gt`   |
| `gte`           | `$gte`  |
| `lt`            | `$lt`   |
| `lte`           | `$lte`  |
| `in`            | `$in`   |
| `nin`           | `$nin`  |

```typescript
await productQueryToolkit.findWithOptions({
  price: { gte: 10, lte: 100 },          // price between 10 and 100
  createdAt: { gte: '2024-01-01' },      // date range
  category: { in: ['books', 'music'] },
});
```

### Lean Queries

Return plain JavaScript objects instead of Mongoose documents for faster,
read-only responses. Enable per-query or globally via the constructor.

```typescript
await userQueryToolkit.findWithOptions({ status: 'active', lean: true });
```

### Cursor-based Pagination

For large collections, cursor (keyset) pagination avoids the performance cost of
large `skip` offsets. Pass the returned `nextCursor` back in to fetch the next page.

```typescript
const page1 = await userQueryToolkit.findWithCursor({ limit: 20 });
// page1 => { docs, limit, nextCursor, hasNextPage }

if (page1.hasNextPage) {
  const page2 = await userQueryToolkit.findWithCursor({
    limit: 20,
    cursor: page1.nextCursor,
  });
}

// Custom cursor field and direction
await userQueryToolkit.findWithCursor({
  limit: 20,
  cursorField: 'createdAt',
  direction: 'desc',
});
```

```typescript
interface CursorResult<T> {
  docs: T[];
  limit: number;
  nextCursor: string | null;  // pass back as `cursor` for the next page
  hasNextPage: boolean;
}
```

### Text-index Search

When the collection has a MongoDB text index, set `searchMode: 'text'` to use
`$text` search instead of regex — faster and index-backed on large datasets.

```typescript
const toolkit = new QueryToolkit(Article, { searchMode: 'text' });
await toolkit.findWithOptions({ q: 'mongoose pagination' });
// → { $text: { $search: 'mongoose pagination' } }
```

### Populate with Field Selection

Select specific fields on populated paths using `path:field1,field2`. The grammar
is deterministic:

- **`;`** always separates populated paths
- **`,`** separates the selected fields of a single path

```typescript
await userQueryToolkit.findWithOptions({
  populate: 'profile:name,avatar;posts:title,createdAt',
});
```

Plain comma-separated populate (when no `:` is used) continues to work as a list
of paths:

```typescript
await userQueryToolkit.findWithOptions({ populate: 'profile,posts' });
```

> **Security note:** `populatableFields` whitelists which *paths* may be
> populated — this is the security boundary. The per-path field selection
> (`profile:...`) is **not** itself whitelisted, so do not add a relation to
> `populatableFields` if its referenced documents contain sensitive fields you
> don't want clients to project. Restrict populatable paths to safe relations,
> or omit `populatableFields` only in trusted/server-side contexts.

### Single-document Helpers

#### findOne(options)

Returns the first document matching the search/filter options (or `null`).
Supports `select`, `populate`, `sort`, and `lean`.

```typescript
const user = await userQueryToolkit.findOne({ q: 'john', status: 'active' });
```

#### exists(options)

Returns `true` if at least one matching document exists.

```typescript
const taken = await userQueryToolkit.exists({ email: 'john@example.com' });
```

### Query Presets

Define reusable query configurations that can be called by name with optional parameter overrides.

#### definePreset(name, options)

Define a named query preset with specific options.

```typescript
// Define a preset for active users
userQueryToolkit.definePreset('activeUsers', {
  status: 'active',
  sort: '-createdAt',
  limit: 20
});

// Define a preset for admin users
userQueryToolkit.definePreset('admins', {
  role: 'admin',
  sort: 'name'
});

// Define a complex preset with multiple filters
userQueryToolkit.definePreset('recentActiveAdmins', {
  status: 'active',
  role: 'admin',
  sort: '-createdAt',
  limit: 10,
  select: 'name,email,createdAt'
});
```

#### findWithPreset(presetName, overrides?)

Query using a preset with optional parameter overrides.

```typescript
// Use preset as-is
const result = await userQueryToolkit.findWithPreset('activeUsers');

// Override pagination
const page2 = await userQueryToolkit.findWithPreset('activeUsers', {
  page: 2
});

// Override multiple options
const customResult = await userQueryToolkit.findWithPreset('activeUsers', {
  page: 1,
  limit: 50,
  select: 'name,email'
});

// Add additional filters
const searchResult = await userQueryToolkit.findWithPreset('activeUsers', {
  q: 'john'  // Search within active users
});
```

#### countWithPreset(presetName, overrides?)

Count documents using a preset with optional overrides.

```typescript
// Count using preset
const totalActive = await userQueryToolkit.countWithPreset('activeUsers');
console.log(totalActive); // 42

// Count with additional filters
const adminCount = await userQueryToolkit.countWithPreset('activeUsers', {
  role: 'admin'
});
console.log(adminCount); // 8
```

#### Preset Management Methods

```typescript
// Check if preset exists
const exists = userQueryToolkit.hasPreset('activeUsers');
console.log(exists); // true

// Get preset configuration
const preset = userQueryToolkit.getPreset('activeUsers');
console.log(preset); // { status: 'active', sort: '-createdAt', limit: 20 }

// List all preset names
const presets = userQueryToolkit.listPresets();
console.log(presets); // ['activeUsers', 'admins', 'recentActiveAdmins']

// Delete a preset
const deleted = userQueryToolkit.deletePreset('activeUsers');
console.log(deleted); // true
```

**Benefits of Presets:**
- **Consistency**: Ensure same query logic is used across your application
- **Reusability**: Define once, use anywhere
- **Maintainability**: Update query logic in one place
- **Flexibility**: Override any preset option when needed
- **Type Safety**: Full TypeScript support with intellisense

## License

MIT