export class ExportError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    Object.assign(this, { status, code, headers });
  }
}

export function fail(status, code, message, headers) {
  throw new ExportError(status, code, message, headers);
}

export function json(value, status = 200, headers = {}) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}
