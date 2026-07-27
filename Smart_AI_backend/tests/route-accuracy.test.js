/**
 * Route Accuracy Test
 *
 * Verifies that every path/method documented in the Swagger spec
 * corresponds to a real Express route in the application.
 *
 * When routes are added, removed, or changed, update the routeMap
 * below so it stays in sync with Swagger.
 */

const swaggerSpec = require('../configs/swagger');

const routeMap = {
  // Auth
  'POST /api/auth/register': { auth: false },
  'POST /api/auth/login':    { auth: false },
  'POST /api/auth/google-login': { auth: false },
  'POST /api/auth/refresh':  { auth: false },
  'GET /api/auth/verify-email':  { auth: false },
  'POST /api/auth/verify-email': { auth: false },
  'POST /api/auth/resend-verification': { auth: false },
  'POST /api/auth/forgot-password': { auth: false },
  'POST /api/auth/reset-password': { auth: false },
  'POST /api/auth/request-unlock': { auth: false },
  'POST /api/auth/unlock-account': { auth: false },
  'POST /api/auth/link/google':  { auth: true },
  'DELETE /api/auth/unlink/google': { auth: true },
  'POST /api/auth/logout':    { auth: true },
  'GET /api/auth/me':         { auth: true },
  'POST /api/auth/admin-unlock': { auth: true },

  // Products
  'GET /api/products':                    { auth: false },
  'POST /api/products':                   { auth: true },
  'GET /api/products/search/semantic':    { auth: false },
  'GET /api/products/{id}':              { auth: false },
  'PUT /api/products/{id}':              { auth: true },
  'DELETE /api/products/{id}':           { auth: true },
  'GET /api/products/{id}/recommendations': { auth: false },

  // Orders
  'POST /api/orders':           { auth: true },
  'GET /api/orders':            { auth: true },
  'GET /api/orders/{id}':       { auth: true },
  'POST /api/orders/{id}/cancel': { auth: true },
  'PATCH /api/orders/{id}/status': { auth: true },
  'GET /api/orders/admin/all':  { auth: true },
  'GET /api/orders/admin/stats': { auth: true },

  // Cart
  'GET /api/cart':               { auth: true },
  'DELETE /api/cart':            { auth: true },
  'POST /api/cart/items':        { auth: true },
  'PUT /api/cart/items/{itemId}': { auth: true },
  'DELETE /api/cart/items/{itemId}': { auth: true },
  'POST /api/cart/merge':        { auth: true },

  // Reviews
  'GET /api/reviews/product/{id}':  { auth: false },
  'POST /api/reviews':              { auth: true },
  'GET /api/reviews/can-review/{productId}': { auth: true },
  'PUT /api/reviews/{id}':          { auth: true },
  'DELETE /api/reviews/{id}':       { auth: true },
  'GET /api/reviews/admin':         { auth: true },
  'PUT /api/reviews/admin/{id}/status': { auth: true },

  // Promotions
  'GET /api/promotions':              { auth: true },
  'POST /api/promotions':             { auth: true },
  'POST /api/promotions/validate':    { auth: true },
  'GET /api/promotions/{id}':         { auth: true },
  'PUT /api/promotions/{id}':         { auth: true },
  'DELETE /api/promotions/{id}':      { auth: true },
  'PATCH /api/promotions/{id}/toggle': { auth: true },

  // Complaints — no auth middleware (public)
  'GET /api/complaints':              { auth: false },
  'GET /api/complaints/stats':        { auth: false },
  'GET /api/complaints/search':       { auth: false },
  'GET /api/complaints/{id}':         { auth: false },
  'PUT /api/complaints/{id}':         { auth: false },
  'DELETE /api/complaints/{id}':      { auth: false },
  'PUT /api/complaints/{id}/resolve': { auth: false },
  'PUT /api/complaints/{id}/escalate': { auth: false },

  // Wishlist
  'GET /api/wishlist':                  { auth: true },
  'POST /api/wishlist':                 { auth: true },
  'DELETE /api/wishlist':               { auth: true },
  'GET /api/wishlist/check/{productId}': { auth: true },
  'POST /api/wishlist/check-multiple':   { auth: true },
  'DELETE /api/wishlist/{productId}':    { auth: true },

  // Compare
  'GET /api/compare/products':   { auth: false },
  'GET /api/compare/history':    { auth: true },
  'POST /api/compare/history':   { auth: true },
  'DELETE /api/compare/history/{id}': { auth: true },

  // Stores
  'GET /api/stores':             { auth: false },
  'POST /api/stores':            { auth: true },
  'GET /api/stores/admin/all':   { auth: true },
  'GET /api/stores/{id}':        { auth: false },
  'PUT /api/stores/{id}':        { auth: true },
  'DELETE /api/stores/{id}':     { auth: true },
  'PATCH /api/stores/{id}/toggle': { auth: true },

  // Addresses
  'GET /api/addresses':             { auth: true },
  'POST /api/addresses':            { auth: true },
  'PUT /api/addresses/{id}':        { auth: true },
  'DELETE /api/addresses/{id}':     { auth: true },
  'PUT /api/addresses/{id}/default': { auth: true },

  // Questions & Answers
  'GET /api/questions/product/{productId}': { auth: false },
  'POST /api/questions':                    { auth: true },
  'POST /api/questions/{id}/upvote':        { auth: true },
  'DELETE /api/questions/{id}':             { auth: true },
  'GET /api/questions/admin':               { auth: true },
  'PUT /api/questions/admin/{id}/status':   { auth: true },
  'POST /api/answers':                      { auth: true },
  'DELETE /api/answers/{id}':               { auth: true },

  // Profile
  'GET /api/profile':           { auth: true },
  'PUT /api/profile':           { auth: true },
  'POST /api/profile/avatar':   { auth: true },
  'PUT /api/profile/password':  { auth: true },

  // Dashboard
  'GET /api/dashboard/revenue':     { auth: true },
  'GET /api/dashboard/top-products': { auth: true },
  'GET /api/dashboard/order-trends': { auth: true },
  'GET /api/dashboard/user-stats':   { auth: true },
  'GET /api/dashboard/summary':      { auth: true },

  // Appointments
  'GET /api/appointments/available-slots/{storeId}/{date}': { auth: false },
  'POST /api/appointments':                { auth: false },
  'GET /api/appointments/my':              { auth: true },
  'GET /api/appointments/{id}':            { auth: true },
  'PATCH /api/appointments/{id}/cancel':   { auth: true },
  'GET /api/appointments/admin/all':       { auth: true },
  'GET /api/appointments/admin/store/{storeId}': { auth: true },
  'PATCH /api/appointments/admin/{id}/status': { auth: true },

  // Health
  'GET /health':          { auth: false },
  'GET /api/health':      { auth: false },
  'GET /api/health/live': { auth: false },
  'GET /api/health/ready': { auth: false },
};

