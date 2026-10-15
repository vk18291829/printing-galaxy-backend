import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and replaces request parts with their parsed (coerced, defaulted) values.
 * In Express 5 `req.query` is a getter, so the parsed query is stored on `res.locals.query`.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    res.locals.query = schemas.query ? schemas.query.parse(req.query) : req.query;
    next();
  };
}

export type Infer<T extends ZodTypeAny> = z.infer<T>;
