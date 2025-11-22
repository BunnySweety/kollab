import { hash } from '@node-rs/argon2';
import { db } from './index.js';
import { users, workspaces, workspaceMembers } from './schema.js';
import { eq } from 'drizzle-orm';

/**
 * Seed demo user for testing and demo purposes
 */
async function seedDemoUser() {
  console.log('🌱 Seeding demo user...');

  const demoEmail = process.env.DEMO_USER_EMAIL || 'demo@kollab.app';
  const demoPassword = process.env.DEMO_USER_PASSWORD || 'Demo123456!';
  const demoName = process.env.DEMO_USER_NAME || 'Demo User';

  try {
    // Check if demo user already exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, demoEmail))
      .limit(1);

    if (existingUser.length > 0) {
      console.log('✅ Demo user already exists');
      return;
    }

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

    const newUser = newUserResult[0];
    if (!newUser) {
      throw new Error('Failed to create demo user');
    }

    console.log(`✅ Demo user created: ${newUser.email}`);

    // Create demo workspace
    const workspaceName = process.env.DEMO_WORKSPACE_NAME || `${demoName}'s Workspace`;
    const workspaceSlug = process.env.DEMO_WORKSPACE_SLUG || `demo-workspace-${Date.now()}`;
    const workspaceDescription = process.env.DEMO_WORKSPACE_DESCRIPTION || 'Demo workspace for testing Kollab';
    
    const workspaceResult = await db.insert(workspaces).values({
      name: workspaceName,
      slug: workspaceSlug,
      description: workspaceDescription,
      createdBy: newUser.id
    }).returning();

    const workspace = workspaceResult[0];
    if (!workspace) {
      throw new Error('Failed to create demo workspace');
    }

    console.log(`✅ Demo workspace created: ${workspace.name}`);

    // Add user as owner of workspace
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: newUser.id,
      role: 'owner'
    });

    console.log('✅ Demo user added as workspace owner');
    console.log('\n🎉 Demo user seeding completed!');
    console.log(`\n📧 Email: ${demoEmail}`);
    // SECURITY: Don't print password in production
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔑 Password: ${demoPassword}`);
    } else {
      console.log(`🔑 Password: (check your .env file)`);
    }

  } catch (error) {
    console.error('❌ Error seeding demo user:', error);
    throw error;
  }

  process.exit(0);
}

seedDemoUser();
