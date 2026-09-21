const { body } = require('express-validator');

/*
 * E-mail: aqui só validamos o formato. A normalização (trim + minúsculas) é feita
 * nos controllers por utils/security.normalizeEmail. Não usar .normalizeEmail()
 * do express-validator: ele remove pontos de contas Gmail, o que quebra o login
 * de quem já se cadastrou com ponto e diverge da busca na recuperação de senha.
 */

const senhaRules = body('senha')
  .isLength({ min: 8, max: 128 })
  .withMessage('A senha deve ter entre 8 e 128 caracteres')
  .matches(/[A-Za-z]/)
  .withMessage('A senha deve conter letras')
  .matches(/[0-9]/)
  .withMessage('A senha deve conter números');

const validarCadastroUsuario = [
  body('nome')
    .trim()
    .notEmpty()
    .withMessage('O nome é obrigatório')
    .isLength({ max: 120 })
    .withMessage('O nome deve ter no máximo 120 caracteres'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('O email é inválido')
    .isLength({ max: 254 })
    .withMessage('O email é demasiado longo'),
  senhaRules,
];

const validarLogin = [
  body('email').trim().isEmail().withMessage('O email é inválido'),
  body('senha').notEmpty().withMessage('A senha é obrigatória'),
];

const validarReenvioConfirmacao = [
  body('email').trim().isEmail().withMessage('O email é inválido'),
];

const validarNovaSenha = [
  body('novaSenha')
    .isLength({ min: 8, max: 128 })
    .withMessage('A senha deve ter entre 8 e 128 caracteres')
    .matches(/[A-Za-z]/)
    .withMessage('A senha deve conter letras')
    .matches(/[0-9]/)
    .withMessage('A senha deve conter números'),
  body('token').notEmpty().withMessage('Token é obrigatório'),
];

module.exports = {
  validarCadastroUsuario,
  validarLogin,
  validarReenvioConfirmacao,
  validarNovaSenha,
};
