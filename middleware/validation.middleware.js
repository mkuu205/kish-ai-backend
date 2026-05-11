// src/middleware/validation.middleware.js
const { ZodError } = require("zod");
const R = require("../utils/response");

const validate = (schema, source = "body") => (req, res, next) => {
  try {
    const result = schema.parse(req[source]);
    req[source] = result;
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const errors = err.errors.map((e) => ({ field: e.path.join("."), message: e.message }));
      return R.badRequest(res, "Validation failed", errors);
    }
    next(err);
  }
};

module.exports = { validate };