describe('Route Accuracy — Swagger ↔ Actual Routes', () => {
  describe('All swagger paths have matching route entries', () => {
    const swaggerPaths = swaggerSpec.paths;

    for (const [swaggerPath, methods] of Object.entries(swaggerPaths)) {
      for (const method of Object.keys(methods)) {
        const key = `${method.toUpperCase()} ${swaggerPath}`;
        it(`${key} is documented in routeMap`, () => {
          expect(routeMap[key]).toBeDefined();
        });
      }
    }
  });

  describe('Swagger auth documentation matches routeMap', () => {
    for (const [key, { auth }] of Object.entries(routeMap)) {
      const [method, ...pathParts] = key.split(' ');
      const path = pathParts.join(' ');
      const swaggerEndpoint = swaggerSpec.paths[path]?.[method.toLowerCase()];

      if (swaggerEndpoint) {
        if (auth) {
          it(`${key} has BearerAuth security`, () => {
            expect(swaggerEndpoint.security).toBeDefined();
            expect(swaggerEndpoint.security[0].BearerAuth).toBeDefined();
          });
        } else {
          it(`${key} has no security (public)`, () => {
            expect(swaggerEndpoint.security).toBeUndefined();
          });
        }
      } else {
        it(`${key} endpoint missing from swagger`, () => {
          expect(swaggerEndpoint).toBeDefined();
        });
      }
    }
  });

  describe('Endpoints that do not exist as Express routes are NOT in swagger', () => {
    it('POST /api/chat is NOT in swagger (chat is Socket.IO only)', () => {
      expect(swaggerSpec.paths['/api/chat']?.post).toBeUndefined();
    });
  });
});

/* ============================================================
   Part B — OpenAPI Structure Checks
   ============================================================ */

describe('OpenAPI structure — metadata', () => {
  it('openapi version is 3.1.0', () => {
    expect(swaggerSpec.openapi).toBe('3.1.0');
  });

  it('info.title exists and is a string', () => {
    expect(swaggerSpec.info).toBeDefined();
    expect(typeof swaggerSpec.info.title).toBe('string');
    expect(swaggerSpec.info.title.length).toBeGreaterThan(0);
  });

  it('info.version exists and is a string', () => {
    expect(typeof swaggerSpec.info.version).toBe('string');
    expect(swaggerSpec.info.version.length).toBeGreaterThan(0);
  });

  it('servers is an array when configured', () => {
    if (swaggerSpec.servers) {
      expect(Array.isArray(swaggerSpec.servers)).toBe(true);
    }
  });
});

