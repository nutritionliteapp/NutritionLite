const fichaController = require('../src/controllers/fichaController');

const mockReq = {
  params: { id: 12 },
  usuario: { id: 32 }
};

const mockRes = {
  status(code) {
    this._status = code; return this;
  },
  json(payload) {
    console.log('Response status:', this._status || 200);
    console.log('Response payload:', payload);
    return this;
  }
};

(async () => {
  await fichaController.buscarFichaPorId(mockReq, mockRes);
})();
