export class ApiError extends Error {
  public details?: string;
  constructor(
    public statusCode: number,
    message: string,
    details?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.details = details;
  }
}
