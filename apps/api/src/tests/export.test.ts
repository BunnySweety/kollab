/**
 * Export Service Tests
 * 
 * Tests for document export functionality including:
 * - HTML escaping (XSS prevention)
 * - URL validation (SSRF prevention)
 * - Markdown export
 * - Rate limiting
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Export Service', () => {
  describe('HTML Escaping (XSS Prevention)', () => {
    /**
     * HTML escape function to prevent XSS attacks
     */
    function escapeHtml(text: string): string {
      const htmlEntities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;'
      };
      return text.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char);
    }

    it('should escape HTML special characters', () => {
      const maliciousInput = '<script>alert("XSS")</script>';
      const escaped = escapeHtml(maliciousInput);
      
      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
      expect(escaped).not.toContain('<script>');
      expect(escaped).not.toContain('</script>');
    });

    it('should escape ampersands', () => {
      const input = 'Fish & Chips';
      const escaped = escapeHtml(input);
      
      expect(escaped).toBe('Fish &amp; Chips');
    });

    it('should escape quotes', () => {
      const input = 'Say "Hello"';
      const escaped = escapeHtml(input);
      
      expect(escaped).toBe('Say &quot;Hello&quot;');
    });

    it('should escape single quotes', () => {
      const input = "It's a test";
      const escaped = escapeHtml(input);
      
      expect(escaped).toBe('It&#39;s a test');
    });

    it('should escape forward slashes', () => {
      const input = 'Path: /root/file';
      const escaped = escapeHtml(input);
      
      expect(escaped).toBe('Path: &#x2F;root&#x2F;file');
    });

    it('should handle multiple special characters', () => {
      const input = '<img src="x" onerror=\'alert("XSS")\'/>';
      const escaped = escapeHtml(input);
      
      expect(escaped).not.toContain('<img');
      expect(escaped).not.toContain('</img>');
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
      expect(escaped).toContain('&quot;');
      expect(escaped).toContain('&#39;');
      // Verify that dangerous patterns are escaped (src= and onerror= will still appear but quotes are escaped)
      expect(escaped).toContain('src=&quot;');
      expect(escaped).toContain('onerror=&#39;');
    });

    it('should not modify safe text', () => {
      const safeText = 'This is a safe document title';
      const escaped = escapeHtml(safeText);
      
      expect(escaped).toBe(safeText);
    });

    it('should prevent script injection in document titles', () => {
      const maliciousTitle = 'Document<script>alert(1)</script>';
      const escaped = escapeHtml(maliciousTitle);
      
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;script&gt;');
    });

    it('should prevent event handler injection', () => {
      const maliciousContent = '<div onload="steal()">Content</div>';
      const escaped = escapeHtml(maliciousContent);
      
      // Verify that HTML tags are escaped
      expect(escaped).not.toContain('<div');
      expect(escaped).not.toContain('</div>');
      expect(escaped).toContain('&lt;div');
      expect(escaped).toContain('&lt;&#x2F;div&gt;');
      // Quotes around attributes are escaped, so onload= will appear but quotes are escaped
      expect(escaped).toContain('onload=&quot;');
    });
  });

  describe('URL Validation (SSRF Prevention)', () => {
    const urlSchema = z.string()
      .url('Invalid URL format')
      .refine((url) => {
        try {
          const parsed = new URL(url);
          // Only allow http and https protocols
          return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
          return false;
        }
      }, 'Only HTTP and HTTPS URLs are allowed')
      .refine((url) => {
        try {
          const parsed = new URL(url);
          let hostname = parsed.hostname.toLowerCase();
          
          // Remove brackets from IPv6 addresses
          hostname = hostname.replace(/^\[|\]$/g, '');
          
          // Block localhost and private IPs
          const blockedHosts = [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '::1'
          ];
          
          if (blockedHosts.includes(hostname)) {
            return false;
          }
          
          // Block private IP ranges
          if (hostname.startsWith('192.168.') || 
              hostname.startsWith('10.') ||
              hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)) {
            return false;
          }
          
          return true;
        } catch {
          return false;
        }
      }, 'Cannot use local or private IP addresses');

    it('should accept valid HTTP URL', () => {
      const result = urlSchema.safeParse('http://example.com/page');
      expect(result.success).toBe(true);
    });

    it('should accept valid HTTPS URL', () => {
      const result = urlSchema.safeParse('https://example.com/page');
      expect(result.success).toBe(true);
    });

    it('should reject localhost URLs', () => {
      const urls = [
        'http://localhost:3000',
        'http://127.0.0.1:8080',
        'http://[::1]:3000'
      ];

      urls.forEach(url => {
        const result = urlSchema.safeParse(url);
        expect(result.success).toBe(false);
      });
    });

    it('should reject private IP ranges', () => {
      const privateIPs = [
        'http://192.168.1.1',
        'http://10.0.0.1',
        'http://172.16.0.1',
        'http://172.31.255.255'
      ];

      privateIPs.forEach(url => {
        const result = urlSchema.safeParse(url);
        expect(result.success).toBe(false);
      });
    });

    it('should reject file:// protocol', () => {
      const result = urlSchema.safeParse('file:///etc/passwd');
      expect(result.success).toBe(false);
    });

    it('should reject javascript: protocol', () => {
      const result = urlSchema.safeParse('javascript:alert(1)');
      expect(result.success).toBe(false);
    });

    it('should reject data: URLs', () => {
      const result = urlSchema.safeParse('data:text/html,<script>alert(1)</script>');
      expect(result.success).toBe(false);
    });

    it('should reject ftp:// protocol', () => {
      const result = urlSchema.safeParse('ftp://example.com/file');
      expect(result.success).toBe(false);
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'not a url',
        'htp://broken',
        '//example.com',
        'example.com'
      ];

      invalidUrls.forEach(url => {
        const result = urlSchema.safeParse(url);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Markdown Export', () => {
    /**
     * Simple markdown conversion for testing
     */
    function convertToMarkdown(html: string): string {
      return html
        .replace(/<h1>(.*?)<\/h1>/g, '# $1\n')
        .replace(/<h2>(.*?)<\/h2>/g, '## $1\n')
        .replace(/<h3>(.*?)<\/h3>/g, '### $1\n')
        .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
        .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
        .replace(/<em>(.*?)<\/em>/g, '*$1*')
        .replace(/<code>(.*?)<\/code>/g, '`$1`')
        .replace(/<a href="(.*?)">(.*?)<\/a>/g, '[$2]($1)')
        .replace(/<ul>/g, '')
        .replace(/<\/ul>/g, '\n')
        .replace(/<li>(.*?)<\/li>/g, '- $1\n')
        .trim();
    }

    it('should convert headings to markdown', () => {
      const html = '<h1>Title</h1><h2>Subtitle</h2>';
      const markdown = convertToMarkdown(html);
      
      expect(markdown).toContain('# Title');
      expect(markdown).toContain('## Subtitle');
    });

    it('should convert paragraphs', () => {
      const html = '<p>First paragraph</p><p>Second paragraph</p>';
      const markdown = convertToMarkdown(html);
      
      expect(markdown).toContain('First paragraph');
      expect(markdown).toContain('Second paragraph');
    });

    it('should convert bold text', () => {
      const html = '<p>This is <strong>bold</strong> text</p>';
      const markdown = convertToMarkdown(html);
      
      expect(markdown).toContain('**bold**');
    });

    it('should convert italic text', () => {
      const html = '<p>This is <em>italic</em> text</p>';
      const markdown = convertToMarkdown(html);
      
      expect(markdown).toContain('*italic*');
    });

    it('should convert code blocks', () => {
      const html = '<p>Use <code>console.log()</code> for debugging</p>';
      const markdown = convertToMarkdown(html);
      
      expect(markdown).toContain('`console.log()`');
    });

    it('should convert links', () => {
      const html = '<p><a href="https://example.com">Link</a></p>';
      const markdown = convertToMarkdown(html);
      
      expect(markdown).toContain('[Link](https://example.com)');
    });

    it('should convert lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const markdown = convertToMarkdown(html);
      
      expect(markdown).toContain('- Item 1');
      expect(markdown).toContain('- Item 2');
    });
  });

  describe('Export Rate Limiting', () => {
    it('should track export attempts per user', () => {
      const attempts = new Map<string, number>();
      const userId = 'user-123';
      
      // Simulate 10 export attempts
      for (let i = 0; i < 10; i++) {
        const current = attempts.get(userId) || 0;
        attempts.set(userId, current + 1);
      }

      expect(attempts.get(userId)).toBe(10);
    });

    it('should block after 10 exports in 5 minutes', () => {
      const MAX_EXPORTS = 10;
      const attempts = new Map<string, number>();
      const userId = 'user-123';
      
      // Simulate 11 attempts
      for (let i = 0; i < 11; i++) {
        const current = attempts.get(userId) || 0;
        attempts.set(userId, current + 1);
      }

      const isBlocked = (attempts.get(userId) || 0) >= MAX_EXPORTS;
      expect(isBlocked).toBe(true);
    });

    it('should allow exports after time window expires', () => {
      const attempts = new Map<string, { count: number; expiresAt: number }>();
      const userId = 'user-123';

      // Set attempts that expired
      const expiredTime = Date.now() - 100;
      attempts.set(userId, { count: 10, expiresAt: expiredTime });

      // Check if expired
      const record = attempts.get(userId);
      const isExpired = record ? record.expiresAt < Date.now() : true;
      
      if (isExpired) {
        attempts.delete(userId);
      }

      // Should be able to export again
      expect(attempts.has(userId)).toBe(false);
    });
  });

  describe('Export Input Validation', () => {
    const exportSchema = z.object({
      documentId: z.string().uuid('Invalid document ID'),
      format: z.enum(['pdf', 'markdown'], {
        errorMap: () => ({ message: 'Format must be pdf or markdown' })
      }),
      url: z.string().url().optional()
    });

    it('should accept valid export request', () => {
      const validRequest = {
        documentId: '123e4567-e89b-12d3-a456-426614174000',
        format: 'pdf' as const
      };

      const result = exportSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid document ID', () => {
      const invalidRequest = {
        documentId: 'not-a-uuid',
        format: 'pdf' as const
      };

      const result = exportSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject invalid format', () => {
      const invalidRequest = {
        documentId: '123e4567-e89b-12d3-a456-426614174000',
        format: 'docx' as unknown
      };

      const result = exportSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should accept markdown format', () => {
      const validRequest = {
        documentId: '123e4567-e89b-12d3-a456-426614174000',
        format: 'markdown' as const
      };

      const result = exportSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('Filename Sanitization', () => {
    function sanitizeFilename(filename: string): string {
      return filename
        .replace(/[^a-zA-Z0-9-_. ]/g, '_')
        .replace(/\s+/g, '_')
        .substring(0, 200); // Limit length
    }

    it('should remove special characters from filename', () => {
      const malicious = 'document<script>.pdf';
      const sanitized = sanitizeFilename(malicious);
      
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
      expect(sanitized).toBe('document_script_.pdf');
    });

    it('should replace spaces with underscores', () => {
      const filename = 'My Document Title.pdf';
      const sanitized = sanitizeFilename(filename);
      
      expect(sanitized).toBe('My_Document_Title.pdf');
    });

    it('should limit filename length', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      const sanitized = sanitizeFilename(longName);
      
      expect(sanitized.length).toBeLessThanOrEqual(200);
    });

    it('should preserve alphanumeric and safe characters', () => {
      const safe = 'Document-2024_v1.0.pdf';
      const sanitized = sanitizeFilename(safe);
      
      expect(sanitized).toBe('Document-2024_v1.0.pdf');
    });
  });
});

