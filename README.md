# mongoose-query-toolkit

A powerful and flexible toolkit for handling Mongoose queries with support for search, filtering, pagination, and sorting.

## Features

- 🔍 **Search**: Easily search across multiple fields
- 🔁 **Filtering**: Filter documents by any field
- 📄 **Pagination**: Built-in pagination support
- 📊 **Sorting**: Sort results by any field (ascending or descending)

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
  filterableFields: ['status', 'role']
});

// Use the toolkit to query your data
async function getUsers() {
  const result = await userQueryToolkit.findWithOptions({
    q: 'john',              // Search term
    status: 'active',       // Filter
    page: 1,               // Page number
    limit: 10,             // Items per page
    sort: '-createdAt,name' // Sort by createdAt DESC and name ASC
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

#### Methods

##### findWithOptions(options)

```typescript
interface QueryOptions {
  q?: string;              // Search term
  page?: number;           // Page number (default: 1)
  limit?: number;          // Items per page (default: 10)
  sort?: string;           // Sort string (e.g., '-createdAt,name')
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

## License

MIT