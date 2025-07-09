import mongoose, { Document, Model } from 'mongoose';

export interface QueryOptions {
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  select?: string;
  populate?: string;
  [key: string]: any;
}

export interface PaginationResult<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export class QueryToolkit<T extends Document> {
  private searchFields: string[];
  private filterableFields: string[];
  private selectableFields: string[];
  private populatableFields: string[] = [];

  constructor(
    private readonly model: Model<T>,
    options: {
      searchFields?: string[];
      filterableFields?: string[];
      selectableFields?: string[];
      populatableFields?: string[];
    } = {}
  ) {
    this.searchFields = options.searchFields || [];
    this.filterableFields = options.filterableFields || [];
    this.selectableFields = options.selectableFields || [];
    this.populatableFields = options.populatableFields || [];
  }

  private buildSearchQuery(q: string): object {
    if (!q || !this.searchFields.length) return {};

    return {
      $or: this.searchFields.map((field) => ({
        [field]: { $regex: q, $options: 'i' },
      })),
    };
  }

  private buildFilterQuery(options: QueryOptions): object {
    const filterQuery: any = {};

    for (const key of this.filterableFields) {
      if (options[key] !== undefined) {
        filterQuery[key] = options[key];
      }
    }

    return filterQuery;
  }

  private parseSortString(sort?: string): Record<string, 1 | -1> {
    const sortQuery: Record<string, 1 | -1> = {};
    
    if (!sort) return sortQuery;

    sort.split(',').forEach((field) => {
      const order = field.startsWith('-') ? -1 : 1;
      const fieldName = field.startsWith('-') ? field.substring(1) : field;
      sortQuery[fieldName] = order;
    });

    return sortQuery;
  }

  private buildSelectQuery(select?: string): string | null {
    if (!select) return null;
    
    // If selectableFields is empty, allow all fields
    if (this.selectableFields.length === 0) {
      return select.replace(/,/g, ' ');
    }
    
    // Filter fields based on selectableFields
    const fields = select.split(',');
    const validFields = fields.filter(field => {
      // Handle exclusion fields (fields with minus prefix)
      const fieldName = field.startsWith('-') ? field.substring(1) : field;
      return this.selectableFields.includes(fieldName);
    });
    
    return validFields.join(' ');
  }

  private buildPopulateFields(populate?: string): string[] {
    if (!populate) return [];

    // Convert comma-separated fields to array
    const fields = populate.split(',').map(field => field.trim());
    
    // If populatableFields is empty, allow all fields
    if (this.populatableFields.length === 0) {
      return fields;
    }
    
    // Filter fields based on populatableFields
    return fields.filter(field => this.populatableFields.includes(field));
  }

  async findWithOptions(options: QueryOptions = {}): Promise<PaginationResult<T>> {
    const { q, page = 1, limit = 10, sort, select, populate, ...filterOptions } = options;
    const skip = (page - 1) * limit;

    const query = {
      ...this.buildSearchQuery(q || ''),
      ...this.buildFilterQuery(filterOptions),
    };

    const sortQuery = this.parseSortString(sort);
    const selectQuery = this.buildSelectQuery(select);
    const populateFields = this.buildPopulateFields(populate);

    let findQuery = this.model.find(query);
    
    if (sortQuery && Object.keys(sortQuery).length > 0) {
      findQuery = findQuery.sort(sortQuery);
    }
    
    if (selectQuery) {
      findQuery = findQuery.select(selectQuery);
    }
    
    // Apply populate fields
    populateFields.forEach(field => {
      // Using type assertion to handle the TypeScript error
      findQuery = findQuery.populate(field) as any;
    });
    
    const [docs, totalDocs] = await Promise.all([
      findQuery
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalDocs / limit);

    return {
      docs,
      totalDocs,
      limit,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }
}