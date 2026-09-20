const { validationResult } = require('express-validator');

const validarErros = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const lista = errors.array();
        // `mensagem` (1º erro) é o campo que o front-end exibe; `errors` mantém o detalhe completo.
        return res.status(400).json({ mensagem: lista[0].msg, errors: lista });
    }
    next();
};

module.exports = validarErros;
