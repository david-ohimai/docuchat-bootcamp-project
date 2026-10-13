// Operational errors: expected failures with a status code and a stable,
// machine-readable code. Anything that is not an AppError is treated as a bug
// and returned to the client as a generic 500.

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Not authenticated') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string) {
    super(422, 'UNPROCESSABLE_ENTITY', message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'A dependency is temporarily unavailable. Please try again shortly.') {
    super(503, 'SERVICE_UNAVAILABLE', message);
  }
}
