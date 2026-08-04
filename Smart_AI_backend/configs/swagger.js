const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Smart AI API',
      version: '1.0.0',
      description: 'Backend API for Smart AI - AI-powered E-commerce Platform',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                },
                code: {
                  type: 'string',
                },
                details: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Validation error details (migrated endpoints only)',
                },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            _id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            email: {
              type: 'string',
              format: 'email',
            },
            role: {
              type: 'string',
              enum: ['user', 'admin'],
            },
            phone: {
              type: 'string',
              nullable: true,
            },
            avatar: {
              type: 'string',
              nullable: true,
            },
            emailVerified: {
              type: 'boolean',
            },
            loginMethod: {
              type: 'string',
              enum: ['password', 'google', 'both'],
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            image: {
              type: 'string',
              nullable: true,
            },
            imagePublicId: {
              type: 'string',
              nullable: true,
            },
            brand: {
              type: 'string',
            },
            price: {
              type: 'number',
            },
            description: {
              type: 'string',
            },
            inStock: {
              type: 'integer',
            },
            specs: {
              type: 'object',
              properties: {
                screen: {
                  type: 'object',
                  properties: {
                    size: { type: 'string' },
                    resolution: { type: 'string' },
                    technology: { type: 'string' },
                  },
                },
                processor: {
                  type: 'object',
                  properties: {
                    chipset: { type: 'string' },
                    cpu: { type: 'string' },
                    gpu: { type: 'string' },
                  },
                },
                memory: {
                  type: 'object',
                  properties: {
                    ram: { type: 'string' },
                    storage: { type: 'string' },
                    expandable: { type: 'boolean' },
                  },
                },
                camera: {
                  type: 'object',
                  properties: {
                    rear: {
                      type: 'object',
                      properties: {
                        primary: { type: 'string' },
                        secondary: { type: 'string' },
                        tertiary: { type: 'string' },
                      },
                    },
                    front: { type: 'string' },
                    features: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
                battery: {
                  type: 'object',
                  properties: {
                    capacity: { type: 'string' },
                    charging: {
                      type: 'object',
                      properties: {
                        wired: { type: 'string' },
                        wireless: { type: 'string' },
                      },
                    },
                  },
                },
                connectivity: {
                  type: 'object',
                  properties: {
                    network: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    ports: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
                os: { type: 'string' },
                dimensions: { type: 'string' },
                weight: { type: 'string' },
                colors: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            isActive: {
              type: 'boolean',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            user: {
              type: 'string',
            },
            orderNumber: {
              type: 'string',
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  product: { type: 'string' },
                  name: { type: 'string' },
                  price: { type: 'number' },
                  quantity: { type: 'integer' },
                  color: { type: 'string' },
                  image: { type: 'string' },
                },
              },
            },
            shippingAddress: {
              type: 'object',
              properties: {
                fullName: { type: 'string' },
                phone: { type: 'string' },
                address: { type: 'string' },
                ward: { type: 'string' },
                district: { type: 'string' },
                city: { type: 'string' },
              },
            },
            subtotal: { type: 'number' },
            shippingFee: { type: 'number' },
            promotion: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                discountType: { type: 'string' },
                discountValue: { type: 'number' },
                discountAmount: { type: 'number' },
              },
            },
            total: { type: 'number' },
            status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'],
            },
            statusHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' },
                  note: { type: 'string' },
                },
              },
            },
            cancelReason: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Review: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user: { type: 'string' },
            product: { type: 'string' },
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'approved', 'rejected'],
            },
            isVerifiedPurchase: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Promotion: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            code: { type: 'string' },
            description: { type: 'string' },
            discountType: {
              type: 'string',
              enum: ['percentage', 'fixed'],
            },
            discountValue: { type: 'number' },
            minOrderValue: { type: 'number' },
            maxDiscountAmount: { type: 'number', nullable: true },
            usageLimit: { type: 'integer' },
            usedCount: { type: 'integer' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            isActive: { type: 'boolean' },
            isValid: { type: 'boolean' },
            remainingUses: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      // ============================================================
      // Auth
      // ============================================================
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email', 'password'],
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User registered successfully' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login with email and password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful, returns access and refresh tokens' },
            401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/google-login': {
        post: {
          tags: ['Auth'],
          summary: 'Login or register with Google OAuth',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['credential'],
                  properties: {
                    credential: { type: 'string', description: 'Google ID token' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Google login successful' },
            400: { description: 'Invalid Google credential' },
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Refresh access token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['refreshToken'],
                  properties: {
                    refreshToken: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Tokens refreshed successfully' },
            401: { description: 'Invalid or expired refresh token' },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout and invalidate refresh token',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Logged out successfully' },
            401: { description: 'Not authenticated' },
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current authenticated user',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Current user profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            401: { description: 'Not authenticated' },
          },
        },
      },
      '/api/auth/verify-email': {
        get: {
          tags: ['Auth'],
          summary: 'Verify email with token (GET)',
          parameters: [
            { name: 'token', in: 'query', schema: { type: 'string' } },
            { name: 'email', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Email verified successfully' },
            400: { description: 'Invalid or expired token' },
          },
        },
        post: {
          tags: ['Auth'],
          summary: 'Verify email with token (POST)',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Email verified successfully' },
            400: { description: 'Invalid or expired token' },
          },
        },
      },
      '/api/auth/resend-verification': {
        post: {
          tags: ['Auth'],
          summary: 'Resend email verification',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Verification email sent' },
          },
        },
      },
      '/api/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Request password reset email',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Password reset email sent' },
          },
        },
      },
      '/api/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Reset password with token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'password'],
                  properties: {
                    token: { type: 'string' },
                    password: { type: 'string', minLength: 6 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Password reset successfully' },
            400: { description: 'Invalid or expired token' },
          },
        },
      },
      '/api/auth/request-unlock': {
        post: {
          tags: ['Auth'],
          summary: 'Request account unlock email',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Unlock email sent if account exists' },
          },
        },
      },
      '/api/auth/unlock-account': {
        post: {
          tags: ['Auth'],
          summary: 'Unlock account with token',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Account unlocked successfully' },
          },
        },
      },
      '/api/auth/admin-unlock': {
        post: {
          tags: ['Auth'],
          summary: 'Admin unlock a user account',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Account unlocked by admin' },
            403: { description: 'Not authorized' },
          },
        },
      },
      '/api/auth/link/google': {
        post: {
          tags: ['Auth'],
          summary: 'Link Google account to existing user',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    credential: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Google account linked' },
          },
        },
      },
      '/api/auth/unlink/google': {
        delete: {
          tags: ['Auth'],
          summary: 'Unlink Google account',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Google account unlinked' },
          },
        },
      },

      // ============================================================
      // Products
      // ============================================================
      '/api/products': {
        get: {
          tags: ['Products'],
          summary: 'Get all products with pagination and filtering',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'brand', in: 'query', schema: { type: 'string' } },
            { name: 'minPrice', in: 'query', schema: { type: 'number' } },
            { name: 'maxPrice', in: 'query', schema: { type: 'number' } },
            { name: 'sort', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'List of products' },
          },
        },
        post: {
          tags: ['Products'],
          summary: 'Create a new product (admin)',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    brand: { type: 'string' },
                    price: { type: 'number' },
                    description: { type: 'string' },
                    inStock: { type: 'integer' },
                    image: { type: 'string', description: 'Base64 data URI or HTTPS URL' },
                    specs: { type: 'object' },
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Product created' },
            400: { description: 'Validation error' },
            403: { description: 'Not authorized' },
          },
        },
      },
      '/api/products/search/semantic': {
        get: {
          tags: ['Products'],
          summary: 'Semantic product search',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search query' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          ],
          responses: {
            200: { description: 'Semantic search results' },
          },
        },
      },
      '/api/products/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Get product by ID',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Product details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
            404: { description: 'Product not found' },
          },
        },
        put: {
          tags: ['Products'],
          summary: 'Update product (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    brand: { type: 'string' },
                    price: { type: 'number' },
                    description: { type: 'string' },
                    inStock: { type: 'integer' },
                    image: { type: 'string' },
                    specs: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Product updated' },
            403: { description: 'Not authorized' },
            404: { description: 'Product not found' },
          },
        },
        delete: {
          tags: ['Products'],
          summary: 'Delete product (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Product deleted' },
            403: { description: 'Not authorized' },
          },
        },
      },
      '/api/products/{id}/recommendations': {
        get: {
          tags: ['Products'],
          summary: 'Get product recommendations',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Recommended products' },
          },
        },
      },

      // ============================================================
      // Orders
      // ============================================================
      '/api/orders': {
        get: {
          tags: ['Orders'],
          summary: 'Get current user orders',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'List of user orders' },
            401: { description: 'Not authenticated' },
          },
        },
        post: {
          tags: ['Orders'],
          summary: 'Create a new order',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { type: 'object' } },
                    shippingAddress: { type: 'object' },
                    promotionCode: { type: 'string' },
                    idempotencyKey: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Order created' },
            400: { description: 'Validation error' },
          },
        },
      },
      '/api/orders/{id}': {
        get: {
          tags: ['Orders'],
          summary: 'Get order by ID',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Order details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
            404: { description: 'Order not found' },
          },
        },
      },
      '/api/orders/{id}/cancel': {
        post: {
          tags: ['Orders'],
          summary: 'Cancel an order',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Order cancelled' },
          },
        },
      },
      '/api/orders/{id}/status': {
        patch: {
          tags: ['Orders'],
          summary: 'Update order status (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'] },
                    note: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Order status updated' },
            400: { description: 'Invalid status transition' },
            403: { description: 'Not authorized' },
          },
        },
      },
      '/api/orders/admin/all': {
        get: {
          tags: ['Orders'],
          summary: 'Get all orders (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'List of all orders' },
            403: { description: 'Not authorized' },
          },
        },
      },
      '/api/orders/admin/stats': {
        get: {
          tags: ['Orders'],
          summary: 'Get order statistics (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Order statistics' },
            403: { description: 'Not authorized' },
          },
        },
      },

      // ============================================================
      // Cart
      // ============================================================
      '/api/cart': {
        get: {
          tags: ['Cart'],
          summary: 'Get current user cart (guest or logged in)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'User cart with items' },
            401: { description: 'Not authenticated' },
          },
        },
        delete: {
          tags: ['Cart'],
          summary: 'Clear entire cart',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Cart cleared' },
          },
        },
      },
      '/api/cart/items': {
        post: {
          tags: ['Cart'],
          summary: 'Add item to cart',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['product', 'quantity', 'color'],
                  properties: {
                    product: { type: 'string', description: 'Product ID' },
                    quantity: { type: 'integer', minimum: 1 },
                    color: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Item added to cart' },
            400: { description: 'Validation error' },
          },
        },
      },
      '/api/cart/items/{itemId}': {
        put: {
          tags: ['Cart'],
          summary: 'Update cart item quantity',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['quantity'],
                  properties: {
                    quantity: { type: 'integer', minimum: 1 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Cart item updated' },
          },
        },
        delete: {
          tags: ['Cart'],
          summary: 'Remove item from cart',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Item removed from cart' },
          },
        },
      },
      '/api/cart/merge': {
        post: {
          tags: ['Cart'],
          summary: 'Merge guest cart into user cart on login',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          product: { type: 'string' },
                          quantity: { type: 'integer' },
                          color: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Cart merged successfully' },
          },
        },
      },

      // ============================================================
      // Reviews
      // ============================================================
      '/api/reviews/product/{id}': {
        get: {
          tags: ['Reviews'],
          summary: 'Get reviews for a product',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Product ID' },
          ],
          responses: {
            200: { description: 'Product reviews', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Review' } } } } },
          },
        },
      },
      '/api/reviews': {
        post: {
          tags: ['Reviews'],
          summary: 'Create a review',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['product', 'rating'],
                  properties: {
                    product: { type: 'string', description: 'Product ID' },
                    rating: { type: 'integer', minimum: 1, maximum: 5 },
                    comment: { type: 'string', maxLength: 1000 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Review created' },
            400: { description: 'Validation error' },
          },
        },
      },
      '/api/reviews/can-review/{productId}': {
        get: {
          tags: ['Reviews'],
          summary: 'Check if user can review a product',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Review eligibility status' },
          },
        },
      },
      '/api/reviews/{id}': {
        put: {
          tags: ['Reviews'],
          summary: 'Update a review',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    rating: { type: 'integer', minimum: 1, maximum: 5 },
                    comment: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Review updated' },
          },
        },
        delete: {
          tags: ['Reviews'],
          summary: 'Delete a review',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Review deleted' },
          },
        },
      },
      '/api/reviews/admin': {
        get: {
          tags: ['Reviews'],
          summary: 'Get all reviews for moderation (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'All reviews' },
            403: { description: 'Not authorized' },
          },
        },
      },
      '/api/reviews/admin/{id}/status': {
        put: {
          tags: ['Reviews'],
          summary: 'Update review moderation status (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Review status updated' },
            403: { description: 'Not authorized' },
          },
        },
      },

      // ============================================================
      // Promotions
      // ============================================================
      '/api/promotions': {
        get: {
          tags: ['Promotions'],
          summary: 'Get all promotions (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'List of promotions' },
            403: { description: 'Not authorized' },
          },
        },
        post: {
          tags: ['Promotions'],
          summary: 'Create a promotion (admin)',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code', 'discountType', 'discountValue', 'usageLimit', 'startDate', 'endDate'],
                  properties: {
                    code: { type: 'string' },
                    description: { type: 'string' },
                    discountType: { type: 'string', enum: ['percentage', 'fixed'] },
                    discountValue: { type: 'number' },
                    minOrderValue: { type: 'number' },
                    maxDiscountAmount: { type: 'number' },
                    usageLimit: { type: 'integer' },
                    startDate: { type: 'string', format: 'date-time' },
                    endDate: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Promotion created' },
          },
        },
      },
      '/api/promotions/validate': {
        post: {
          tags: ['Promotions'],
          summary: 'Validate a promotion code and calculate discount',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code', 'orderValue'],
                  properties: {
                    code: { type: 'string' },
                    orderValue: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Promotion validation result with discount' },
          },
        },
      },
      '/api/promotions/{id}': {
        get: {
          tags: ['Promotions'],
          summary: 'Get promotion by ID (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Promotion details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Promotion' } } } },
            404: { description: 'Promotion not found' },
          },
        },
        put: {
          tags: ['Promotions'],
          summary: 'Update promotion (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    description: { type: 'string' },
                    discountType: { type: 'string' },
                    discountValue: { type: 'number' },
                    usageLimit: { type: 'integer' },
                    startDate: { type: 'string', format: 'date-time' },
                    endDate: { type: 'string', format: 'date-time' },
                    isActive: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Promotion updated' },
          },
        },
        delete: {
          tags: ['Promotions'],
          summary: 'Delete promotion (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Promotion deleted' },
          },
        },
      },
      '/api/promotions/{id}/toggle': {
        patch: {
          tags: ['Promotions'],
          summary: 'Toggle promotion active status (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Promotion status toggled' },
          },
        },
      },

      // ============================================================
      // Complaints
      // ============================================================
      '/api/complaints': {
        get: {
          tags: ['Complaints'],
          summary: 'Get complaints with pagination and filtering (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] } },
            { name: 'priority', in: 'query', schema: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] } },
          ],
          responses: {
             200: { description: 'List of complaints' },
             401: { description: 'Not authenticated' },
             403: { description: 'Not authorized (admin only)' },
           },
        },
      },
      '/api/complaints/stats': {
        get: {
          tags: ['Complaints'],
          summary: 'Get complaint statistics (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Complaint statistics' },
            401: { description: 'Not authenticated' },
            403: { description: 'Not authorized (admin only)' },
          },
        },
      },
      '/api/complaints/search': {
        get: {
          tags: ['Complaints'],
          summary: 'Advanced complaint search (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'priority', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Search results' },
            401: { description: 'Not authenticated' },
            403: { description: 'Not authorized (admin only)' },
          },
        },
      },
      '/api/complaints/{id}': {
        get: {
          tags: ['Complaints'],
          summary: 'Get complaint by ID (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Complaint details' },
            401: { description: 'Not authenticated' },
            403: { description: 'Not authorized (admin only)' },
            404: { description: 'Complaint not found' },
          },
        },
        put: {
          tags: ['Complaints'],
          summary: 'Update complaint fields (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    priority: { type: 'string' },
                    assignedTo: { type: 'string' },
                    resolutionNotes: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Complaint updated' },
            401: { description: 'Not authenticated' },
            403: { description: 'Not authorized (admin only)' },
          },
        },
        delete: {
          tags: ['Complaints'],
          summary: 'Delete complaint (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Complaint deleted' },
            401: { description: 'Not authenticated' },
            403: { description: 'Not authorized (admin only)' },
          },
        },
      },
      '/api/complaints/{id}/resolve': {
        put: {
          tags: ['Complaints'],
          summary: 'Quick resolve complaint (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    resolutionNotes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Complaint resolved' },
            401: { description: 'Not authenticated' },
            403: { description: 'Not authorized (admin only)' },
          },
        },
      },
      '/api/complaints/{id}/escalate': {
        put: {
          tags: ['Complaints'],
          summary: 'Escalate complaint priority (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Complaint escalated' },
            401: { description: 'Not authenticated' },
            403: { description: 'Not authorized (admin only)' },
          },
        },
      },

      // ============================================================
      // Wishlist
      // ============================================================
      '/api/wishlist': {
        get: {
          tags: ['Wishlist'],
          summary: 'Get user wishlist',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'User wishlist' },
          },
        },
        post: {
          tags: ['Wishlist'],
          summary: 'Add product to wishlist',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['product'],
                  properties: {
                    product: { type: 'string', description: 'Product ID' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Product added to wishlist' },
          },
        },
        delete: {
          tags: ['Wishlist'],
          summary: 'Clear entire wishlist',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Wishlist cleared' },
          },
        },
      },
      '/api/wishlist/check/{productId}': {
        get: {
          tags: ['Wishlist'],
          summary: 'Check if product is in wishlist',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Wishlist status for product' },
          },
        },
      },
      '/api/wishlist/check-multiple': {
        post: {
          tags: ['Wishlist'],
          summary: 'Check wishlist status for multiple products',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    productIds: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Wishlist statuses' },
          },
        },
      },
      '/api/wishlist/{productId}': {
        delete: {
          tags: ['Wishlist'],
          summary: 'Remove product from wishlist',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Product removed from wishlist' },
          },
        },
      },

      // ============================================================
      // Compare
      // ============================================================
      '/api/compare/products': {
        get: {
          tags: ['Compare'],
          summary: 'Get products for comparison',
          parameters: [
            { name: 'ids', in: 'query', schema: { type: 'string', description: 'Comma-separated product IDs' } },
          ],
          responses: {
            200: { description: 'Products for comparison' },
          },
        },
      },
      '/api/compare/history': {
        get: {
          tags: ['Compare'],
          summary: 'Get user comparison history',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Comparison history' },
          },
        },
        post: {
          tags: ['Compare'],
          summary: 'Save comparison to history',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    products: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Comparison saved' },
          },
        },
      },
      '/api/compare/history/{id}': {
        delete: {
          tags: ['Compare'],
          summary: 'Delete comparison from history',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Comparison deleted' },
          },
        },
      },

      // ============================================================
      // Stores
      // ============================================================
      '/api/stores': {
        get: {
          tags: ['Stores'],
          summary: 'Get all active stores',
          responses: {
            200: { description: 'List of stores' },
          },
        },
        post: {
          tags: ['Stores'],
          summary: 'Create a store (admin)',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    address: { type: 'string' },
                    phone: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Store created' },
          },
        },
      },
      '/api/stores/admin/all': {
        get: {
          tags: ['Stores'],
          summary: 'Get all stores including inactive (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'All stores' },
          },
        },
      },
      '/api/stores/{id}': {
        get: {
          tags: ['Stores'],
          summary: 'Get store by ID',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Store details' },
            404: { description: 'Store not found' },
          },
        },
        put: {
          tags: ['Stores'],
          summary: 'Update store (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Store updated' },
          },
        },
        delete: {
          tags: ['Stores'],
          summary: 'Delete store (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Store deleted' },
          },
        },
      },
      '/api/stores/{id}/toggle': {
        patch: {
          tags: ['Stores'],
          summary: 'Toggle store active status (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Store status toggled' },
          },
        },
      },

      // ============================================================
      // Addresses
      // ============================================================
      '/api/addresses': {
        get: {
          tags: ['Addresses'],
          summary: 'Get user addresses',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'List of addresses' },
          },
        },
        post: {
          tags: ['Addresses'],
          summary: 'Create a new address',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    fullName: { type: 'string' },
                    phone: { type: 'string' },
                    address: { type: 'string' },
                    ward: { type: 'string' },
                    district: { type: 'string' },
                    city: { type: 'string' },
                    isDefault: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Address created' },
          },
        },
      },
      '/api/addresses/{id}': {
        put: {
          tags: ['Addresses'],
          summary: 'Update an address',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Address updated' },
          },
        },
        delete: {
          tags: ['Addresses'],
          summary: 'Delete an address',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Address deleted' },
          },
        },
      },
      '/api/addresses/{id}/default': {
        put: {
          tags: ['Addresses'],
          summary: 'Set address as default',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Default address set' },
          },
        },
      },

      // ============================================================
      // Questions & Answers
      // ============================================================
      '/api/questions/product/{productId}': {
        get: {
          tags: ['Questions'],
          summary: 'Get questions for a product',
          parameters: [
            { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Product questions' },
          },
        },
      },
      '/api/questions': {
        post: {
          tags: ['Questions'],
          summary: 'Create a question',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    product: { type: 'string' },
                    content: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Question created' },
          },
        },
      },
      '/api/questions/{id}/upvote': {
        post: {
          tags: ['Questions'],
          summary: 'Toggle upvote on a question',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Upvote toggled' },
          },
        },
      },
      '/api/questions/{id}': {
        delete: {
          tags: ['Questions'],
          summary: 'Delete a question',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Question deleted' },
          },
        },
      },
      '/api/questions/admin': {
        get: {
          tags: ['Questions'],
          summary: 'Get all questions for moderation (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'All questions' },
          },
        },
      },
      '/api/questions/admin/{id}/status': {
        put: {
          tags: ['Questions'],
          summary: 'Update question status (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Question status updated' },
          },
        },
      },
      '/api/answers': {
        post: {
          tags: ['Questions'],
          summary: 'Create an answer (admin)',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    question: { type: 'string' },
                    content: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Answer created' },
          },
        },
      },
      '/api/answers/{id}': {
        delete: {
          tags: ['Questions'],
          summary: 'Delete an answer (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Answer deleted' },
          },
        },
      },

      // ============================================================
      // Profile
      // ============================================================
      '/api/profile': {
        get: {
          tags: ['Profile'],
          summary: 'Get current user profile',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'User profile' },
          },
        },
        put: {
          tags: ['Profile'],
          summary: 'Update profile information',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    phone: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Profile updated' },
          },
        },
      },
      '/api/profile/avatar': {
        post: {
          tags: ['Profile'],
          summary: 'Upload avatar image',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    avatar: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Avatar uploaded' },
          },
        },
      },
      '/api/profile/password': {
        put: {
          tags: ['Profile'],
          summary: 'Change password',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string', minLength: 6 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Password changed' },
          },
        },
      },

      // ============================================================
      // Dashboard
      // ============================================================
      '/api/dashboard/summary': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get dashboard summary (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Dashboard summary' },
          },
        },
      },
      '/api/dashboard/revenue': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get revenue statistics (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'period', in: 'query', schema: { type: 'string', enum: ['daily', 'monthly', 'yearly'] } },
          ],
          responses: {
            200: { description: 'Revenue statistics' },
          },
        },
      },
      '/api/dashboard/top-products': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get top selling products (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Top selling products' },
          },
        },
      },
      '/api/dashboard/order-trends': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get order trends (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Order trends' },
          },
        },
      },
      '/api/dashboard/user-stats': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get user registration stats (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'User statistics' },
          },
        },
      },

      // ============================================================
      // Appointments
      // ============================================================
      '/api/appointments/available-slots/{storeId}/{date}': {
        get: {
          tags: ['Appointments'],
          summary: 'Get available time slots for a store on a date',
          parameters: [
            { name: 'storeId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'date', in: 'path', required: true, schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            200: { description: 'Available time slots' },
          },
        },
      },
      '/api/appointments': {
        post: {
          tags: ['Appointments'],
          summary: 'Create an appointment (guest or logged in)',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    store: { type: 'string' },
                    date: { type: 'string', format: 'date' },
                    time: { type: 'string' },
                    customerName: { type: 'string' },
                    customerPhone: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Appointment created' },
          },
        },
      },
      '/api/appointments/my': {
        get: {
          tags: ['Appointments'],
          summary: 'Get user appointments',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'User appointments' },
          },
        },
      },
      '/api/appointments/{id}': {
        get: {
          tags: ['Appointments'],
          summary: 'Get appointment by ID',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Appointment details' },
          },
        },
      },
      '/api/appointments/{id}/cancel': {
        patch: {
          tags: ['Appointments'],
          summary: 'Cancel an appointment',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Appointment cancelled' },
          },
        },
      },
      '/api/appointments/admin/all': {
        get: {
          tags: ['Appointments'],
          summary: 'Get all appointments (admin)',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'All appointments' },
          },
        },
      },
      '/api/appointments/admin/store/{storeId}': {
        get: {
          tags: ['Appointments'],
          summary: 'Get appointments by store (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'storeId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Store appointments' },
          },
        },
      },
      '/api/appointments/admin/{id}/status': {
        patch: {
          tags: ['Appointments'],
          summary: 'Update appointment status (admin)',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Appointment status updated' },
          },
        },
      },

      // ============================================================
      // Health
      // ============================================================
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness check',
          responses: {
            200: { description: 'Server is alive' },
          },
        },
      },
      '/api/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check with detailed status',
          responses: {
            200: { description: 'Health status including dependencies' },
          },
        },
      },
      '/api/health/live': {
        get: {
          tags: ['Health'],
          summary: 'Liveness check',
          responses: {
            200: { description: 'Server is alive' },
          },
        },
      },
      '/api/health/ready': {
        get: {
          tags: ['Health'],
          summary: 'Readiness check',
          responses: {
            200: { description: 'Server is ready to accept requests' },
            503: { description: 'Server not ready' },
          },
        },
      },
    },
  },
  apis: [],
};

module.exports = swaggerJsdoc(options);
module.exports.shouldServeSwagger = () => process.env.NODE_ENV !== 'production';
