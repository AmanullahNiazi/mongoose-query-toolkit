import { Document, Model } from 'mongoose';

export interface QueryOptions {
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  select?: string;
  populate?: string;
  lean?: boolean;
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

export interface CursorOptions {
  q?: string;
  limit?: number;
  cursor?: string | null;
  cursorField?: string;
  direction?: 'asc' | 'desc';
  select?: string;
  populate?: string;
  lean?: boolean;
  [key: string]: any;
}

export interface CursorResult<T> {
  docs: T[];
  limit: number;
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface PopulateConfig {
  path: string;
  select?: string;
}

export type SearchMode = 'regex' | 'text';

/**
 * Maps the public, safe operator names accepted from query input to their
 * MongoDB equivalents. Only operators listed here are allowed; anything else
 * (including raw $-prefixed keys) is dropped to prevent operator injection.
 */
const OPERATOR_MAP: Record<string, string> = {
  eq: '$eq',
  ne: '$ne',
  gt: '$gt',
  gte: '$gte',
  lt: '$lt',
  lte: '$lte',
  in: '$in',
  nin: '$nin',
};

export class QueryToolkit<T extends Document> {
  private searchFields: string[];
  private filterableFields: string[];
  private selectableFields: string[];
  private populatableFields: string[] = [];
  private defaultLimit: number;
  private maxLimit: number;
  private searchMode: SearchMode;
  private leanByDefault: boolean;
  private splitCommaValues: boolean;
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
      searchMode?: SearchMode;
      lean?: boolean;
      splitCommaValues?: boolean;
    } = {}
  ) {
    this.searchFields = options.searchFields || [];
    this.filterableFields = options.filterableFields || [];
    this.selectableFields = options.selectableFields || [];
    this.populatableFields = options.populatableFields || [];
    this.defaultLimit = options.defaultLimit ?? 10;
    this.maxLimit = options.maxLimit ?? 100;
    this.searchMode = options.searchMode ?? 'regex';
    this.leanByDefault = options.lean ?? false;
    this.splitCommaValues = options.splitCommaValues ?? false;
  }

  /**
   * Escapes regex special characters to prevent regex injection and
   * catastrophic backtracking (ReDoS) from user-supplied search terms.
   */
  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildSearchQuery(q: string): object {
    if (!q) return {};

    // Text-index mode delegates matching to a MongoDB text index ($text),
    // which is faster on large collections and needs no regex escaping.
    if (this.searchMode === 'text') {
      return { $text: { $search: q } };
    }

    if (!this.searchFields.length) return {};

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

      const built = this.buildFilterValue(value);
      if (built !== undefined) {
        filterQuery[key] = built;
      }
    }

