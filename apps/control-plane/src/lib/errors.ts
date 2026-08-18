export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const Errors = {
  validation: (message: string) => new ApiError(400, 'VALIDATION_ERROR', message),
  unauthenticated: (message = 'Authentication required') => new ApiError(401, 'UNAUTHENTICATED', message),
  unauthorized: (message = 'You do not have permission to perform this action') =>
    new ApiError(403, 'UNAUTHORIZED', message),
  notFound: (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message),
  conflict: (message: string) => new ApiError(409, 'CONFLICT', message),
  rateLimited: (message = 'Rate limit exceeded') => new ApiError(429, 'RATE_LIMITED', message),
  badGateway: (message = 'Downstream service error') => new ApiError(502, 'BAD_GATEWAY', message),
  unavailable: (message = 'Downstream service unavailable') => new ApiError(503, 'SERVICE_UNAVAILABLE', message),
};

export function errorBody(code: string, message: string) {
  return { error: { code, message } };
}
