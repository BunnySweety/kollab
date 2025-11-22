/**
 * Hono Context Type Declarations
 * 
 * This file extends Hono's context types to include custom variables
 * set by middleware (user, session, csrfToken).
 */

import type { User } from './index';
import type { Session } from 'lucia';

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
    session: Session;
    csrfToken: string;
  }
}

