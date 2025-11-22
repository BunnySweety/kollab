import { hash } from '@node-rs/argon2';
import { db } from '../db/index.js';
import { users, workspaces, workspaceMembers, tasks, taskColumns, taskTags, taskTagRelations, databaseSchemas, databaseEntries } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { log } from '../lib/logger.js';
import { seedTemplates } from '../db/seed-templates.js';

/**
 * Seed demo data (tasks, columns, tags) for testing and demo purposes
 * This script creates mock data in the database when ENABLE_DEMO_MODE is true
 */
async function seedDemoData() {
  const enableDemoMode = process.env.ENABLE_DEMO_MODE === 'true';
  
  if (!enableDemoMode) {
    log.info('Demo mode is disabled. Set ENABLE_DEMO_MODE=true to enable.');
    return;
  }

  log.info('Seeding demo data...');

  try {
    // SECURITY: Validate required environment variables for demo mode
    if (!process.env.DATABASE_URL) {
      log.error('DATABASE_URL is required for seeding demo data');
      throw new Error('DATABASE_URL environment variable is required');
    }

    // DEMO MODE: Use default values - no configuration needed
    // All demo data uses sensible defaults when ENABLE_DEMO_MODE=true
    const demoEmail = 'demo@kollab.app';
    const demoPassword = 'Demo123456!';
    const demoName = 'Demo User';
    
    // SECURITY: Warn if using demo mode in production
    if (process.env.NODE_ENV === 'production') {
      log.warn('Demo mode is enabled in production environment');
      log.warn('This creates a demo user with default credentials');
      log.warn('Consider disabling ENABLE_DEMO_MODE in production');
    }
    
    let [demoUser] = await db.select()
      .from(users)
      .where(eq(users.email, demoEmail))
      .limit(1);

    if (!demoUser) {
      log.info('Demo user not found. Creating demo user...');
      
      // Hash password with OWASP recommended settings
      const hashedPassword = await hash(demoPassword, {
        memoryCost: 65536, // 64 MB
        timeCost: 3,
        outputLen: 32,
        parallelism: 4
      });

      // Create demo user
      const newUserResult = await db.insert(users).values({
        email: demoEmail,
        hashedPassword: hashedPassword,
        name: demoName,
        emailVerified: true
      }).returning();

      demoUser = newUserResult[0];
      if (!demoUser) {
        throw new Error('Failed to create demo user');
      }

      log.info('Demo user created', { email: demoUser.email });
    }

    // Find or create demo workspace
    let [demoWorkspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.createdBy, demoUser.id))
      .limit(1);

    if (!demoWorkspace) {
      // DEMO MODE: Use default values
      const workspaceName = 'Demo Workspace';
      const workspaceSlug = 'demo-workspace';
      const workspaceDescription = 'Demo workspace for testing Kollab';
      
      // Check if workspace with this slug already exists
      const [existingWorkspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.slug, workspaceSlug))
        .limit(1);
      
      if (existingWorkspace) {
        demoWorkspace = existingWorkspace;
        log.info('Using existing demo workspace', { workspaceId: demoWorkspace.id });
      } else {
        const workspaceResult = await db.insert(workspaces).values({
          name: workspaceName,
          slug: workspaceSlug,
          description: workspaceDescription,
          createdBy: demoUser.id
        }).returning();
        demoWorkspace = workspaceResult[0];
        
        if (!demoWorkspace) {
          throw new Error('Failed to create demo workspace');
        }

        // Add user as owner (check if membership already exists)
        const [existingMembership] = await db.select()
          .from(workspaceMembers)
          .where(and(
            eq(workspaceMembers.workspaceId, demoWorkspace.id),
            eq(workspaceMembers.userId, demoUser.id)
          ))
          .limit(1);
        
        if (!existingMembership) {
          await db.insert(workspaceMembers).values({
            workspaceId: demoWorkspace.id,
            userId: demoUser.id,
            role: 'owner'
          });
        }
        
        log.info('Demo workspace created', { workspaceId: demoWorkspace.id, name: demoWorkspace.name });
      }
    }

    log.info('Demo workspace found/created', { workspaceId: demoWorkspace.id });

    // Ensure default columns exist
    const existingColumns = await db.select()
      .from(taskColumns)
      .where(eq(taskColumns.workspaceId, demoWorkspace.id));

    // DEMO MODE: Use default columns (hardcoded)
    const defaultStatuses = [
      { statusId: 'todo', title: 'To Do', color: '#64748b', order: 0 },
      { statusId: 'in_progress', title: 'In Progress', color: '#3b82f6', order: 1 },
      { statusId: 'done', title: 'Done', color: '#10b981', order: 2 }
    ];

    for (const status of defaultStatuses) {
      const exists = existingColumns.some(col => col.statusId === status.statusId);
      if (!exists) {
        const [column] = await db.insert(taskColumns).values({
          workspaceId: demoWorkspace.id,
          title: status.title,
          color: status.color,
          order: status.order,
          statusId: status.statusId,
          createdBy: demoUser.id
        }).returning();
        if (column) {
          log.info('Created default column', { statusId: status.statusId, title: status.title });
        }
      } else {
        log.info('Default column already exists', { statusId: status.statusId, title: status.title });
      }
    }

    // Create demo tags
    // DEMO MODE: Use default tags (hardcoded)
    const demoTags = [
      { name: 'Design', color: '#ef4444' },
      { name: 'Development', color: '#3b82f6' },
      { name: 'Marketing', color: '#10b981' },
      { name: 'Backend', color: '#f59e0b' },
      { name: 'Frontend', color: '#8b5cf6' },
      { name: 'Documentation', color: '#06b6d4' }
    ];

    const createdTags: Array<typeof taskTags.$inferSelect> = [];
    for (const tagData of demoTags) {
      const existing = await db.select()
        .from(taskTags)
        .where(and(
          eq(taskTags.workspaceId, demoWorkspace.id),
          eq(taskTags.name, tagData.name)
        ))
        .limit(1);

      if (existing.length === 0) {
        const [tag] = await db.insert(taskTags).values({
          workspaceId: demoWorkspace.id,
          name: tagData.name,
          color: tagData.color,
          createdBy: demoUser.id
        }).returning();
        if (tag) {
          createdTags.push(tag);
          log.info('Created demo tag', { name: tag.name, color: tag.color });
        }
      } else {
        const existingTag = existing[0];
        if (existingTag) {
          createdTags.push(existingTag);
        }
      }
    }

    // Create demo tasks
    // DEMO MODE: Use default tasks (hardcoded)
    type DemoTask = {
      title: string;
      description: string;
      status: 'todo' | 'in_progress' | 'done' | 'cancelled';
      priority: 'low' | 'medium' | 'high' | 'urgent';
      dueDateDaysOffset?: number; // Days from now (positive = future, negative = past, null/undefined = no due date)
      tagNames: string[];
    };
    
    const demoTasksRaw: DemoTask[] = [
      {
        title: 'Design new landing page',
        description: 'Create mockups for the new marketing site',
        status: 'todo',
        priority: 'high',
        dueDateDaysOffset: 7,
        tagNames: ['Design', 'Marketing']
      },
      {
        title: 'Implement user authentication',
        description: 'Add OAuth providers and email auth',
        status: 'in_progress',
        priority: 'urgent',
        dueDateDaysOffset: 3,
        tagNames: ['Development', 'Backend']
      },
      {
        title: 'Write API documentation',
        description: 'Document all REST endpoints',
        status: 'in_progress',
        priority: 'medium',
        dueDateDaysOffset: 5,
        tagNames: ['Documentation', 'Backend']
      },
      {
        title: 'Setup CI/CD pipeline',
        description: 'Configure GitHub Actions for automated deployment',
        status: 'done',
        priority: 'high',
        dueDateDaysOffset: -2,
        tagNames: ['Development', 'Backend']
      },
      {
        title: 'Optimize database queries',
        description: 'Improve query performance and add indexes',
        status: 'todo',
        priority: 'medium',
        dueDateDaysOffset: 10,
        tagNames: ['Backend']
      },
      {
        title: 'Add dark mode support',
        description: 'Implement theme switching functionality',
        status: 'todo',
        priority: 'low',
        tagNames: ['Frontend']
      }
    ];

    // Convert raw tasks to format with Date objects
    const demoTasks = demoTasksRaw.map(task => ({
      title: task.title,
      description: task.description,
      status: task.status as 'todo' | 'in_progress' | 'done' | 'cancelled',
      priority: task.priority as 'low' | 'medium' | 'high' | 'urgent',
      dueDate: task.dueDateDaysOffset !== undefined && task.dueDateDaysOffset !== null
        ? new Date(Date.now() + task.dueDateDaysOffset * 24 * 60 * 60 * 1000)
        : null,
      tagNames: task.tagNames
    }));

    // Get existing tasks to avoid duplicates
    const existingTasks = await db.select()
      .from(tasks)
      .where(eq(tasks.workspaceId, demoWorkspace.id));

    const existingTitles = new Set(existingTasks.map(t => t.title));

    for (const taskData of demoTasks) {
      // Skip if task already exists
      if (existingTitles.has(taskData.title)) {
        log.info('Demo task already exists', { title: taskData.title });
        continue;
      }

      // Get status column
      const [statusColumn] = await db.select()
        .from(taskColumns)
        .where(and(
          eq(taskColumns.workspaceId, demoWorkspace.id),
          eq(taskColumns.statusId, taskData.status)
        ))
        .limit(1);

      if (!statusColumn) {
        log.warn('Status column not found', { status: taskData.status });
        continue;
      }

      // Create task
      const [task] = await db.insert(tasks).values({
        workspaceId: demoWorkspace.id,
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        priority: taskData.priority,
        dueDate: taskData.dueDate,
        createdBy: demoUser.id,
        order: existingTasks.length
      }).returning();

      if (!task) {
        log.warn('Failed to create demo task', { title: taskData.title });
        continue;
      }

      // Add tags
      for (const tagName of taskData.tagNames) {
        const tag = createdTags.find((t): t is typeof createdTags[0] => t?.name === tagName);
        if (tag) {
          await db.insert(taskTagRelations).values({
            taskId: task.id,
            tagId: tag.id
          });
        }
      }

      log.info('Created demo task', { 
        id: task.id, 
        title: task.title, 
        status: task.status,
        tags: taskData.tagNames.length 
      });
    }

    // Create demo databases for demo workspace
    await seedDemoDatabases(demoUser.id, demoWorkspace.id);
    
    // Also create databases for all other workspaces that don't have any databases yet
    // This ensures that if a user is in a different workspace, they still see demo data
    const allWorkspacesList = await db.select().from(workspaces);
    log.info('Checking other workspaces for databases', { 
      totalWorkspaces: allWorkspacesList.length,
      workspaceIds: allWorkspacesList.map(w => ({ id: w.id, name: w.name }))
    });
    
    // Create databases for ALL workspaces, even if they don't exist yet
    // This ensures that when a workspace is created, it will have demo databases
    // We'll create databases for any workspace that doesn't have any yet
    
    for (const workspace of allWorkspacesList) {
      if (workspace.id !== demoWorkspace.id) {
        log.info('Checking workspace for databases', { workspaceId: workspace.id, name: workspace.name });
        const existingDbs = await db.select()
          .from(databaseSchemas)
          .where(eq(databaseSchemas.workspaceId, workspace.id))
          .limit(1);
        
        log.info('Workspace database check result', { 
          workspaceId: workspace.id, 
          name: workspace.name,
          hasDatabases: existingDbs.length > 0,
          databaseCount: existingDbs.length
        });
        
        if (existingDbs.length === 0) {
          log.info('Creating demo databases for workspace', { workspaceId: workspace.id, name: workspace.name });
          await seedDemoDatabases(demoUser.id, workspace.id);
        } else {
          log.info('Workspace already has databases, skipping', { 
            workspaceId: workspace.id, 
            name: workspace.name,
            databaseCount: existingDbs.length 
          });
        }
      }
    }

    // Seed templates if not already seeded
    try {
      await seedTemplates();
      log.info('Templates seeding completed');
    } catch (error) {
      // Don't log as error if templates already exist - this is expected
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('already exist') || 
          errorMessage.includes('already exists') ||
          errorMessage.includes('constraint violation')) {
        log.info('Templates already exist, skipping seeding');
      } else {
        log.warn('Templates seeding encountered an issue', { 
          error: (error as Error).message,
          errorCode: (error as Error & { code?: string }).code,
          errorMessage: errorMessage.substring(0, 200)
        });
      }
      // Continue even if templates fail - templates are optional
    }

    log.info('Demo data seeding completed successfully');
  } catch (error) {
    log.error('Failed to seed demo data', error as Error);
    throw error;
  }
}

