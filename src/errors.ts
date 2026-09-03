/**
 * Usage/validation error (missing flag, invalid value, ambiguous account, etc.).
 * Maps to CLI exit code 2.
 */
export class ValidationError extends Error {
  readonly code: string
  readonly exitCode = 2 as const

  constructor(message: string, code = 'validation_error') {
    super(message)
    this.name = 'ValidationError'
    this.code = code
  }
}

/**
 * Error raised by the OVH API (or any unexpected runtime error), formatted
 * readably instead of as a raw stack trace. Maps to CLI exit code 1.
 */
export class ApiError extends Error {
  readonly code: string
  readonly exitCode = 1 as const

  constructor(message: string, code = 'api_error') {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

export type OvhtoolError = ValidationError | ApiError

export function isOvhtoolError(error: unknown): error is OvhtoolError {
  return error instanceof ValidationError || error instanceof ApiError
}

export function toOvhtoolError(error: unknown): OvhtoolError {
  if (isOvhtoolError(error)) return error
  return new ApiError(error instanceof Error ? error.message : String(error), 'unexpected_error')
}
