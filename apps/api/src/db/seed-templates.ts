import { randomUUID } from 'crypto';
import { db } from './index';
import { templates, templateGallery } from './schema';
import { eq, and } from 'drizzle-orm';
import { log } from '../lib/logger.js';

// Official template content
const officialTemplates = [
  {
    name: 'Project Proposal',
    description: 'Professional project proposal template with sections for objectives, timeline, and budget',
    category: 'document' as const,
    icon: '📄',
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Project Proposal' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Executive Summary' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Provide a brief overview of the project...' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Project Objectives' }]
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Objective 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Objective 2' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Objective 3' }] }] }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Timeline' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Project timeline details...' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Budget' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Budget breakdown...' }]
        }
      ]
    },
    tags: ['business', 'proposal', 'planning'],
    isPublic: true,
    isOfficial: true
  },
  {
    name: 'Meeting Notes',
    description: 'Structured meeting notes template with attendees, agenda, and action items',
    category: 'meeting-notes' as const,
    icon: '📝',
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Meeting Notes - [Date]' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Attendees' }]
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name 2' }] }] }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Agenda' }]
        },
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Topic 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Topic 2' }] }] }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Discussion Notes' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Key discussion points...' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Action Items' }]
        },
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Action item 1 - Owner: [Name]' }] }] },
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Action item 2 - Owner: [Name]' }] }] }
          ]
        }
      ]
    },
    tags: ['meetings', 'notes', 'collaboration'],
    isPublic: true,
    isOfficial: true
  },
  {
    name: 'Product Roadmap',
    description: 'Product development roadmap with quarterly goals and milestones',
    category: 'roadmap' as const,
    icon: '🗺️',
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Product Roadmap 2024' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Q1 - Foundation' }]
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Core infrastructure setup' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'User authentication system' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Basic MVP features' }] }] }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Q2 - Growth' }]
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Advanced features' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Performance optimizations' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mobile app development' }] }] }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Q3 - Expansion' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Focus on market expansion and new integrations...' }]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Q4 - Innovation' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'AI features and advanced analytics...' }]
        }
      ]
    },
    tags: ['product', 'roadmap', 'planning'],
    isPublic: true,
    isOfficial: true
  },
  {
    name: 'Software Development Project',
    description: 'Complete project structure for software development with documentation and planning',
    category: 'project' as const,
    icon: '💻',
    structure: [
      {
        title: 'Project Overview',
        icon: '📋',
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project Overview' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Project description and goals...' }] }
          ]
        }
      },
      {
        title: 'Technical Specification',
        icon: '⚙️',
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Technical Specification' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Architecture' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'System architecture details...' }] }
          ]
        }
      },
      {
        title: 'Sprint Planning',
        icon: '🏃',
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Sprint Planning' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Sprint goals and user stories...' }] }
          ]
        }
      },
      {
        title: 'Documentation',
        icon: '📚',
        children: [
          {
            title: 'API Documentation',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'API Documentation' }] }
              ]
            }
          },
          {
            title: 'User Guide',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'User Guide' }] }
              ]
            }
          }
        ]
      }
    ],
    tags: ['development', 'software', 'project'],
    isPublic: true,
    isOfficial: true
  },
  {
    name: 'Team Wiki',
    description: 'Team knowledge base with onboarding, processes, and resources',
    category: 'wiki' as const,
    icon: '📖',
    structure: [
      {
        title: 'Welcome',
        icon: '👋',
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to the Team Wiki' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'This is your central hub for team information...' }] }
          ]
        }
      },
      {
        title: 'Onboarding',
        icon: '🚀',
        children: [
          {
            title: 'Getting Started',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Getting Started' }] }
              ]
            }
          },
          {
            title: 'Tools & Access',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Tools & Access' }] }
              ]
            }
          }
        ]
      },
      {
        title: 'Processes',
        icon: '⚡',
        children: [
          {
            title: 'Development Workflow',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Development Workflow' }] }
              ]
            }
          },
          {
            title: 'Code Review',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Code Review Guidelines' }] }
              ]
            }
          }
        ]
      },
      {
        title: 'Resources',
        icon: '📚',
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Team Resources' }] }
          ]
        }
      }
    ],
    tags: ['wiki', 'team', 'knowledge-base'],
    isPublic: true,
    isOfficial: true
  }
];

