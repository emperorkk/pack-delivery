import { clearSession } from './session';

export type Soft1ErrorEnvelope = {
  success: false;
  errorcode?: number;
  error?: string;
};

export class Soft1Error extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message || `Soft1 error (code ${code})`);
    this.code = code;
    this.name = 'Soft1Error';
  }
}

export class Soft1SessionInvalidError extends Soft1Error {
  constructor(code: number, message: string) {
    super(code, message);
    this.name = 'Soft1SessionInvalidError';
  }
}

export class Soft1UnreachableError extends Error {
  constructor(url: string, cause?: unknown) {
    super(`Soft1 endpoint unreachable: ${url}`);
    this.name = 'Soft1UnreachableError';
    this.cause = cause;
  }
}

/**
 * Parses any Soft1 response body and throws the right error subclass
 * when `success === false`. Caller receives the unchanged body on success.
 */
export function checkEnvelope<T extends { success?: boolean }>(body: T): T {
  if (body && body.success === false) {
    const env = body as unknown as Soft1ErrorEnvelope;
    const code = env.errorcode ?? 0;
    const msg = env.error ?? '';
    if (code < 0) {
      clearSession();
      throw new Soft1SessionInvalidError(code, msg);
    }
    throw new Soft1Error(code, msg);
  }
  return body;
}
