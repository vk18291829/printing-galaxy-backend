import type { AuthContext } from '@/common/types';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      rawBody?: Buffer;
    }
  }
}

export {};