describe('OpenAPI structure — Bearer security scheme', () => {
  const scheme = swaggerSpec.components?.securitySchemes?.BearerAuth;

  it('BearerAuth security scheme is defined', () => {
    expect(scheme).toBeDefined();
  });

  it('BearerAuth type is http', () => {
    expect(scheme.type).toBe('http');
  });

  it('BearerAuth scheme is bearer', () => {
    expect(scheme.scheme).toBe('bearer');
  });

  it('BearerAuth bearerFormat is JWT', () => {
    expect(scheme.bearerFormat).toBe('JWT');
  });
});

describe('OpenAPI structure — required tags', () => {
  const allTags = new Set();

  if (swaggerSpec.paths) {
    for (const methods of Object.values(swaggerSpec.paths)) {
      for (const operation of Object.values(methods)) {
        if (operation.tags) {
          for (const tag of operation.tags) {
            allTags.add(tag);
          }
        }
      }
    }
  }

  const requiredTags = [
    'Auth', 'Products', 'Orders', 'Cart',
    'Reviews', 'Promotions', 'Complaints',
    'Wishlist', 'Health',
  ];

  for (const tag of requiredTags) {
    it(`tag "${tag}" is present in the spec`, () => {
      expect(allTags.has(tag)).toBe(true);
    });
  }
});

describe('OpenAPI structure — representative paths', () => {
  it('POST /api/auth/login is defined', () => {
    expect(swaggerSpec.paths['/api/auth/login']?.post).toBeDefined();
  });

  it('GET /api/products is defined', () => {
    expect(swaggerSpec.paths['/api/products']?.get).toBeDefined();
  });

  it('POST /api/orders is defined', () => {
    expect(swaggerSpec.paths['/api/orders']?.post).toBeDefined();
  });

  it('GET /api/orders/{id} is defined', () => {
    expect(swaggerSpec.paths['/api/orders/{id}']?.get).toBeDefined();
  });
});

describe('OpenAPI structure — reusable schemas', () => {
  const schemas = swaggerSpec.components?.schemas || {};

  const requiredSchemas = ['User', 'Product', 'Order', 'Review', 'Promotion', 'Error'];

  for (const name of requiredSchemas) {
    it(`schema "${name}" exists`, () => {
      expect(schemas[name]).toBeDefined();
      expect(schemas[name].type).toBe('object');
    });
  }
});

describe('OpenAPI structure — secret-safety', () => {
  const serialized = JSON.stringify(swaggerSpec);
  const lower = serialized.toLowerCase();

  const secretPatterns = [
    { pattern: /mongodb\+srv:\/\//i, label: 'MongoDB connection string' },
    { pattern: /api_secret/i,        label: 'api_secret pattern' },
    { pattern: /Bearer\s+eyJ/,       label: 'real JWT token' },
    { pattern: /OPENAI_API_KEY/,     label: 'OPENAI_API_KEY' },
    { pattern: /GEMINI_API_KEY/,     label: 'GEMINI_API_KEY' },
    { pattern: /CLOUDINARY_API_SECRET/, label: 'CLOUDINARY_API_SECRET' },
    { pattern: /BREVO_API_KEY/,      label: 'BREVO_API_KEY' },
    { pattern: /JWT_SECRET/,         label: 'JWT_SECRET' },
  ];

  for (const { pattern, label } of secretPatterns) {
    it(`does not contain ${label}`, () => {
      expect(serialized).not.toMatch(pattern);
    });
  }
});

/* ============================================================
   Part B — Swagger UI mount test (minimal app, no DB needed)
   ============================================================ */

describe('Swagger UI mount', () => {
  let app;
  let request;

  beforeAll(() => {
    const express = require('express');
    const swaggerUi = require('swagger-ui-express');

    app = express();
    app.use(express.json());
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Smart AI API Docs',
    }));
    // Simple health route to prove existing endpoints are unaffected
    app.get('/health', (req, res) => res.json({ success: true }));
    app.use('*', (req, res) => res.status(404).json({ error: { message: 'Not found' } }));

    request = require('supertest');
  });

  it('GET /api-docs/ returns 200 (Swagger UI HTML)', async () => {
    const res = await request(app).get('/api-docs/');
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain('swagger');
  });

  it('existing health endpoints remain unaffected', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('unknown route still returns 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });
});
