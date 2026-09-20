const winston = require('winston');
const path = require('path');
const fs = require('fs');

const env = process.env.NODE_ENV || 'development';
const logsDir = path.join(__dirname, '../../logs');

if (env !== 'test' && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    ({ level, message, timestamp }) =>
      `[${timestamp}] ${level.toUpperCase()}: ${message}`
  )
);

const transports = [];

if (env === 'test') {
  transports.push(
    new winston.transports.Console({
      level: 'error',
      silent: process.env.LOG_IN_TEST !== '1',
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      level: env === 'production' ? 'info' : 'debug',
      format: consoleFormat,
    })
  );

  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: consoleFormat,
    })
  );

  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      level: 'info',
      format: consoleFormat,
    })
  );
}

const logger = winston.createLogger({
  level: env === 'production' ? 'info' : 'debug',
  transports,
});

module.exports = logger;
