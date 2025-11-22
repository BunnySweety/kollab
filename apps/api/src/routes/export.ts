import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { exportDocumentAsMarkdown, exportDocumentAsPDF } from '../services/export';
import { db } from '../db';
import { documents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { checkWorkspaceMembership } from '../lib/workspace-helpers';
import { exportRateLimiter } from '../middleware/rate-limiter';
import { log } from '../lib/logger';
import type { User } from '../types';

const exportRoutes = new Hono();

// Export document as Markdown (with rate limiting)
exportRoutes.get('/document/:id/markdown', exportRateLimiter, requireAuth, async (c) => {
  const documentId = c.req.param('id');
  const user = c.get('user') as User;

  try {
    // Verify user has access to the document
    const [document] = await db.select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      return c.json({ error: 'Document not found' }, 404);
    }

    // SECURITY: Verify user has access to the workspace
    const membership = await checkWorkspaceMembership(document.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied: You do not have access to this workspace' }, 403);
    }

    // Export as Markdown
    const { filename, content } = await exportDocumentAsMarkdown(documentId);

    // Set headers for download
    c.header('Content-Type', 'text/markdown; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);

    return c.text(content);
  } catch (error) {
    log.error('Export markdown error', error as Error, { documentId });
    return c.json({ error: 'Failed to export document' }, 500);
  }
});

// Export document as PDF (with rate limiting)
exportRoutes.get('/document/:id/pdf', exportRateLimiter, requireAuth, async (c) => {
  const documentId = c.req.param('id');
  const user = c.get('user') as User;

  try {
    // Verify user has access to the document
    const [document] = await db.select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      return c.json({ error: 'Document not found' }, 404);
    }

    // SECURITY: Verify user has access to the workspace
    const membership = await checkWorkspaceMembership(document.workspaceId, user.id);
    if (!membership) {
      return c.json({ error: 'Access denied: You do not have access to this workspace' }, 403);
    }

    // Export as PDF
    const { filename, buffer } = await exportDocumentAsPDF(documentId);

    // Set headers for download
    c.header('Content-Type', 'application/pdf');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    c.header('Content-Length', buffer.length.toString());

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });
  } catch (error) {
    log.error('Export PDF error', error as Error, { documentId });
    return c.json({ error: 'Failed to export document as PDF' }, 500);
  }
});

// Get available export formats
exportRoutes.get('/formats', requireAuth, async (c) => {
  return c.json({
    formats: [
      {
        id: 'markdown',
        name: 'Markdown',
        description: 'Export as Markdown file (.md)',
        extension: '.md',
        mimeType: 'text/markdown'
      },
      {
        id: 'pdf',
        name: 'PDF',
        description: 'Export as PDF document',
        extension: '.pdf',
        mimeType: 'application/pdf'
      }
    ]
  });
});

export default exportRoutes;