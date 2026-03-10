/**
 * Test helpers for building Request objects and route params.
 */

export function buildRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Request {
  const { method = 'GET', headers = {}, body } = options;
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function buildParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}
