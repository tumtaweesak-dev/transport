function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requireFields(source, fields) {
  const missing = fields.filter((field) => {
    const value = source[field];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length > 0) {
    throw badRequest(`Missing required field(s): ${missing.join(', ')}`);
  }
}

function requireNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw badRequest(`${field} must be a valid number`);
  }
  return number;
}

function validateAllowed(value, allowedValues, field) {
  if (!allowedValues.includes(value)) {
    throw badRequest(`${field} must be one of: ${allowedValues.join(', ')}`);
  }
}

module.exports = {
  badRequest,
  requireFields,
  requireNumber,
  validateAllowed,
};
