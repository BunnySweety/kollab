import { db } from '../db';
import { documents } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import puppeteer from 'puppeteer';
import TurndownService from 'turndown';
import * as turndownPluginGfm from 'turndown-plugin-gfm';
import type { TiptapContent, TiptapNode, TiptapMark } from '../types/tiptap';

// Initialize Turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*'
});

// Add GitHub Flavored Markdown support
turndownService.use(turndownPluginGfm.gfm);

// Convert TipTap JSON content to HTML
function tiptapToHtml(content: TiptapContent): string {
  if (!content || !content.content) return '';

  let html = '';

  function processNode(node: TiptapNode): string {
    let nodeHtml = '';

    switch (node.type) {
      case 'doc':
        nodeHtml = node.content?.map(processNode).join('') || '';
        break;

      case 'paragraph': {
        const paragraphContent = node.content?.map(processNode).join('') || '';
        nodeHtml = `<p>${paragraphContent}</p>`;
        break;
      }

      case 'heading': {
        const level = node.attrs?.level || 1;
        const headingContent = node.content?.map(processNode).join('') || '';
        nodeHtml = `<h${level}>${headingContent}</h${level}>`;
        break;
      }

      case 'text': {
        let text = escapeHtml(node.text || '');

        // Apply marks (bold, italic, code, etc.)
        if (node.marks) {
          node.marks.forEach((mark: TiptapMark) => {
            switch (mark.type) {
              case 'bold':
                text = `<strong>${text}</strong>`;
                break;
              case 'italic':
                text = `<em>${text}</em>`;
                break;
              case 'code':
                text = `<code>${text}</code>`;
                break;
              case 'link': {
                // SECURITY: Validate URL protocol to prevent javascript: URLs
                const href = mark.attrs?.href || '';
                const safeHref = href && typeof href === 'string' && href.match(/^(https?:\/\/|\/|#)/) ? escapeHtml(href) : '#';
                text = `<a href="${safeHref}">${text}</a>`;
                break;
              }
              case 'strike':
                text = `<s>${text}</s>`;
                break;
            }
          });
        }
        nodeHtml = text;
        break;
      }

      case 'bulletList': {
        const bulletItems = node.content?.map(processNode).join('') || '';
        nodeHtml = `<ul>${bulletItems}</ul>`;
        break;
      }

      case 'orderedList': {
        const orderedItems = node.content?.map(processNode).join('') || '';
        nodeHtml = `<ol>${orderedItems}</ol>`;
        break;
      }

      case 'listItem': {
        const listContent = node.content?.map(processNode).join('') || '';
        nodeHtml = `<li>${listContent}</li>`;
        break;
      }

      case 'taskList': {
        const taskItems = node.content?.map(processNode).join('') || '';
        nodeHtml = `<ul class="task-list">${taskItems}</ul>`;
        break;
      }

      case 'taskItem': {
        const checked = node.attrs?.checked ? 'checked' : '';
        const taskContent = node.content?.map(processNode).join('') || '';
        nodeHtml = `<li><input type="checkbox" ${checked} disabled> ${taskContent}</li>`;
        break;
      }

      case 'codeBlock': {
        const lang = node.attrs?.language || '';
        const codeContent = node.content?.map((n: TiptapNode) => n.text || '').join('') || '';
        nodeHtml = `<pre><code class="language-${lang}">${escapeHtml(codeContent)}</code></pre>`;
        break;
      }

      case 'blockquote': {
        const quoteContent = node.content?.map(processNode).join('') || '';
        nodeHtml = `<blockquote>${quoteContent}</blockquote>`;
        break;
      }

      case 'horizontalRule':
        nodeHtml = '<hr>';
        break;

      case 'hardBreak':
        nodeHtml = '<br>';
        break;

      case 'image': {
        const { src, alt, title } = node.attrs || {};
        // SECURITY: Validate image URL protocol
        const safeSrc = (src && src.match(/^(https?:\/\/|data:image\/|\/)/)) ? escapeHtml(src) : '';
        nodeHtml = `<img src="${safeSrc}" alt="${escapeHtml(alt || '')}" title="${escapeHtml(title || '')}">`;
        break;
      }

      case 'table': {
        const tableContent = node.content?.map(processNode).join('') || '';
        nodeHtml = `<table>${tableContent}</table>`;
        break;
      }

      case 'tableRow': {
        const rowContent = node.content?.map(processNode).join('') || '';
        nodeHtml = `<tr>${rowContent}</tr>`;
        break;
      }

      case 'tableCell': {
        const cellContent = node.content?.map(processNode).join('') || '';
        nodeHtml = `<td>${cellContent}</td>`;
        break;
      }

      case 'tableHeader': {
        const headerContent = node.content?.map(processNode).join('') || '';
        nodeHtml = `<th>${headerContent}</th>`;
        break;
      }

      default:
        // Handle unknown nodes
        if (node.content) {
          nodeHtml = node.content.map(processNode).join('');
        }
    }

    return nodeHtml;
  }

  html = processNode(content);
  return html;
}

// Escape HTML special characters
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
}

// Convert TipTap JSON to Markdown
export function tiptapToMarkdown(content: TiptapContent): string {
  const html = tiptapToHtml(content);
  const markdown = turndownService.turndown(html);
  return markdown;
}

// Export document as Markdown
export async function exportDocumentAsMarkdown(documentId: string): Promise<{
  filename: string;
  content: string;
}> {
  // Get document
  const [document] = await db.select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new Error('Document not found');
  }

  // Convert content to Markdown
  const markdown = tiptapToMarkdown(document.content as TiptapContent);

  // Add metadata header
  const header = `---
title: ${document.title}
created: ${document.createdAt.toISOString()}
updated: ${document.updatedAt.toISOString()}
---

`;

  const fullContent = header + `# ${document.title}\n\n` + markdown;

  return {
    filename: `${document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`,
    content: fullContent
  };
}

