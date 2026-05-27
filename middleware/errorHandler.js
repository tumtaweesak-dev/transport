module.exports = function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const fallbackMessage = err.name === 'AggregateError'
    ? 'Database connection failed'
    : 'Internal Server Error';
  const message = status >= 500 && isProduction ? 'Internal Server Error' : (err.message || fallbackMessage);

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
};
