const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'NutritionLite API',
      version: '1.0.0',
      description: 'API do NutritionLite — nutricão, TACO, fichas e assistente',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local' },
      {
        url: 'https://nutritionlite-backend.onrender.com',
        description: 'Produção (Render)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };
