import { Document, Model } from 'mongoose';

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
  private defaultLimit: number;
  private maxLimit: number;
  private presets: Map<string, QueryOptions> = new Map();

  constructor(
    private readonly model: Model<T>,
    options: {
      searchFields?: string[];
      filterableFields?: string[];
      selectableFields?: string[];
      populatableFields?: string[];
      defaultLimit?: number;
      maxLimit?: number;
    } = {}
  ) {
    this.searchFields = options.searchFields || [];
    this.filterableFields = options.filterableFields || [];
    this.selectableFields = options.selectableFields || [];
    this.populatableFields = options.populatableFields || [];
    this.defaultLimit = options.defaultLimit ?? 10;
    this.maxLimit = options.maxLimit ?? 100;
  }

  /**
   * Escapes regex special characters to prevent regex injection and
   * catastrophic backtracking (ReDoS) from user-supplied search terms.
   */
  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildSearchQuery(q: string): object {
    if (!q || !this.searchFields.length) return {};

    const safe = this.escapeRegex(q);

    return {
      $or: this.searchFields.map((field) => ({
        [field]: { $regex: safe, $options: 'i' },
      })),
    };
  }

  private buildFilterQuery(options: QueryOptions): object {
    const filterQuery: any = {};

    for (const key of this.filterableFields) {
      const value = options[key];
      if (value === undefined) continue;

      // Prevent NoSQL operator injection (e.g. ?status[$ne]=active parsed
      // into an object). Only allow primitive values and arrays of primitives.
      if (!this.isSafeFilterValue(value)) continue;

      filterQuery[key] = value;
    }

    return filterQuery;
  }

  /**
   * A filter value is safe when it is a primitive (string/number/boolean)
   * or an array of primitives. Plain objects are rejected because they can
   * carry MongoDB query operators ($ne, $gt, $where, ...).
   */
  private isSafeFilterValue(value: any): boolean {
    if (value === null) return true;

    if (Array.isArray(value)) {
      return value.every((item) => this.isPrimitive(item));
    }

    return this.isPrimitive(value);
  }

  private isPrimitive(value: any): boolean {
    const type = typeof value;
    return type === 'string' || type === 'number' || type === 'boolean';
  }

  /**
   * Coerces and clamps pagination input. Query-string params arrive as
   * strings, so values are normalized to integers, page is forced to >= 1,
   * and limit is bounded to [1, maxLimit] to prevent unbounded scans.
   */
  private normalizePagination(
    page?: number | string,
    limit?: number | string
  ): { page: number; limit: number } {
    const parsedPage = Math.floor(Number(page));
    const parsedLimit = Math.floor(Number(limit));

    const safePage =
      Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

    let safeLimit =
      Number.isFinite(parsedLimit) && parsedLimit >= 1
        ? parsedLimit
        : this.defaultLimit;

    if (safeLimit > this.maxLimit) safeLimit = this.maxLimit;

    return { page: safePage, limit: safeLimit };
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

    let fields = select
      .split(',')
      .map((field) => field.trim())
      .filter((field) => field.length > 0);

    // Filter fields based on selectableFields (if a whitelist is configured)
    if (this.selectableFields.length > 0) {
      fields = fields.filter((field) => {
        const fieldName = field.startsWith('-') ? field.substring(1) : field;
        return this.selectableFields.includes(fieldName);
      });
    }

    if (fields.length === 0) return null;

    // MongoDB does not allow mixing inclusion and exclusion (except for _id).
    // If both are present, prefer inclusion fields and drop exclusions.
    const hasInclusion = fields.some(
      (field) => !field.startsWith('-')
    );
    const hasExclusion = fields.some((field) => field.startsWith('-'));

    if (hasInclusion && hasExclusion) {
      fields = fields.filter(
        (field) => !field.startsWith('-') || field === '-_id'
      );
    }

    return fields.length > 0 ? fields.join(' ') : null;
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
    const { q, page: rawPage, limit: rawLimit, sort, select, populate, ...filterOptions } = options;
    const { page, limit } = this.normalizePagination(rawPage, rawLimit);
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

  async countWithOptions(options: QueryOptions = {}): Promise<number> {
    const { q, ...filterOptions } = options;

    const query = {
      ...this.buildSearchQuery(q || ''),
      ...this.buildFilterQuery(filterOptions),
    };

    return this.model.countDocuments(query);
  }

  definePreset(name: string, options: QueryOptions): void {
    this.presets.set(name, { ...options });
  }

  getPreset(name: string): QueryOptions | undefined {
    return this.presets.get(name);
  }

  hasPreset(name: string): boolean {
    return this.presets.has(name);
  }

  deletePreset(name: string): boolean {
    return this.presets.delete(name);
  }

  listPresets(): string[] {
    return Array.from(this.presets.keys());
  }

  async findWithPreset(
    presetName: string,
    overrides: QueryOptions = {}
  ): Promise<PaginationResult<T>> {
    const preset = this.presets.get(presetName);

    if (!preset) {
      throw new Error(`Preset "${presetName}" not found. Available presets: ${this.listPresets().join(', ') || 'none'}`);
    }

    // Merge preset with overrides (overrides take precedence)
    const mergedOptions = { ...preset, ...overrides };

    return this.findWithOptions(mergedOptions);
  }

  async countWithPreset(
    presetName: string,
    overrides: QueryOptions = {}
  ): Promise<number> {
    const preset = this.presets.get(presetName);

    if (!preset) {
      throw new Error(`Preset "${presetName}" not found. Available presets: ${this.listPresets().join(', ') || 'none'}`);
    }

    // Merge preset with overrides (overrides take precedence)
    const mergedOptions = { ...preset, ...overrides };

    return this.countWithOptions(mergedOptions);
  }
}