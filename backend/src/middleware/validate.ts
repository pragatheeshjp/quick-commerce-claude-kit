import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

/**
 * Validates request input. Parsed values are exposed via res.locals.{query,params} (Express 5's
 * req.query is a read-only getter) and req.body is replaced. ZodErrors reach the error handler.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) res.locals.params = schemas.params.parse(req.params);
      if (schemas.query) res.locals.query = schemas.query.parse(req.query);
      next();
    } catch (err) {
      next(err);
    }
  };
