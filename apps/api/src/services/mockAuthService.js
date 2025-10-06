class MockAuthService {
  constructor(fastifyInstance) {
    this.fastify = fastifyInstance;
  }

  async register(userData) {
    // Mock kayıt başarılı
    console.log('Mock register called with:', userData);
    
    const mockUser = {
      id: 'mock-user-id',
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName
    };
    
    const mockTenant = {
      id: 'mock-tenant-id',
      name: userData.tenantName,
      slug: userData.tenantSlug
    };
    
    return {
      user: mockUser,
      tenant: mockTenant
    };
  }

  async login(email, password, tenantId) {
    // Mock login başarılı
    console.log('Mock login called with:', email, tenantId);
    
    if (email === 'test@example.com' && password === '123456') {
      const mockUser = {
        id: 'mock-user-id',
        email: email,
        firstName: 'Test',
        lastName: 'User',
        role: 'admin'
      };
      
      const token = this.fastify.jwt.sign({ 
        userId: mockUser.id, 
        email: mockUser.email, 
        tenantId: tenantId || 'mock-tenant-id'
      });
      
      return {
        token,
        user: mockUser
      };
    }
    
    throw new Error('Invalid credentials');
  }
}

module.exports = MockAuthService;
