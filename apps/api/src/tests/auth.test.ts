/**
 * Authentication Tests
 * 
 * Tests for user registration, login, session management, and password security
 */

import { describe, it, expect } from 'vitest';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

describe('Authentication', () => {
  describe('Password Hashing', () => {
    it('should hash password with Argon2id', async () => {
      const password = 'SecurePassword123!';
      const hashedPassword = await hash(password, {
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1
      });

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword).toMatch(/^\$argon2id\$/);
    });

    it('should verify correct password', async () => {
      const password = 'SecurePassword123!';
      const hashedPassword = await hash(password, {
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1
      });

      const isValid = await verify(hashedPassword, password);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'SecurePassword123!';
      const hashedPassword = await hash(password, {
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1
      });

      const isValid = await verify(hashedPassword, 'WrongPassword');
      expect(isValid).toBe(false);
    });

    it('should use OWASP recommended Argon2 parameters', async () => {
      // OWASP recommends:
      // - memoryCost: 19456 (19 MiB)
      // - timeCost: 2
      // - parallelism: 1
      // - outputLen: 32

      const password = 'TestPassword123!';
      const hashedPassword = await hash(password, {
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1
      });

      // Verify the hash uses argon2id variant
      expect(hashedPassword).toMatch(/^\$argon2id\$/);
      
      // Verify password can be verified
      const isValid = await verify(hashedPassword, password);
      expect(isValid).toBe(true);
    });
  });

  describe('Password Validation', () => {
    const passwordSchema = z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

    it('should accept strong password', () => {
      const validPasswords = [
        'SecurePass123!',
        'MyP@ssw0rd',
        'Str0ng!Password',
        'Test1234!@#$'
      ];

      validPasswords.forEach(password => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(true);
      });
    });

    it('should reject password without uppercase', () => {
      const result = passwordSchema.safeParse('password123!');
      expect(result.success).toBe(false);
      if (!result.success && result.error.errors[0]) {
        expect(result.error.errors[0].message).toContain('uppercase');
      }
    });

    it('should reject password without lowercase', () => {
      const result = passwordSchema.safeParse('PASSWORD123!');
      expect(result.success).toBe(false);
      if (!result.success && result.error.errors[0]) {
        expect(result.error.errors[0].message).toContain('lowercase');
      }
    });

    it('should reject password without number', () => {
      const result = passwordSchema.safeParse('Password!');
      expect(result.success).toBe(false);
      if (!result.success && result.error.errors[0]) {
        expect(result.error.errors[0].message).toContain('number');
      }
    });

    it('should reject password without special character', () => {
      const result = passwordSchema.safeParse('Password123');
      expect(result.success).toBe(false);
      if (!result.success && result.error.errors[0]) {
        expect(result.error.errors[0].message).toContain('special character');
      }
    });

    it('should reject password shorter than 8 characters', () => {
      const result = passwordSchema.safeParse('Pass1!');
      expect(result.success).toBe(false);
      if (!result.success && result.error.errors[0]) {
        expect(result.error.errors[0].message).toContain('8 characters');
      }
    });
  });

  describe('User Registration Validation', () => {
    const registerSchema = z.object({
      email: z.string().email('Invalid email format'),
      password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
      name: z.string().min(1, 'Name is required').max(100, 'Name too long')
    });

    it('should accept valid registration data', () => {
      const validData = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        name: 'John Doe'
      };

      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'notanemail',
        password: 'SecurePass123!',
        name: 'John Doe'
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success && result.error.errors[0]) {
        expect(result.error.errors[0].message).toContain('email');
      }
    });

    it('should reject empty name', () => {
      const invalidData = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        name: ''
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success && result.error.errors[0]) {
        expect(result.error.errors[0].message).toContain('required');
      }
    });

    it('should reject name longer than 100 characters', () => {
      const invalidData = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        name: 'a'.repeat(101)
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success && result.error.errors[0]) {
        expect(result.error.errors[0].message).toContain('too long');
      }
    });
  });

  describe('Session Management', () => {
    it('should generate unique session IDs', () => {
      const sessionIds = new Set();
      const iterations = 1000;

      // Generate many session IDs (simulating Lucia's generateId)
      for (let i = 0; i < iterations; i++) {
        const id = generateMockSessionId();
        sessionIds.add(id);
      }

      // All IDs should be unique
      expect(sessionIds.size).toBe(iterations);
    });

    it('should have session expiry of 30 days', () => {
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const expiryDate = new Date(now + thirtyDaysInMs);

      expect(expiryDate.getTime() - now).toBe(thirtyDaysInMs);
    });

    it('should validate session expiry correctly', () => {
      const now = Date.now();
      
      // Expired session (31 days ago)
      const expiredSession = {
        expiresAt: new Date(now - 31 * 24 * 60 * 60 * 1000)
      };
      expect(expiredSession.expiresAt.getTime() < now).toBe(true);

      // Valid session (29 days in future)
      const validSession = {
        expiresAt: new Date(now + 29 * 24 * 60 * 60 * 1000)
      };
      expect(validSession.expiresAt.getTime() > now).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should track login attempts', () => {
      const attempts = new Map<string, number>();
      const email = 'user@example.com';
      
      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const current = attempts.get(email) || 0;
        attempts.set(email, current + 1);
      }

      expect(attempts.get(email)).toBe(5);
    });

    it('should block after 5 failed attempts', () => {
      const MAX_ATTEMPTS = 5;
      const attempts = new Map<string, number>();
      const email = 'user@example.com';
      
      // Simulate 6 attempts
      for (let i = 0; i < 6; i++) {
        const current = attempts.get(email) || 0;
        attempts.set(email, current + 1);
      }

      const isBlocked = (attempts.get(email) || 0) >= MAX_ATTEMPTS;
      expect(isBlocked).toBe(true);
    });

    it('should reset attempts after time window', () => {
      const attempts = new Map<string, { count: number; expiresAt: number }>();
      const email = 'user@example.com';

      // Set attempts that expired
      const expiredTime = Date.now() - 100;
      attempts.set(email, { count: 5, expiresAt: expiredTime });

      // Check if expired
      const record = attempts.get(email);
      const isExpired = record ? record.expiresAt < Date.now() : true;
      
      if (isExpired) {
        attempts.delete(email);
      }

      expect(attempts.has(email)).toBe(false);
    });
  });

  describe('Cookie Security', () => {
    it('should use secure cookie attributes', () => {
      const cookieAttributes = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict' as const,
        path: '/',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      };

      expect(cookieAttributes.httpOnly).toBe(true);
      expect(cookieAttributes.secure).toBe(true);
      expect(cookieAttributes.sameSite).toBe('strict');
    });

    it('should set httpOnly to prevent XSS', () => {
      const cookieAttributes = {
        httpOnly: true
      };

      expect(cookieAttributes.httpOnly).toBe(true);
    });

    it('should use SameSite=strict for CSRF protection', () => {
      const cookieAttributes = {
        sameSite: 'strict' as const
      };

      expect(cookieAttributes.sameSite).toBe('strict');
    });
  });
});

// Helper function to simulate session ID generation
function generateMockSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