/**
 * Seed demo databases (Notion-like databases)
 */
async function seedDemoDatabases(userId: string, workspaceId: string) {
  log.info('Seeding demo databases...', { userId, workspaceId });

  // Check if databases already exist
  const existingDatabases = await db.select()
    .from(databaseSchemas)
    .where(eq(databaseSchemas.workspaceId, workspaceId));

  log.info('Existing databases check', { 
    workspaceId, 
    count: existingDatabases.length,
    names: existingDatabases.map(db => db.name)
  });

  if (existingDatabases.length > 0) {
    log.info('Demo databases already exist', { 
      workspaceId,
      count: existingDatabases.length,
      names: existingDatabases.map(db => db.name)
    });
    return;
  }

  // Customer Database
  const customerDbProperties = {
    'Name': { type: 'title', name: 'Name' },
    'Email': { type: 'email', name: 'Email' },
    'Status': { 
      type: 'select', 
      name: 'Status',
      options: ['Prospect', 'Lead', 'Customer', 'Churned']
    },
    'Value': { type: 'number', name: 'Value', format: 'currency' },
    'Last Contact': { type: 'date', name: 'Last Contact' },
    'Notes': { type: 'text', name: 'Notes' }
  };

  const customerDbResult = await db.insert(databaseSchemas).values({
    workspaceId,
    name: 'Customer Database',
    description: 'Track customer information and interactions',
    properties: customerDbProperties,
    views: [
      { type: 'table', name: 'All Customers' }
    ],
    createdBy: userId
  }).returning();

  const customerDb = customerDbResult[0];
  if (customerDb) {
    // Add sample entries
    const customerEntries = [
      {
        data: {
          'Name': 'Acme Corporation',
          'Email': 'contact@acme.com',
          'Status': 'Customer',
          'Value': 50000,
          'Last Contact': new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          'Notes': 'Enterprise client, annual contract'
        }
      },
      {
        data: {
          'Name': 'TechStart Inc',
          'Email': 'hello@techstart.io',
          'Status': 'Lead',
          'Value': 15000,
          'Last Contact': new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          'Notes': 'Interested in premium plan'
        }
      },
      {
        data: {
          'Name': 'Global Solutions',
          'Email': 'info@globalsolutions.com',
          'Status': 'Prospect',
          'Value': 0,
          'Last Contact': new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          'Notes': 'Initial contact made'
        }
      },
      {
        data: {
          'Name': 'Digital Agency',
          'Email': 'team@digitalagency.com',
          'Status': 'Customer',
          'Value': 30000,
          'Last Contact': new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          'Notes': 'Monthly subscription'
        }
      }
    ];

    for (const [i, entry] of customerEntries.entries()) {
      await db.insert(databaseEntries).values({
        schemaId: customerDb!.id,
        data: entry.data,
        order: i,
        createdBy: userId
      });
    }
    log.info('Created Customer Database with entries', { 
      databaseId: customerDb!.id,
      workspaceId,
      count: customerEntries.length 
    });
  }

  // Product Inventory Database
  const productDbProperties = {
    'Product Name': { type: 'title', name: 'Product Name' },
    'SKU': { type: 'text', name: 'SKU' },
    'Category': { 
      type: 'select', 
      name: 'Category',
      options: ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books']
    },
    'Price': { type: 'number', name: 'Price', format: 'currency' },
    'Stock': { type: 'number', name: 'Stock' },
    'Status': { 
      type: 'select', 
      name: 'Status',
      options: ['In Stock', 'Low Stock', 'Out of Stock', 'Discontinued']
    },
    'Last Restocked': { type: 'date', name: 'Last Restocked' }
  };

  const productDbResult = await db.insert(databaseSchemas).values({
    workspaceId,
    name: 'Product Inventory',
    description: 'Manage product stock and details',
    properties: productDbProperties,
    views: [
      { type: 'table', name: 'All Products' }
    ],
    createdBy: userId
  }).returning();

  const productDb = productDbResult[0];
  if (productDb) {
    const productEntries = [
      {
        data: {
          'Product Name': 'Wireless Headphones',
          'SKU': 'WH-001',
          'Category': 'Electronics',
          'Price': 79.99,
          'Stock': 45,
          'Status': 'In Stock',
          'Last Restocked': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        }
      },
      {
        data: {
          'Product Name': 'Running Shoes',
          'SKU': 'RS-205',
          'Category': 'Sports',
          'Price': 129.99,
          'Stock': 3,
          'Status': 'Low Stock',
          'Last Restocked': new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
        }
      },
      {
        data: {
          'Product Name': 'Coffee Maker',
          'SKU': 'CM-150',
          'Category': 'Home & Garden',
          'Price': 89.99,
          'Stock': 0,
          'Status': 'Out of Stock',
          'Last Restocked': new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      },
      {
        data: {
          'Product Name': 'Design Patterns Book',
          'SKU': 'BK-999',
          'Category': 'Books',
          'Price': 49.99,
          'Stock': 120,
          'Status': 'In Stock',
          'Last Restocked': new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    ];

    for (const [i, entry] of productEntries.entries()) {
      await db.insert(databaseEntries).values({
        schemaId: productDb!.id,
        data: entry.data,
        order: i,
        createdBy: userId
      });
    }
    log.info('Created Product Inventory Database with entries', { 
      databaseId: productDb!.id,
      workspaceId,
      count: productEntries.length 
    });
  }

  // Sales Pipeline Database
  const salesDbProperties = {
    'Deal Name': { type: 'title', name: 'Deal Name' },
    'Company': { type: 'text', name: 'Company' },
    'Stage': { 
      type: 'select', 
      name: 'Stage',
      options: ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']
    },
    'Value': { type: 'number', name: 'Value', format: 'currency' },
    'Probability': { type: 'number', name: 'Probability', format: 'percent' },
    'Expected Close': { type: 'date', name: 'Expected Close' },
    'Owner': { type: 'text', name: 'Owner' }
  };

  const salesDbResult = await db.insert(databaseSchemas).values({
    workspaceId,
    name: 'Sales Pipeline',
    description: 'Track deals and opportunities',
    properties: salesDbProperties,
    views: [
      { type: 'table', name: 'All Deals' }
    ],
    createdBy: userId
  }).returning();

  const salesDb = salesDbResult[0];
  if (salesDb) {
    const salesEntries = [
      {
        data: {
          'Deal Name': 'Enterprise License',
          'Company': 'Acme Corporation',
          'Stage': 'Negotiation',
          'Value': 50000,
          'Probability': 75,
          'Expected Close': new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          'Owner': 'Sales Team'
        }
      },
      {
        data: {
          'Deal Name': 'Startup Package',
          'Company': 'TechStart Inc',
          'Stage': 'Proposal',
          'Value': 15000,
          'Probability': 50,
          'Expected Close': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          'Owner': 'Sales Team'
        }
      },
      {
        data: {
          'Deal Name': 'SMB Subscription',
          'Company': 'Local Business',
          'Stage': 'Qualification',
          'Value': 5000,
          'Probability': 30,
          'Expected Close': new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
          'Owner': 'Sales Team'
        }
      },
      {
        data: {
          'Deal Name': 'Enterprise Renewal',
          'Company': 'Global Solutions',
          'Stage': 'Closed Won',
          'Value': 75000,
          'Probability': 100,
          'Expected Close': new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          'Owner': 'Account Manager'
        }
      }
    ];

    for (const [i, entry] of salesEntries.entries()) {
      await db.insert(databaseEntries).values({
        schemaId: salesDb!.id,
        data: entry.data,
        order: i,
        createdBy: userId
      });
    }
    log.info('Created Sales Pipeline Database with entries', { 
      databaseId: salesDb!.id,
      workspaceId,
      count: salesEntries.length 
    });
  }

  // Verify final count
  const finalDatabases = await db.select()
    .from(databaseSchemas)
    .where(eq(databaseSchemas.workspaceId, workspaceId));
  
  log.info('Demo databases seeding completed', { 
    workspaceId,
    totalDatabases: finalDatabases.length,
    databaseNames: finalDatabases.map(db => db.name)
  });
}

// Run if executed directly (check if this file is being run as a script)
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  seedDemoData()
    .then(() => {
      log.info('Demo data seeding script completed');
      process.exit(0);
    })
    .catch((error) => {
      log.error('Demo data seeding failed', error as Error);
      process.exit(1);
    });
}

export { seedDemoData };

