export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'You do not have permission to do this') {
    return new ApiError(403, message, 'FORBIDDEN');
  }
  static notFound(what = 'Resource') {
    return new ApiError(404, `${what} not found`, 'NOT_FOUND');
  }
  static conflict(message: string) {
    return new ApiError(409, message, 'CONFLICT');
  }
  static unprocessable(message: string, details?: unknown) {
    return new ApiError(422, message, 'VALIDATION_ERROR', details);
  }
  static tooMany(message = 'Too many requests, please try again later') {
    return new ApiError(429, message, 'RATE_LIMITED');
  }
}
