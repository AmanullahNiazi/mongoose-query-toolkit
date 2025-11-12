import { describe, it, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import { Document } from 'mongoose';
import { QueryToolkit } from '../index.js';

// Mock mongoose methods
const mockExec = jest.fn();
const mockSkip = jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ exec: mockExec }) });
const mockLimit = jest.fn().mockReturnValue({ exec: mockExec });
const mockPopulate = jest.fn().mockImplementation(function() {
  return { 
    skip: mockSkip, 
    limit: mockLimit, 
    exec: mockExec,
    populate: mockPopulate,
    sort: mockSort,
    select: mockSelect
  };
});
const mockSort = jest.fn().mockImplementation(function() {
  return { 
    skip: mockSkip, 
    populate: mockPopulate,
    select: mockSelect,
    limit: mockLimit,
    exec: mockExec
  };
});
const mockSelect = jest.fn().mockReturnValue({ sort: mockSort, skip: mockSkip, populate: mockPopulate, limit: mockLimit, exec: mockExec });
const mockFind = jest.fn().mockReturnValue({ sort: mockSort, select: mockSelect, skip: mockSkip, populate: mockPopulate, limit: mockLimit, exec: mockExec });
const mockCountDocuments = jest.fn().mockResolvedValue(0);

interface TestUser extends Document {
  name: string;
  email: string;
  status: string;
  role: string;
  createdAt: Date;
}

describe('QueryToolkit', () => {
  let UserModel: any;
  let queryToolkit: QueryToolkit<TestUser>;

  beforeAll(() => {
    // Create a mock UserModel
    UserModel = {
      find: mockFind,
      countDocuments: mockCountDocuments,
    };

    queryToolkit = new QueryToolkit(UserModel as any, {
      searchFields: ['name', 'email'],
      filterableFields: ['status', 'role'],
      selectableFields: ['name', 'email', 'status', 'role'],
      populatableFields: ['profile', 'posts', 'comments'],
    });
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock return values
    mockExec.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);
  });

  it('should search users by name or email', async () => {
    // Setup mock data
    const mockUsers = [
      { name: 'John Doe', email: 'john@example.com', status: 'active', role: 'user' },
      { name: 'Jane Smith', email: 'jane@example.com', status: 'active', role: 'admin' },
    ];
    mockExec.mockResolvedValue(mockUsers);
    mockCountDocuments.mockResolvedValue(2);

    // Execute query
    const result = await queryToolkit.findWithOptions({ q: 'john' });
    
    // Verify search query was built correctly
    expect(mockFind).toHaveBeenCalledWith({
      $or: expect.arrayContaining([
        { name: { $regex: 'john', $options: 'i' } },
        { email: { $regex: 'john', $options: 'i' } },
      ])
    });
    
    // Verify result
    expect(result.totalDocs).toBe(2);
    expect(result.docs).toEqual(mockUsers);
  });

  it('should filter users by status and role', async () => {
    // Setup mock data
    const mockUsers = [
      { name: 'John Doe', email: 'john@example.com', status: 'active', role: 'user' },
    ];
    mockExec.mockResolvedValue(mockUsers);
    mockCountDocuments.mockResolvedValue(1);

    // Execute query
    const result = await queryToolkit.findWithOptions({ status: 'active', role: 'user' });
    
    // Verify filter query was built correctly
    expect(mockFind).toHaveBeenCalledWith({
      status: 'active',
      role: 'user',
    });
    
    // Verify result
    expect(result.totalDocs).toBe(1);
    expect(result.docs).toEqual(mockUsers);
  });

  it('should paginate results', async () => {
    // Setup mock data
    const mockUsers = Array.from({ length: 5 }, (_, i) => ({
      name: `User ${i + 6}`, // Users 6-10 (page 2)
      email: `user${i + 6}@example.com`,
    }));
    mockExec.mockResolvedValue(mockUsers);
    mockCountDocuments.mockResolvedValue(15); // Total 15 users

    // Execute query
    const result = await queryToolkit.findWithOptions({ page: 2, limit: 5 });
    
    // Verify pagination parameters
    expect(mockSkip).toHaveBeenCalledWith(5); // Skip first 5 users
    expect(mockSkip().limit).toHaveBeenCalledWith(5); // Limit to 5 users
    
    // Verify result
    expect(result.docs).toEqual(mockUsers);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.totalPages).toBe(3);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPrevPage).toBe(true);
  });

  it('should sort results', async () => {
    // Setup mock data
    const mockUsers = [
      { name: 'Alice Brown' },
      { name: 'Bob Johnson' },
      { name: 'John Doe' },
    ];
    mockExec.mockResolvedValue(mockUsers);
    
    // Execute query with ascending sort
    await queryToolkit.findWithOptions({ sort: 'name' });
    
    // Verify sort parameters
    expect(mockSort).toHaveBeenCalledWith({ name: 1 });
    
    // Execute query with descending sort
    await queryToolkit.findWithOptions({ sort: '-name' });
    
    // Verify sort parameters
    expect(mockSort).toHaveBeenCalledWith({ name: -1 });
  });

  it('should select specific fields', async () => {
    // Execute query with field selection
    await queryToolkit.findWithOptions({ select: 'name,email' });
    
    // Verify select was called with correct fields
    expect(mockSelect).toHaveBeenCalledWith('name email');
  });

  it('should exclude specific fields with minus prefix', async () => {
    // Execute query with field exclusion
    await queryToolkit.findWithOptions({ select: '-email,-role' });
    
    // Verify select was called with correct exclusion fields
    expect(mockSelect).toHaveBeenCalledWith('-email -role');
  });

  it('should only select fields that are in selectableFields', async () => {
    // Create a new QueryToolkit with limited selectableFields
    const limitedQueryToolkit = new QueryToolkit(UserModel as any, {
      searchFields: ['name', 'email'],
      filterableFields: ['status', 'role'],
      selectableFields: ['name', 'status'], // Only name and status are selectable
    });

    // Execute query with field selection including a non-selectable field
    await limitedQueryToolkit.findWithOptions({ select: 'name,email,status' });
    
    // Verify select was called with only the selectable fields
    expect(mockSelect).toHaveBeenCalledWith('name status');
  });

  it('should populate referenced fields', async () => {
    // Execute query with populate
    await queryToolkit.findWithOptions({ populate: 'profile,posts' });
    
    // Verify populate was called for each field
    expect(mockPopulate).toHaveBeenCalledWith('profile');
    expect(mockPopulate).toHaveBeenCalledWith('posts');
  });

  it('should only populate fields that are in populatableFields', async () => {
    // Create a new QueryToolkit with limited populatableFields
    const limitedQueryToolkit = new QueryToolkit(UserModel as any, {
      searchFields: ['name', 'email'],
      filterableFields: ['status', 'role'],
      populatableFields: ['profile'], // Only profile is populatable
    });

    // Execute query with populate including a non-populatable field
    await limitedQueryToolkit.findWithOptions({ populate: 'profile,posts,comments' });
    
    // Verify populate was called only for the populatable field
    expect(mockPopulate).toHaveBeenCalledWith('profile');
    expect(mockPopulate).not.toHaveBeenCalledWith('posts');
    expect(mockPopulate).not.toHaveBeenCalledWith('comments');
  });

  it('should allow all populate fields if populatableFields is empty', async () => {
    // Create a new QueryToolkit without populatableFields
    const openQueryToolkit = new QueryToolkit(UserModel as any, {
      searchFields: ['name', 'email'],
      filterableFields: ['status', 'role'],
      // No populatableFields specified
    });

    // Execute query with populate
    await openQueryToolkit.findWithOptions({ populate: 'profile,posts,comments' });
    
    // Verify populate was called for all fields
    expect(mockPopulate).toHaveBeenCalledWith('profile');
    expect(mockPopulate).toHaveBeenCalledWith('posts');
    expect(mockPopulate).toHaveBeenCalledWith('comments');
  });

  describe('countWithOptions', () => {
    it('should return count of all documents', async () => {
      mockCountDocuments.mockResolvedValue(42);

      const count = await queryToolkit.countWithOptions();

      expect(mockCountDocuments).toHaveBeenCalledWith({});
      expect(count).toBe(42);
    });

    it('should return count with search filter', async () => {
      mockCountDocuments.mockResolvedValue(5);

      const count = await queryToolkit.countWithOptions({ q: 'john' });

      expect(mockCountDocuments).toHaveBeenCalledWith({
        $or: expect.arrayContaining([
          { name: { $regex: 'john', $options: 'i' } },
          { email: { $regex: 'john', $options: 'i' } },
        ])
      });
      expect(count).toBe(5);
    });

    it('should return count with status filter', async () => {
      mockCountDocuments.mockResolvedValue(15);

      const count = await queryToolkit.countWithOptions({ status: 'active' });

      expect(mockCountDocuments).toHaveBeenCalledWith({ status: 'active' });
      expect(count).toBe(15);
    });

    it('should return count with multiple filters', async () => {
      mockCountDocuments.mockResolvedValue(8);

      const count = await queryToolkit.countWithOptions({
        status: 'active',
        role: 'admin'
      });

      expect(mockCountDocuments).toHaveBeenCalledWith({
        status: 'active',
        role: 'admin'
      });
      expect(count).toBe(8);
    });

    it('should return count with search and filters combined', async () => {
      mockCountDocuments.mockResolvedValue(3);

      const count = await queryToolkit.countWithOptions({
        q: 'john',
        status: 'active'
      });

      expect(mockCountDocuments).toHaveBeenCalledWith({
        $or: expect.arrayContaining([
          { name: { $regex: 'john', $options: 'i' } },
          { email: { $regex: 'john', $options: 'i' } },
        ]),
        status: 'active'
      });
      expect(count).toBe(3);
    });

    it('should ignore pagination options (page, limit, sort, select, populate)', async () => {
      mockCountDocuments.mockResolvedValue(100);

      const count = await queryToolkit.countWithOptions({
        status: 'active',
        page: 2,
        limit: 50,
        sort: '-createdAt',
        select: 'name,email',
        populate: 'profile'
      });

      // Should only use the filter, ignoring pagination/sort/select/populate
      expect(mockCountDocuments).toHaveBeenCalledWith({ status: 'active' });
      expect(count).toBe(100);
    });
  });

  describe('Query Presets', () => {
    describe('definePreset', () => {
      it('should define a new preset', () => {
        queryToolkit.definePreset('activeUsers', { status: 'active', sort: '-createdAt' });

        expect(queryToolkit.hasPreset('activeUsers')).toBe(true);
      });

      it('should allow defining multiple presets', () => {
        queryToolkit.definePreset('activeUsers', { status: 'active' });
        queryToolkit.definePreset('admins', { role: 'admin' });

        expect(queryToolkit.hasPreset('activeUsers')).toBe(true);
        expect(queryToolkit.hasPreset('admins')).toBe(true);
      });

      it('should overwrite existing preset with same name', () => {
        queryToolkit.definePreset('test', { status: 'active' });
        queryToolkit.definePreset('test', { status: 'inactive' });

        const preset = queryToolkit.getPreset('test');
        expect(preset?.status).toBe('inactive');
      });
    });

    describe('getPreset', () => {
      it('should return preset options', () => {
        const options = { status: 'active', sort: '-createdAt', limit: 20 };
        queryToolkit.definePreset('activeUsers', options);

        const preset = queryToolkit.getPreset('activeUsers');
        expect(preset).toEqual(options);
      });

      it('should return undefined for non-existent preset', () => {
        const preset = queryToolkit.getPreset('nonExistent');
        expect(preset).toBeUndefined();
      });
    });

    describe('hasPreset', () => {
      it('should return true for existing preset', () => {
        queryToolkit.definePreset('test', { status: 'active' });
        expect(queryToolkit.hasPreset('test')).toBe(true);
      });

      it('should return false for non-existent preset', () => {
        expect(queryToolkit.hasPreset('nonExistent')).toBe(false);
      });
    });

    describe('deletePreset', () => {
      it('should delete existing preset', () => {
        queryToolkit.definePreset('test', { status: 'active' });

        const deleted = queryToolkit.deletePreset('test');
        expect(deleted).toBe(true);
        expect(queryToolkit.hasPreset('test')).toBe(false);
      });

      it('should return false when deleting non-existent preset', () => {
        const deleted = queryToolkit.deletePreset('nonExistent');
        expect(deleted).toBe(false);
      });
    });

    describe('listPresets', () => {
      it('should return empty array when no presets defined', () => {
        // Clean up any presets from previous tests
        queryToolkit.listPresets().forEach(name => queryToolkit.deletePreset(name));

        const presets = queryToolkit.listPresets();
        expect(presets).toEqual([]);
      });

      it('should return all preset names', () => {
        // Clean up first
        queryToolkit.listPresets().forEach(name => queryToolkit.deletePreset(name));

        queryToolkit.definePreset('preset1', { status: 'active' });
        queryToolkit.definePreset('preset2', { role: 'admin' });
        queryToolkit.definePreset('preset3', { status: 'inactive' });

        const presets = queryToolkit.listPresets();
        expect(presets).toHaveLength(3);
        expect(presets).toContain('preset1');
        expect(presets).toContain('preset2');
        expect(presets).toContain('preset3');
      });
    });

    describe('findWithPreset', () => {
      beforeEach(() => {
        // Clean up presets before each test
        queryToolkit.listPresets().forEach(name => queryToolkit.deletePreset(name));

        // Define test presets
        queryToolkit.definePreset('activeUsers', {
          status: 'active',
          sort: '-createdAt',
          limit: 20
        });
      });

      it('should use preset options', async () => {
        mockExec.mockResolvedValue([{ name: 'User 1' }]);
        mockCountDocuments.mockResolvedValue(5);

        await queryToolkit.findWithPreset('activeUsers');

        expect(mockFind).toHaveBeenCalledWith({ status: 'active' });
        expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockSkip().limit).toHaveBeenCalledWith(20);
      });

      it('should allow overriding preset options', async () => {
        mockExec.mockResolvedValue([{ name: 'User 1' }]);
        mockCountDocuments.mockResolvedValue(5);

        await queryToolkit.findWithPreset('activeUsers', { page: 2, limit: 10 });

        expect(mockFind).toHaveBeenCalledWith({ status: 'active' });
        expect(mockSkip).toHaveBeenCalledWith(10); // page 2 with limit 10
        expect(mockSkip().limit).toHaveBeenCalledWith(10); // override limit
      });

      it('should throw error for non-existent preset', async () => {
        await expect(
          queryToolkit.findWithPreset('nonExistent')
        ).rejects.toThrow('Preset "nonExistent" not found');
      });

      it('should list available presets in error message', async () => {
        // Clean up first to ensure no other presets interfere
        queryToolkit.listPresets().forEach(name => queryToolkit.deletePreset(name));

        queryToolkit.definePreset('preset1', { status: 'active' });
        queryToolkit.definePreset('preset2', { role: 'admin' });

        try {
          await queryToolkit.findWithPreset('nonExistent');
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toContain('Preset "nonExistent" not found');
          expect(error.message).toContain('Available presets:');
          expect(error.message).toContain('preset1');
          expect(error.message).toContain('preset2');
        }
      });

      it('should merge preset filters with override filters', async () => {
        queryToolkit.definePreset('activeAdmins', {
          status: 'active',
          role: 'admin'
        });

        mockExec.mockResolvedValue([]);
        mockCountDocuments.mockResolvedValue(0);

        await queryToolkit.findWithPreset('activeAdmins', { q: 'john' });

        expect(mockFind).toHaveBeenCalledWith({
          $or: expect.arrayContaining([
            { name: { $regex: 'john', $options: 'i' } },
            { email: { $regex: 'john', $options: 'i' } },
          ]),
          status: 'active',
          role: 'admin'
        });
      });
    });

    describe('countWithPreset', () => {
      beforeEach(() => {
        // Clean up presets before each test
        queryToolkit.listPresets().forEach(name => queryToolkit.deletePreset(name));

        // Define test presets
        queryToolkit.definePreset('activeUsers', { status: 'active' });
      });

      it('should use preset options for counting', async () => {
        mockCountDocuments.mockResolvedValue(42);

        const count = await queryToolkit.countWithPreset('activeUsers');

        expect(mockCountDocuments).toHaveBeenCalledWith({ status: 'active' });
        expect(count).toBe(42);
      });

      it('should allow overriding preset options', async () => {
        mockCountDocuments.mockResolvedValue(15);

        const count = await queryToolkit.countWithPreset('activeUsers', { role: 'admin' });

        expect(mockCountDocuments).toHaveBeenCalledWith({
          status: 'active',
          role: 'admin'
        });
        expect(count).toBe(15);
      });

      it('should throw error for non-existent preset', async () => {
        await expect(
          queryToolkit.countWithPreset('nonExistent')
        ).rejects.toThrow('Preset "nonExistent" not found');
      });

      it('should ignore pagination options in preset', async () => {
        queryToolkit.definePreset('paginatedActive', {
          status: 'active',
          page: 2,
          limit: 50,
          sort: '-createdAt'
        });

        mockCountDocuments.mockResolvedValue(100);

        const count = await queryToolkit.countWithPreset('paginatedActive');

        // Should only use filter, not pagination
        expect(mockCountDocuments).toHaveBeenCalledWith({ status: 'active' });
        expect(count).toBe(100);
      });
    });
  });
});