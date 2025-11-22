import { MeiliSearch } from 'meilisearch';
import { log } from '../lib/logger';
import { db } from '../db';
import { documents, tasks, workspaces, wikiPages } from '../db/schema';
import type { TiptapContent, TiptapNode } from '../types/tiptap';
import type { Document, Task, Workspace } from '../types';

// Initialize MeiliSearch client
const meiliClient = new MeiliSearch({
  host: process.env.MEILISEARCH_URL || 'http://localhost:7700',
  apiKey: process.env.MEILISEARCH_MASTER_KEY || 'masterKey'
});

// Index names
const INDEXES = {
  documents: 'documents',
  tasks: 'tasks',
  workspaces: 'workspaces',
  wikiPages: 'wiki_pages'
};

// Check if MeiliSearch is available
let isMeiliSearchAvailable = false;

const SEARCH_SYNC_BATCH_SIZE = (() => {
  const fallback = 500;
  const rawValue = process.env.SEARCH_SYNC_BATCH_SIZE
    ? parseInt(process.env.SEARCH_SYNC_BATCH_SIZE, 10)
    : fallback;

  if (Number.isNaN(rawValue) || rawValue <= 0) {
    return fallback;
  }

  return Math.min(rawValue, 2000);
})();

export async function checkMeiliSearchAvailability(): Promise<boolean> {
  // Check if MeiliSearch is configured
  // If not configured, return false (service unavailable but not an error)
  if (!process.env.MEILISEARCH_URL && !process.env.MEILISEARCH_MASTER_KEY) {
    return false;
  }

  // Test connection with timeout
  try {
    const healthPromise = meiliClient.health();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 2000)
    );
    
    await Promise.race([healthPromise, timeoutPromise]);
    return true;
  } catch (error) {
    // Log only if it's a real error (not just unconfigured)
    if (process.env.MEILISEARCH_URL || process.env.MEILISEARCH_MASTER_KEY) {
      log.warn('MeiliSearch health check failed', { error: (error as Error).message });
    }
    return false;
  }
}

// Initialize indexes
export async function initializeSearchIndexes(): Promise<boolean> {
  try {
    // Check if MeiliSearch is configured
    if (!process.env.MEILISEARCH_URL && !process.env.MEILISEARCH_MASTER_KEY) {
      log.info('MeiliSearch not configured, skipping search index initialization');
      isMeiliSearchAvailable = false;
      return false;
    }

    log.info('Initializing MeiliSearch indexes...');

    // Test connection first
    try {
      await meiliClient.health();
      isMeiliSearchAvailable = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('API key') || errorMessage.includes('invalid')) {
        log.warn('MeiliSearch API key is invalid or missing. Search features will be disabled.', {
          error: errorMessage
        });
      } else {
        log.warn('MeiliSearch not available, search features will be disabled', {
          error: errorMessage
        });
      }
      isMeiliSearchAvailable = false;
      return false;
    }

    // Create documents index
    const documentsIndex = meiliClient.index(INDEXES.documents);
    await documentsIndex.updateSettings({
      searchableAttributes: ['title', 'content'],
      displayedAttributes: ['id', 'title', 'content', 'workspaceId', 'icon', 'updatedAt'],
      filterableAttributes: ['workspaceId', 'isArchived', 'isPublished'],
      sortableAttributes: ['updatedAt'],
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
        'updatedAt:desc'
      ]
    });

    // Create tasks index
    const tasksIndex = meiliClient.index(INDEXES.tasks);
    await tasksIndex.updateSettings({
      searchableAttributes: ['title', 'description', 'tags'],
      displayedAttributes: ['id', 'title', 'description', 'status', 'priority', 'assigneeId', 'dueDate', 'workspaceId'],
      filterableAttributes: ['workspaceId', 'status', 'priority', 'assigneeId'],
      sortableAttributes: ['dueDate', 'priority', 'updatedAt'],
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
        'priority:desc',
        'dueDate:asc'
      ]
    });

    // Create workspaces index
    const workspacesIndex = meiliClient.index(INDEXES.workspaces);
    await workspacesIndex.updateSettings({
      searchableAttributes: ['name', 'description'],
      displayedAttributes: ['id', 'name', 'description', 'slug'],
      filterableAttributes: ['createdBy'],
      sortableAttributes: ['createdAt', 'updatedAt']
    });

    // Create wiki pages index
    const wikiPagesIndex = meiliClient.index(INDEXES.wikiPages);
    await wikiPagesIndex.updateSettings({
      searchableAttributes: ['title', 'content', 'excerpt', 'slug'],
      displayedAttributes: ['id', 'title', 'content', 'excerpt', 'slug', 'workspaceId', 'projectId', 'icon', 'updatedAt'],
      filterableAttributes: ['workspaceId', 'projectId', 'isArchived', 'isPublished'],
      sortableAttributes: ['updatedAt', 'createdAt'],
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
        'updatedAt:desc'
      ]
    });

    log.info('MeiliSearch indexes initialized successfully');
    isMeiliSearchAvailable = true;
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('API key') || errorMessage.includes('invalid')) {
      log.warn('MeiliSearch API key is invalid. Search features will be disabled.', {
        error: errorMessage
      });
    } else {
      log.error('Failed to initialize search indexes', error as Error);
    }
    isMeiliSearchAvailable = false;
    return false;
  }
}

// Get MeiliSearch availability status
export function getMeiliSearchAvailability(): boolean {
  return isMeiliSearchAvailable;
}

// Index a document
export async function indexDocument(document: Document) {
  if (!isMeiliSearchAvailable) {
    return;
  }

  try {
    const index = meiliClient.index(INDEXES.documents);

    // Convert content to searchable text if it's JSON
    let searchableContent = '';
    if (document.content && typeof document.content === 'object') {
      searchableContent = extractTextFromContent(document.content as TiptapContent);
    }

    await index.addDocuments([{
      id: document.id,
      title: document.title,
      content: searchableContent,
      workspaceId: document.workspaceId,
      icon: document.icon,
      isArchived: document.isArchived,
      isPublished: document.isPublished,
      updatedAt: document.updatedAt
    }]);
  } catch (error) {
    log.error('Failed to index document', error as Error, { documentId: document.id });
  }
}

// Index a task
export async function indexTask(task: Task) {
  if (!isMeiliSearchAvailable) {
    return;
  }

  try {
    const index = meiliClient.index(INDEXES.tasks);
    await index.addDocuments([{
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      dueDate: task.dueDate,
      tags: task.tags || [],
      workspaceId: task.workspaceId,
      updatedAt: task.updatedAt
    }]);
  } catch (error) {
    log.error('Failed to index task', error as Error, { taskId: task.id });
  }
}

// Index a workspace
export async function indexWorkspace(workspace: Workspace) {
  if (!isMeiliSearchAvailable) {
    return;
  }

  try {
    const index = meiliClient.index(INDEXES.workspaces);
    await index.addDocuments([{
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      slug: workspace.slug,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt
    }]);
  } catch (error) {
    log.error('Failed to index workspace', error as Error, { workspaceId: workspace.id });
  }
}

// Index a wiki page
export async function indexWikiPage(page: typeof wikiPages.$inferSelect) {
  if (!isMeiliSearchAvailable) {
    return;
  }

  try {
    const index = meiliClient.index(INDEXES.wikiPages);

    let searchableContent = '';
    if (page.content && typeof page.content === 'object') {
      searchableContent = extractTextFromContent(page.content as TiptapContent);
    }

    await index.addDocuments([{
      id: page.id,
      title: page.title,
      content: searchableContent,
      excerpt: page.excerpt,
      slug: page.slug,
      workspaceId: page.workspaceId,
      projectId: page.projectId,
      icon: page.icon,
      isArchived: page.isArchived,
      isPublished: page.isPublished,
      updatedAt: page.updatedAt
    }]);
  } catch (error) {
    log.error('Failed to index wiki page', error as Error, { pageId: page.id });
  }
}

// Update wiki page in index
export async function updateWikiPageIndex(pageId: string, updates: Partial<typeof wikiPages.$inferSelect>) {
  if (!isMeiliSearchAvailable) {
    return;
  }

  try {
    const index = meiliClient.index(INDEXES.wikiPages);

    const updatePayload: Record<string, unknown> = { id: pageId };
    
    if (updates.content && typeof updates.content === 'object') {
      updatePayload.content = extractTextFromContent(updates.content as TiptapContent);
    } else if (updates.content !== undefined) {
      updatePayload.content = updates.content;
    }

    Object.keys(updates).forEach(key => {
      if (key !== 'content') {
        updatePayload[key] = updates[key as keyof typeof updates];
      }
    });

    await index.updateDocuments([updatePayload]);
  } catch (error) {
    log.error('Failed to update wiki page index', error as Error, { pageId });
  }
}

// Update document in index
export async function updateDocumentIndex(documentId: string, updates: Partial<Document>) {
  if (!isMeiliSearchAvailable) {
    return;
  }

  try {
    const index = meiliClient.index(INDEXES.documents);

    if (updates.content && typeof updates.content === 'object') {
      updates.content = extractTextFromContent(updates.content as TiptapContent);
    }

    await index.updateDocuments([{
      id: documentId,
      ...updates
    }]);
  } catch (error) {
    log.error('Failed to update document index', error as Error, { documentId });
  }
}

// Delete from index
export async function deleteFromIndex(indexName: string, id: string) {
  if (!isMeiliSearchAvailable) {
    return;
  }

  try {
    const index = meiliClient.index(indexName);
    await index.deleteDocument(id);
  } catch (error) {
    log.error('Failed to delete from index', error as Error, { indexName, id });
  }
}

// Search across all indexes
export async function searchAll(query: string, workspaceId?: string, limit = 20) {
  if (!isMeiliSearchAvailable) {
    return {
      documents: [],
      tasks: [],
      workspaces: [],
      wikiPages: [],
      query,
      processingTimeMs: 0
    };
  }

  try {
    const searchPromises = [];

    // Search documents
    const documentsIndex = meiliClient.index(INDEXES.documents);
    searchPromises.push(
      documentsIndex.search(query, {
        limit: Math.floor(limit / 4),
        filter: workspaceId ? `workspaceId = "${workspaceId}" AND isArchived = false` : 'isArchived = false'
      })
    );

    // Search tasks
    const tasksIndex = meiliClient.index(INDEXES.tasks);
    searchPromises.push(
      tasksIndex.search(query, {
        limit: Math.floor(limit / 4),
        filter: workspaceId ? `workspaceId = "${workspaceId}"` : undefined
      })
    );

    // Search workspaces
    const workspacesIndex = meiliClient.index(INDEXES.workspaces);
    searchPromises.push(
      workspacesIndex.search(query, {
        limit: Math.floor(limit / 4)
      })
    );

    // Search wiki pages
    const wikiPagesIndex = meiliClient.index(INDEXES.wikiPages);
    searchPromises.push(
      wikiPagesIndex.search(query, {
        limit: Math.floor(limit / 4),
        filter: workspaceId ? `workspaceId = "${workspaceId}" AND isArchived = false` : 'isArchived = false'
      })
    );

    const [documentsResults, tasksResults, workspacesResults, wikiPagesResults] = await Promise.all(searchPromises);

    return {
      documents: documentsResults?.hits || [],
      tasks: tasksResults?.hits || [],
      workspaces: workspacesResults?.hits || [],
      wikiPages: wikiPagesResults?.hits || [],
      query,
      processingTimeMs: (documentsResults?.processingTimeMs || 0) + (tasksResults?.processingTimeMs || 0) + (workspacesResults?.processingTimeMs || 0) + (wikiPagesResults?.processingTimeMs || 0)
    };
  } catch (error) {
    log.error('Search error', error as Error, { query });
    return {
      documents: [],
      tasks: [],
      workspaces: [],
      wikiPages: [],
      query,
      processingTimeMs: 0
    };
  }
}

// Search specific index
export async function searchIndex(indexName: string, query: string, options: Record<string, unknown> = {}) {
  if (!isMeiliSearchAvailable) {
    return { hits: [], query, processingTimeMs: 0 };
  }

  try {
    const index = meiliClient.index(indexName);
    const results = await index.search(query, options);
    return results;
  } catch (error) {
    log.error('Search index error', error as Error, { indexName, query });
    return { hits: [], query, processingTimeMs: 0 };
  }
}

// Extract text from TipTap JSON content
function extractTextFromContent(content: TiptapContent): string {
  if (!content || !content.content) return '';

  let text = '';

  function extractFromNode(node: TiptapNode) {
    if (node.text) {
      text += node.text + ' ';
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(extractFromNode);
    }
  }

  if (Array.isArray(content.content)) {
    content.content.forEach(extractFromNode);
  }

  return text.trim();
}