export async function seedTemplates() {
  const systemUserId = randomUUID(); // System user for official templates

  // Check if templates already exist (by name and isOfficial flag)
  let existingTemplates: Array<typeof templates.$inferSelect> = [];
  try {
    existingTemplates = await db.select()
      .from(templates)
      .where(eq(templates.isOfficial, true));
  } catch (error) {
    log.warn('Failed to check existing templates, proceeding with seeding', { error: (error as Error).message });
    existingTemplates = [];
  }

  const existingNames = new Set(
    existingTemplates
      .map(t => t.name?.toLowerCase().trim())
      .filter((name): name is string => !!name)
  );

  // If we already have all or more official templates than expected, skip seeding
  // We check >= instead of == because there might be more templates than defined
  if (existingTemplates.length >= officialTemplates.length) {
    // Check if all expected templates exist by name
    const allExpectedTemplatesExist = officialTemplates.every(template => 
      existingNames.has(template.name.toLowerCase().trim())
    );
    
    if (allExpectedTemplatesExist) {
      log.debug('All official templates already exist, skipping seeding', { 
        existingCount: existingTemplates.length,
        expectedCount: officialTemplates.length
      });
      return;
    }
    
    // If we have more templates but not all expected ones, log info but continue
    log.info('Some official templates exist, checking for missing ones', { 
      existingCount: existingTemplates.length,
      expectedCount: officialTemplates.length
    });
  }

  for (const templateData of officialTemplates) {
    try {
      // Skip if template already exists (case-insensitive comparison)
      const templateNameLower = templateData.name.toLowerCase().trim();
      if (existingNames.has(templateNameLower)) {
        log.debug('Template already exists, skipping', { 
          templateName: templateData.name
        });
        continue;
      }

      // Double-check template doesn't exist (race condition protection)
      const [existingTemplate] = await db.select()
        .from(templates)
        .where(
          and(
            eq(templates.isOfficial, true),
            eq(templates.name, templateData.name)
          )
        )
        .limit(1);

      if (existingTemplate) {
        log.debug('Template already exists (double-check)', { 
          templateName: templateData.name,
          templateId: existingTemplate.id
        });
        continue;
      }

      // Create template
      const templateResult = await db.insert(templates)
        .values({
          ...templateData,
          createdBy: systemUserId,
          workspaceId: null // Official templates are global
        })
        .returning();

      const template = templateResult[0];
      if (!template) {
        log.error('Failed to create template', new Error('Template creation returned no result'), { 
          templateName: templateData.name 
        });
        continue;
      }

      // Check if gallery entry already exists
      const existingGallery = await db.select()
        .from(templateGallery)
        .where(eq(templateGallery.templateId, template.id))
        .limit(1);

      if (existingGallery.length === 0) {
        try {
          // Add to gallery
          await db.insert(templateGallery)
            .values({
              templateId: template.id,
              title: templateData.name,
              description: templateData.description,
              category: templateData.category,
              tags: templateData.tags,
              publishedBy: systemUserId,
              featured: true, // Official templates are featured
              downloads: Math.floor(Math.random() * 1000), // Random initial downloads
              likes: Math.floor(Math.random() * 100), // Random initial likes
              rating: (Math.random() * 2 + 3).toFixed(2) // Random rating between 3-5
            });
          log.info('Added template to gallery', { templateName: templateData.name });
        } catch (galleryError) {
          // Gallery entry might already exist or have constraint violation
          const galleryErrorMessage = (galleryError as Error).message;
          if (galleryErrorMessage.includes('unique') || galleryErrorMessage.includes('duplicate')) {
            log.info('Template gallery entry already exists', { templateName: templateData.name });
          } else {
            log.warn('Failed to add template to gallery', { error: (galleryError as Error).message, templateName: templateData.name });
          }
        }
      } else {
        log.info('Template gallery entry already exists', { templateName: templateData.name });
      }

      log.info('Created template', { templateName: templateData.name, templateId: template.id });
    } catch (error) {
      // Check if error is due to duplicate (unique constraint violation)
      const errorMessage = (error as Error).message;
      
      // Extract PostgreSQL error code if available
      const pgError = error as Error & { code?: string; detail?: string; constraint?: string };
      const errorCode = pgError.code;
      const errorDetail = pgError.detail || '';
      const errorConstraint = pgError.constraint || '';
      
      // Check if error is due to duplicate or constraint violation FIRST
      // PostgreSQL error codes: 23505 = unique_violation, 23503 = foreign_key_violation
      const isDuplicateError = errorCode === '23505' || 
          errorMessage.includes('unique') || 
          errorMessage.includes('duplicate') || 
          errorMessage.includes('violates unique constraint') ||
          errorMessage.includes('already exists') ||
          errorDetail.includes('already exists');
      
      if (isDuplicateError) {
        // Template already exists - this is expected, don't log as error
        log.debug('Template already exists (constraint violation)', { 
          templateName: templateData.name,
          errorCode,
          constraint: errorConstraint
        });
        continue;
      }
      
      // For other errors, log as debug to avoid noise in startup logs
      // Only log if it's not a duplicate/constraint error (already handled above)
      log.debug('Skipping template due to error', { 
        templateName: templateData.name,
        errorCode,
        errorMessage: errorMessage.substring(0, 200),
        errorDetail: errorDetail.substring(0, 200)
      });
      continue;
    }
  }

  // Final count (only if we actually created templates)
  try {
    const finalTemplates = await db.select()
      .from(templates)
      .where(eq(templates.isOfficial, true));
    
    log.debug('Templates check complete', { 
      totalOfficialTemplates: finalTemplates.length 
    });
  } catch (_error) {
    // Ignore errors when checking final count
    log.debug('Could not verify final template count');
  }
}

// Run if executed directly
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  seedTemplates()
    .then(() => {
      log.info('Templates seeding script completed');
      process.exit(0);
    })
    .catch((error) => {
      log.error('Templates seeding failed', error as Error);
      process.exit(1);
    });
}