// Export document as PDF
export async function exportDocumentAsPDF(documentId: string): Promise<{
  filename: string;
  buffer: Buffer;
}> {
  // Get document
  const [document] = await db.select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new Error('Document not found');
  }

  // Convert content to HTML
  const contentHtml = tiptapToHtml(document.content as TiptapContent);

  // Create full HTML document with styling
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(document.title)}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
          }
          h1 { font-size: 2.5em; margin-bottom: 0.5em; color: #111; }
          h2 { font-size: 2em; margin-top: 1.5em; margin-bottom: 0.5em; color: #111; }
          h3 { font-size: 1.5em; margin-top: 1.2em; margin-bottom: 0.5em; color: #111; }
          h4 { font-size: 1.2em; margin-top: 1em; margin-bottom: 0.5em; color: #111; }
          p { margin: 1em 0; }
          ul, ol { margin: 1em 0; padding-left: 2em; }
          li { margin: 0.5em 0; }
          code {
            background-color: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', Courier, monospace;
          }
          pre {
            background-color: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            margin: 1em 0;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          blockquote {
            border-left: 4px solid #ddd;
            margin: 1em 0;
            padding-left: 1em;
            color: #666;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f4f4f4;
            font-weight: bold;
          }
          hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 2em 0;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          .task-list {
            list-style: none;
            padding-left: 0;
          }
          .task-list li {
            padding-left: 1.5em;
            position: relative;
          }
          .task-list input[type="checkbox"] {
            position: absolute;
            left: 0;
            top: 0.3em;
          }
          .metadata {
            color: #666;
            font-size: 0.9em;
            margin-bottom: 2em;
            padding-bottom: 1em;
            border-bottom: 1px solid #ddd;
          }
        </style>
      </head>
      <body>
        <div class="metadata">
          <strong>Created:</strong> ${escapeHtml(new Date(document.createdAt).toLocaleString())}<br>
          <strong>Updated:</strong> ${escapeHtml(new Date(document.updatedAt).toLocaleString())}
        </div>
        <h1>${escapeHtml(document.title)}</h1>
        ${contentHtml}
      </body>
    </html>
  `;

  // Generate PDF using Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      },
      printBackground: true
    });

    return {
      filename: `${document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
      buffer: Buffer.from(pdfBuffer)
    };
  } finally {
    await browser.close();
  }
}

// Export multiple documents as a single Markdown file
export async function exportDocumentsAsMarkdown(documentIds: string[]): Promise<{
  filename: string;
  content: string;
}> {
  const documentsData = await db.select()
    .from(documents)
    .where(inArray(documents.id, documentIds));

  let fullContent = '# Exported Documents\n\n';
  fullContent += `_Exported on ${new Date().toLocaleString()}_\n\n`;
  fullContent += '---\n\n';

  for (const doc of documentsData) {
    const markdown = tiptapToMarkdown(doc.content as TiptapContent);
    fullContent += `## ${doc.title}\n\n`;
    fullContent += markdown;
    fullContent += '\n\n---\n\n';
  }

  return {
    filename: `documents_export_${Date.now()}.md`,
    content: fullContent
  };
}