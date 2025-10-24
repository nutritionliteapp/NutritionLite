const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "NutritionLite API",
      version: "1.0.0",
      description: "Documentação da API do NutritionLite (TCC)",
    },
    servers: [
      { url: "http://localhost:3000" }, // local
      { url: "https://nutritionlite-backend.onrender.com" } // produção (Render)
    ],
  },
  apis: ["./src/routes/*.js"], // os comentario das rota vão ser pcurado aqui meu rei
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };
