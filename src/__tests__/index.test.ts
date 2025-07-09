import mongoose, { Document, Schema } from 'mongoose';
import { QueryToolkit } from '../index';

// Mock mongoose methods
const mockExec = jest.fn();
const mockSkip = jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ exec: mockExec }) });
const mockLimit = jest.fn().mockReturnValue({ exec: mockExec });
const mockSort = jest.fn().mockReturnValue({ skip: mockSkip });
const mockSelect = jest.fn().mockReturnValue({ sort: mockSort, skip: mockSkip });
const mockFind = jest.fn().mockReturnValue({ sort: mockSort, select: mockSelect, skip: mockSkip });
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
});