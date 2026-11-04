export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  badRequest: (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details),
  unauthorized: (message = 'Authentication required') => new AppError(401, 'unauthorized', message),
  forbidden: (message = 'Not allowed') => new AppError(403, 'forbidden', message),
  notFound: (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`),
  conflict: (message: string) => new AppError(409, 'conflict', message),
  gone: (message: string) => new AppError(410, 'gone', message),
  unprocessable: (message: string, details?: unknown) => new AppError(422, 'unprocessable', message, details),
  tooMany: (message = 'Too many requests') => new AppError(429, 'rate_limited', message),
  paymentRequired: (message: string) => new AppError(402, 'payment_required', message),
};
