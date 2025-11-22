import { Lucia } from 'lucia';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db } from '../db';
import { sessions, users } from '../db/schema';

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

// SECURITY: Session expiration configuration
// Default: 30 days, configurable via SESSION_EXPIRY_DAYS environment variable
// Note: Lucia handles session expiration via expiresAt in database, not cookie expires
// Cookie expires is for browser cookie lifetime, not session validity
const getSessionExpiryDays = (): number => {
  const expiryDays = process.env.SESSION_EXPIRY_DAYS 
    ? parseInt(process.env.SESSION_EXPIRY_DAYS, 10)
    : 30; // Default: 30 days
  
  // Validate expiry days (must be between 1 and 365)
  if (isNaN(expiryDays) || expiryDays < 1 || expiryDays > 365) {
    throw new Error('SESSION_EXPIRY_DAYS must be a number between 1 and 365');
  }
  
  return expiryDays;
};

// Store expiry days for use in session creation
export const SESSION_EXPIRY_DAYS = getSessionExpiryDays();

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: 'session',
    // Note: expires: false means cookie doesn't expire (session validity is handled by expiresAt in DB)
    // The actual session expiration is controlled by expiresAt timestamp in sessions table
    expires: false, // SECURITY: Session expiration is handled by expiresAt in database
    attributes: {
      secure: process.env.NODE_ENV === 'production',
      // SECURITY: Changed from 'lax' to 'strict' for better CSRF protection
      sameSite: 'strict',
      path: '/',
      // SECURITY FIX: Enable httpOnly to prevent XSS access to session cookies
      // Note: httpOnly is handled automatically by Lucia in newer versions
    } as {
      secure?: boolean;
      sameSite?: 'strict' | 'lax' | 'none';
      path?: string;
    }
  },
  getUserAttributes: (attributes) => {
    return {
      id: attributes.id,
      email: attributes.email,
      name: attributes.name,
      emailVerified: attributes.emailVerified
    };
  }
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

interface DatabaseUserAttributes {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}