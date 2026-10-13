import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';

// The spec is generated from the @swagger comments next to each route,
// so documentation lives beside the code it describes.
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DocuChat API',
      version: '1.0.0',
      description: 'AI-powered document Q&A: upload documents, ask questions, get answers with citations.',
    },
    servers: [{ url: '/api/v1', description: 'Version 1' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
    security: [{ bearerAuth: [] }],
  },
  // Works from src/ (tsx) and from dist/ (compiled). Globs need forward slashes, even on Windows.
  apis: [path.join(__dirname, '../routes/*.{ts,js}').replace(/\\/g, '/')],
});
