const { body } = require('express-validator');

const validarCadastroUsuario = [
  body('nome')
    .notEmpty()
    .withMessage('O nome é obrigatório'),
  body('email')
    .isEmail()
    .withMessage('O email é inválido'),
  body('senha')
    .isLength({ min: 6 })
    .withMessage('A senha deve ter pelo menos 6 caracteres')
];

const validarLogin = [
  body('email')
    .isEmail()
    .withMessage('O email é inválido'),
  body('senha')
    .notEmpty()
    .withMessage('A senha é obrigatória')
];

module.exports = {
  validarCadastroUsuario,
  validarLogin
};
