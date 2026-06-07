export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "INVALID_WOEID"
  | "INVALID_PARAMS"
  | "INVALID_TREND_ID"
  | "PARSE_ERROR"
  | "UPSTREAM_ERROR";

export const EXIT_CODES: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 2,
  AUTH_FAILED: 2,
  RATE_LIMITED: 3,
  INVALID_WOEID: 1,
  INVALID_PARAMS: 1,
  INVALID_TREND_ID: 1,
  PARSE_ERROR: 1,
  UPSTREAM_ERROR: 1,
};

export const HTTP_STATUS: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  AUTH_FAILED: 401,
  RATE_LIMITED: 429,
  INVALID_WOEID: 400,
  INVALID_PARAMS: 400,
  INVALID_TREND_ID: 400,
  PARSE_ERROR: 502,
  UPSTREAM_ERROR: 502,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
