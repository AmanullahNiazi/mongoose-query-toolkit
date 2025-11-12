# mongoose-query-toolkit

A powerful and flexible toolkit for handling Mongoose queries with support for search, filtering, pagination, sorting, and field selection.

## Features

- 🔍 **Search**: Easily search across multiple fields
- 🔁 **Filtering**: Filter documents by any field
- 📄 **Pagination**: Built-in pagination support
- 📊 **Sorting**: Sort results by any field (ascending or descending)
- 🔎 **Field Selection**: Select only the fields you need in the response
- 🔗 **Population**: Eager-load referenced documents
- 🔢 **Count Mode**: Get document counts without fetching data
- 📋 **Query Presets**: Define and reuse named query configurations

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