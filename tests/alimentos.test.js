const request = require("supertest");
const app = require("../src/app");

describe("🍎 Testes da rota /api/alimentos", () => {

  test("Deve listar alimentos", async () => {
    const res = await request(app).get("/api/alimentos/listar");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("Deve buscar um alimento específico", async () => {
    const res = await request(app).get("/api/alimentos/buscar?nome=banana");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("nome");
  });

});
