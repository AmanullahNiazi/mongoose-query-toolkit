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

## License

MIT