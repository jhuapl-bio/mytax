const winston = require('winston');
const myformat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.align(),
  winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
//   defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    // Size-capped + rotated. combined.log previously grew without bound (a
    // long real-time run logs a line per job), and winston appends to one
    // ever-larger file.
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 10 * 1024 * 1024, maxFiles: 3, tailable: true }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 25 * 1024 * 1024, maxFiles: 4, tailable: true }),
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: myformat
  }));
}

module.exports={
    logger
}