// Sync all existing data to MeiliSearch (for initial setup)
export async function syncAllToSearch() {
  if (!isMeiliSearchAvailable) {
    log.warn('MeiliSearch is not available. Cannot sync data.');
    return;
  }

  try {
    log.info('Syncing all data to MeiliSearch...', { batchSize: SEARCH_SYNC_BATCH_SIZE });

    const documentsSynced = await syncDocumentsInBatches();
    const tasksSynced = await syncTasksInBatches();
    const workspacesSynced = await syncWorkspacesInBatches();

    log.info('Sync completed', {
      documentsCount: documentsSynced,
      tasksCount: tasksSynced,
      workspacesCount: workspacesSynced
    });
  } catch (error) {
    log.error('Failed to sync data to MeiliSearch', error as Error);
    throw error;
  }
}

async function syncDocumentsInBatches(): Promise<number> {
  const documentsIndex = meiliClient.index(INDEXES.documents);

  return syncInBatches(
    (offset, limit) =>
      db
        .select({
          id: documents.id,
          title: documents.title,
          content: documents.content,
          workspaceId: documents.workspaceId,
          icon: documents.icon,
          isArchived: documents.isArchived,
          isPublished: documents.isPublished,
          updatedAt: documents.updatedAt
        })
        .from(documents)
        .orderBy(documents.createdAt)
        .limit(limit)
        .offset(offset),
    async (batch) => {
      const payload = batch.map((doc) => ({
        id: doc.id,
        title: doc.title,
        content:
          doc.content && typeof doc.content === 'object'
            ? extractTextFromContent(doc.content as TiptapContent)
            : '',
        workspaceId: doc.workspaceId,
        icon: doc.icon,
        isArchived: doc.isArchived,
        isPublished: doc.isPublished,
        updatedAt: doc.updatedAt
      }));

      if (payload.length > 0) {
        await documentsIndex.addDocuments(payload);
      }
    }
  );
}

async function syncTasksInBatches(): Promise<number> {
  const tasksIndex = meiliClient.index(INDEXES.tasks);

  return syncInBatches(
    (offset, limit) =>
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          assigneeId: tasks.assigneeId,
          dueDate: tasks.dueDate,
          tags: tasks.tags,
          workspaceId: tasks.workspaceId,
          updatedAt: tasks.updatedAt
        })
        .from(tasks)
        .orderBy(tasks.createdAt)
        .limit(limit)
        .offset(offset),
    async (batch) => {
      const payload = batch.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeId: task.assigneeId,
        dueDate: task.dueDate,
        tags: (task.tags as string[] | null) || [],
        workspaceId: task.workspaceId,
        updatedAt: task.updatedAt
      }));

      if (payload.length > 0) {
        await tasksIndex.addDocuments(payload);
      }
    }
  );
}

async function syncWorkspacesInBatches(): Promise<number> {
  const workspacesIndex = meiliClient.index(INDEXES.workspaces);

  return syncInBatches(
    (offset, limit) =>
      db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          description: workspaces.description,
          slug: workspaces.slug,
          createdBy: workspaces.createdBy,
          createdAt: workspaces.createdAt,
          updatedAt: workspaces.updatedAt
        })
        .from(workspaces)
        .orderBy(workspaces.createdAt)
        .limit(limit)
        .offset(offset),
    async (batch) => {
      if (batch.length === 0) {
        return;
      }
      await workspacesIndex.addDocuments(batch);
    }
  );
}

async function syncInBatches<T>(
  fetchBatch: (offset: number, limit: number) => Promise<T[]>,
  handleBatch: (batch: T[]) => Promise<void>
): Promise<number> {
  let offset = 0;
  let total = 0;
  let batchNumber = 0;

  while (true) {
    const rows = await fetchBatch(offset, SEARCH_SYNC_BATCH_SIZE);
    if (rows.length === 0) {
      break;
    }

    batchNumber += 1;
    await handleBatch(rows);
    total += rows.length;
    offset += rows.length;

    log.debug('MeiliSearch batch synced', {
      batchNumber,
      batchSize: rows.length,
      totalSynced: total
    });
  }

  return total;
}

// Get search stats
export async function getSearchStats() {
  if (!isMeiliSearchAvailable) {
    return null;
  }

  try {
    const stats = await meiliClient.getStats();
    return stats;
  } catch (error) {
    log.error('Failed to get search stats', error as Error);
    return null;
  }
}