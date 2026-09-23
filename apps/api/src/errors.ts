import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'not_found', `No route exists for ${req.method} ${req.path}.`));
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = res.locals.requestId as string | undefined;
  if (error instanceof ApiError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message, requestId } });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'invalid_request',
        message: error.issues[0]?.message ?? 'The request was invalid.',
        requestId,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
  console.error(JSON.stringify({ level: 'error', requestId, path: req.path, message }));
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'The story paused unexpectedly. Nothing was changed; please try again.',
      requestId,
    },
  });
}