    return filterQuery;
  }

  /**
   * Translates a single filter value into a safe Mongo query fragment:
   * - arrays become `$in` (multi-value filter); comma-separated strings also
   *   become `$in` only when `splitCommaValues` is enabled (off by default, so
   *   values that legitimately contain commas keep exact-match semantics)
   * - objects are treated as operator filters, keeping only whitelisted
   *   operators (gte, lte, ne, in, ...) and dropping anything unrecognized
   *   to block NoSQL operator injection ($where, $function, raw $-keys, ...)
   * - primitives become exact-match
   * Returns `undefined` when nothing safe could be derived.
   */
  private buildFilterValue(value: any): any {
    if (value === null) return null;

    if (Array.isArray(value)) {
      const safe = value.filter((item) => this.isPrimitive(item));
      return safe.length ? { $in: safe } : undefined;
    }

    if (this.isPrimitive(value)) {
      if (this.splitCommaValues && typeof value === 'string' && value.includes(',')) {
        const parts = this.toMultiValue(value);
        return parts.length > 1 ? { $in: parts } : parts[0] ?? value;
      }
      return value;
    }

    if (typeof value === 'object') {
      return this.buildOperatorFilter(value);
    }

    return undefined;
  }

  /**
   * Splits an array or comma-separated string into a deduped list of safe
   * primitive values (used by `$in`/`$nin` and comma-value filters).
   */
  private toMultiValue(raw: any): any[] {
    const arr = Array.isArray(raw)
      ? raw
      : String(raw)
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
    return arr.filter((item) => this.isPrimitive(item));
  }

  private buildOperatorFilter(value: Record<string, any>): any {
    const operators: any = {};

    for (const op of Object.keys(value)) {
      // Own-property + whitelist check: inherited keys (constructor,
      // toString, __proto__, ...) must NOT resolve to a mapped operator.
      if (!Object.prototype.hasOwnProperty.call(OPERATOR_MAP, op)) continue;

      const mapped = OPERATOR_MAP[op];
      const raw = value[op];

      if (op === 'in' || op === 'nin') {
        const safe = this.toMultiValue(raw);
        if (safe.length) operators[mapped] = safe;
      } else if (this.isPrimitive(raw)) {
        operators[mapped] = raw;
      }
    }

    return Object.keys(operators).length ? operators : undefined;
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
    const safePage =
      Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

    return { page: safePage, limit: this.normalizeLimit(limit) };
  }

  private normalizeLimit(limit?: number | string): number {
    const parsed = Math.floor(Number(limit));
    let safe =
      Number.isFinite(parsed) && parsed >= 1 ? parsed : this.defaultLimit;
    if (safe > this.maxLimit) safe = this.maxLimit;
    return safe;
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

  /**
   * Parses the populate string into populate configs, optionally with
   * per-path field selection.
   *
   * Grammar (deterministic — `;` always separates paths, `,` separates the
   * selected fields of a single path):
   * - `profile,posts`                  → populate both paths (legacy, no `:`)
   * - `profile:name,avatar`            → populate `profile` selecting name+avatar
   * - `profile:name;posts:title,body`  → multiple paths, each with selection
   * - `profile;posts:title`            → mix paths with and without selection
   */
  private buildPopulateFields(populate?: string): PopulateConfig[] {
    if (!populate) return [];

    const configs: PopulateConfig[] = [];

    // `;` always delimits separate populate paths.
    for (const entry of populate.split(';')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;

      const colonIndex = trimmed.indexOf(':');

      // No selection on this entry → legacy comma-separated list of paths.
      if (colonIndex === -1) {
        for (const rawPath of trimmed.split(',')) {
          this.addPopulateConfig(configs, rawPath.trim());
        }
        continue;
      }

      // `path:field1,field2` — split on the FIRST colon only so a select
      // value is never truncated by a stray second colon.
      const path = trimmed.slice(0, colonIndex).trim();
      const select = trimmed
        .slice(colonIndex + 1)
        .split(',')
        .map((field) => field.trim())
        .filter((field) => field.length > 0)
        .join(' ');

      this.addPopulateConfig(configs, path, select || undefined);
    }

    return configs;
  }

  private addPopulateConfig(
    configs: PopulateConfig[],
    path: string,
    select?: string
  ): void {
    if (!path) return;

    if (
      this.populatableFields.length > 0 &&
      !this.populatableFields.includes(path)
    ) {
      return;
    }

    const config: PopulateConfig = { path };
    if (select) config.select = select;
    configs.push(config);
  }

  /**
   * Assembles the base match query shared by every read method from the
   * search term and the whitelisted filter options.
   */
  private buildBaseQuery(q: string | undefined, filterOptions: QueryOptions): Record<string, any> {
    return {
      ...this.buildSearchQuery(q || ''),
      ...this.buildFilterQuery(filterOptions),
    };
  }

  /** Returns the filter fields of an options object, excluding reserved keys. */
  private extractFilters(options: QueryOptions): QueryOptions {
    const reserved = new Set(['q', 'page', 'limit', 'sort', 'select', 'populate', 'lean']);
    const filters: QueryOptions = {};
    for (const key of Object.keys(options)) {
      if (!reserved.has(key)) filters[key] = options[key];
    }
    return filters;
  }

  /** Reads a possibly dotted path (e.g. `profile.score`) off a document. */
  private getValueByPath(doc: any, path: string): any {
    if (doc == null) return undefined;
    if (path.indexOf('.') === -1) return doc[path];
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), doc);
  }

  /** Encodes a cursor field value into a string that round-trips losslessly. */
  private encodeCursor(value: any): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private applyCommonModifiers(
    findQuery: any,
    select?: string,
    populate?: string,
    lean?: boolean
  ): any {
    const selectQuery = this.buildSelectQuery(select);
    if (selectQuery) {
      findQuery = findQuery.select(selectQuery);
    }

    const populateFields = this.buildPopulateFields(populate);
    populateFields.forEach((config) => {
      findQuery = findQuery.populate(config) as any;
    });

    if (lean ?? this.leanByDefault) {
      findQuery = findQuery.lean();
    }

    return findQuery;
  }

  async findWithOptions(options: QueryOptions = {}): Promise<PaginationResult<T>> {
    const { q, page: rawPage, limit: rawLimit, sort, select, populate, lean, ...filterOptions } = options;
    const { page, limit } = this.normalizePagination(rawPage, rawLimit);
    const skip = (page - 1) * limit;

    const query = this.buildBaseQuery(q, filterOptions);

    const sortQuery = this.parseSortString(sort);

    let findQuery = this.model.find(query);

    if (sortQuery && Object.keys(sortQuery).length > 0) {
      findQuery = findQuery.sort(sortQuery);
    }

    findQuery = this.applyCommonModifiers(findQuery, select, populate, lean);

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

  /**
   * Cursor-based (keyset) pagination. Scales to large collections because it
   * avoids the growing `skip` cost of offset pagination. Pass the `nextCursor`
   * from the previous result back in as `cursor` to fetch the following page.
   */
  async findWithCursor(options: CursorOptions = {}): Promise<CursorResult<T>> {
    const {
      q,
      limit: rawLimit,
      cursor,
      cursorField = '_id',
      direction = 'asc',
      select,
      populate,
      lean,
      ...filterOptions
    } = options;

    const limit = this.normalizeLimit(rawLimit);
    const comparator = direction === 'desc' ? '$lt' : '$gt';

    const query: any = this.buildBaseQuery(q, filterOptions);

    if (cursor !== undefined && cursor !== null && cursor !== '') {
      const cursorCondition = { [cursorField]: { [comparator]: cursor } };
      if (query[cursorField] !== undefined) {
        // A filter already constrains this field — combine both conditions
        // with $and instead of letting the cursor clobber the filter.
        const existing = { [cursorField]: query[cursorField] };
        delete query[cursorField];
        query.$and = [...(query.$and || []), existing, cursorCondition];
      } else {
        query[cursorField] = cursorCondition[cursorField];
      }
    }

    let findQuery = this.model
      .find(query)
      .sort({ [cursorField]: direction === 'desc' ? -1 : 1 });

    findQuery = this.applyCommonModifiers(findQuery, select, populate, lean);

    // Fetch one extra document to detect whether a further page exists.
    const docs = await findQuery.limit(limit + 1).exec();

    const hasNextPage = docs.length > limit;
    const pageDocs = hasNextPage ? docs.slice(0, limit) : docs;

    let nextCursor: string | null = null;
    if (hasNextPage && pageDocs.length > 0) {
      const last = pageDocs[pageDocs.length - 1];
      nextCursor = this.encodeCursor(this.getValueByPath(last, cursorField));
    }

    return {
      docs: pageDocs as T[],
      limit,
      nextCursor,
      hasNextPage,
    };
  }

  /**
   * Returns a single document matching the search/filter options, or null.
   * Supports select, populate and lean; pagination/sort options are ignored.
   */
  async findOne(options: QueryOptions = {}): Promise<T | null> {
    // page/limit are intentionally ignored for a single-document lookup.
    const { q, sort, select, populate, lean } = options;
    const filterOptions = this.extractFilters(options);

    const query = this.buildBaseQuery(q, filterOptions);

    let findQuery = this.model.findOne(query);

    const sortQuery = this.parseSortString(sort);
    if (Object.keys(sortQuery).length > 0) {
      findQuery = findQuery.sort(sortQuery);
    }

    findQuery = this.applyCommonModifiers(findQuery, select, populate, lean);

    return findQuery.exec();
  }

  /**
   * Returns true if at least one document matches the search/filter options.
   */
  async exists(options: QueryOptions = {}): Promise<boolean> {
    const { q, ...filterOptions } = options;
    const query = this.buildBaseQuery(q, filterOptions);

    const result = await this.model.exists(query);
    return result !== null;
  }

  async countWithOptions(options: QueryOptions = {}): Promise<number> {
    const { q, ...filterOptions } = options;
    const query = this.buildBaseQuery(q, filterOptions);

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

  /**
   * Looks up a preset and merges it with overrides. Overrides take precedence;
   * when both preset and override hold a plain object for the same key (e.g. an
   * operator filter `{ gte: 10 }`), the two objects are merged rather than the
   * preset's value being wholly replaced — so `{ gte: 10 }` + `{ lte: 100 }`
   * yields `{ gte: 10, lte: 100 }`.
   */
  private resolvePreset(presetName: string, overrides: QueryOptions): QueryOptions {
    const preset = this.presets.get(presetName);

    if (!preset) {
      throw new Error(`Preset "${presetName}" not found. Available presets: ${this.listPresets().join(', ') || 'none'}`);
    }

    const merged: QueryOptions = { ...preset };

    for (const key of Object.keys(overrides)) {
      const presetValue = preset[key];
      const overrideValue = overrides[key];

      if (this.isPlainObject(presetValue) && this.isPlainObject(overrideValue)) {
        merged[key] = { ...presetValue, ...overrideValue };
      } else {
        merged[key] = overrideValue;
      }
    }

    return merged;
  }

  private isPlainObject(value: any): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    );
  }

  async findWithPreset(
    presetName: string,
    overrides: QueryOptions = {}
  ): Promise<PaginationResult<T>> {
    return this.findWithOptions(this.resolvePreset(presetName, overrides));
  }

  async countWithPreset(
    presetName: string,
    overrides: QueryOptions = {}
  ): Promise<number> {
    return this.countWithOptions(this.resolvePreset(presetName, overrides));
  }
}
