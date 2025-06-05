import { Query, Document, Model } from 'mongoose';

export interface QueryOptions {
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
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

  constructor(
    private readonly model: Model<T>,
    options: {
      searchFields?: string[];
      filterableFields?: string[];
    } = {}
  ) {
    this.searchFields = options.searchFields || [];
    this.filterableFields = options.filterableFields || [];
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

  async findWithOptions(options: QueryOptions = {}): Promise<PaginationResult<T>> {
    const { q, page = 1, limit = 10, sort, ...filterOptions } = options;
    const skip = (page - 1) * limit;

    const query = {
      ...this.buildSearchQuery(q || ''),
      ...this.buildFilterQuery(filterOptions),
    };

    const sortQuery = this.parseSortString(sort);

    const [docs, totalDocs] = await Promise.all([
      this.model
        .find(query)
        .sort(sortQuery)
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