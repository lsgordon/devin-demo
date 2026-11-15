/** Missing permission -> HTTP 403. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Row does not exist OR is outside the user's scope -> HTTP 404 (never leak existence). */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** No session -> HTTP 401. */
export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** Business-rule violation (e.g. approving an already-decided request) -> HTTP 409. */
export class ConflictError extends Error {
  readonly status = 409;
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}
