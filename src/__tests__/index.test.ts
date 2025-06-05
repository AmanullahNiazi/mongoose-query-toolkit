import mongoose, { Document, Schema } from 'mongoose';
import { QueryToolkit } from '../index';

interface TestUser extends Document {
  name: string;
  email: string;
  status: string;
  role: string;
  createdAt: Date;
}

describe('QueryToolkit', () => {
  let UserModel: mongoose.Model<TestUser>;
  let queryToolkit: QueryToolkit<TestUser>;

  beforeAll(async () => {
    const userSchema = new Schema<TestUser>(
      {
        name: String,
        email: String,
        status: String,
        role: String,
        createdAt: Date,
      },
      { timestamps: true }
    );

    UserModel = mongoose.model<TestUser>('User', userSchema);
    queryToolkit = new QueryToolkit(UserModel, {
      searchFields: ['name', 'email'],
      filterableFields: ['status', 'role'],
    });
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('should search users by name or email', async () => {
    const users = [
      { name: 'John Doe', email: 'john@example.com', status: 'active', role: 'user' },
      { name: 'Jane Smith', email: 'jane@example.com', status: 'active', role: 'admin' },
      { name: 'Bob Johnson', email: 'john.bob@example.com', status: 'inactive', role: 'user' },
    ];

    await UserModel.create(users);

    const result = await queryToolkit.findWithOptions({ q: 'john' });
    expect(result.totalDocs).toBe(2);
    expect(result.docs.map(d => d.name)).toContain('John Doe');
    expect(result.docs.map(d => d.name)).toContain('Bob Johnson');
  });

  it('should filter users by status and role', async () => {
    const users = [
      { name: 'John Doe', email: 'john@example.com', status: 'active', role: 'user' },
      { name: 'Jane Smith', email: 'jane@example.com', status: 'active', role: 'admin' },
      { name: 'Bob Johnson', email: 'bob@example.com', status: 'inactive', role: 'user' },
    ];

    await UserModel.create(users);

    const result = await queryToolkit.findWithOptions({ status: 'active', role: 'user' });
    expect(result.totalDocs).toBe(1);
    expect(result.docs[0].name).toBe('John Doe');
  });

  it('should paginate results', async () => {
    const users = Array.from({ length: 15 }, (_, i) => ({
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      status: 'active',
      role: 'user',
    }));

    await UserModel.create(users);

    const result = await queryToolkit.findWithOptions({ page: 2, limit: 5 });
    expect(result.docs.length).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.totalPages).toBe(3);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPrevPage).toBe(true);
  });

  it('should sort results', async () => {
    const users = [
      { name: 'John Doe', email: 'john@example.com', status: 'active', role: 'user' },
      { name: 'Alice Brown', email: 'alice@example.com', status: 'active', role: 'user' },
      { name: 'Bob Johnson', email: 'bob@example.com', status: 'active', role: 'user' },
    ];

    await UserModel.create(users);

    const result = await queryToolkit.findWithOptions({ sort: 'name' });
    expect(result.docs[0].name).toBe('Alice Brown');
    expect(result.docs[2].name).toBe('John Doe');

    const reversedResult = await queryToolkit.findWithOptions({ sort: '-name' });
    expect(reversedResult.docs[0].name).toBe('John Doe');
    expect(reversedResult.docs[2].name).toBe('Alice Brown');
  });
});