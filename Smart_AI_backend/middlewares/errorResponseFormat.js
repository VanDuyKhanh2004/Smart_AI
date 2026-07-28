const VALID_FORMATS = ['centralized', 'legacy-top-level-message'];

const errorResponseFormat = (format) => {
  if (!VALID_FORMATS.includes(format)) {
    throw new Error(`Invalid error response format: ${format}. Must be one of: ${VALID_FORMATS.join(', ')}`);
  }
  return (req, res, next) => {
    req.errorResponseFormat = format;
    next();
  };
};

module.exports = errorResponseFormat;
