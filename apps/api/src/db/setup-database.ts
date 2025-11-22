/**
 * Complete database setup script
 * This script initializes the database and seeds demo data in one go
 * 
 * Usage: npm run db:setup
 */

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function setupDatabase() {
  console.log('🚀 Starting complete database setup...\n');

  // SECURITY: Validate required environment variables
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.error('   Please set DATABASE_URL in your .env file');
    console.error('   Example: DATABASE_URL=postgresql://user:password@localhost:5432/database');
    process.exit(1);
  }

  try {
    // Step 1: Initialize database schema
    console.log('📊 Step 1: Initializing database schema...');
    const { initDatabase } = await import('./init-database.js');
    await initDatabase();
    console.log('✅ Database schema initialized\n');

    // Step 2: Initialize Garage storage (optional, but recommended)
    if (process.env.GARAGE_ACCESS_KEY_ID && process.env.GARAGE_SECRET_ACCESS_KEY) {
      console.log('📦 Step 2: Initializing Garage storage...');
      try {
        const { initGarage } = await import('../scripts/init-garage.js');
        await initGarage();
        console.log('✅ Garage storage initialized\n');
      } catch (error) {
        // Check if this is a "not ready" error
        const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        const isNotReadyError = errorMsg.includes('not accessible yet') || 
                                errorMsg.includes('not ready') ||
                                errorMsg.includes('still be starting');
        
        if (isNotReadyError) {
          console.warn('⚠️  Warning: Garage is not ready yet (still starting up)');
          console.warn('   This is normal if Garage was just started');
          console.warn('   Garage will continue starting in the background');
          console.warn('   You can initialize Garage later with: npm run db:init-garage\n');
        } else {
          console.warn('⚠️  Warning: Garage initialization failed (uploads may not work)');
          if (error instanceof Error) {
            console.warn(`   ${error.message}`);
          }
          console.warn('   You can initialize Garage later with: npm run db:init-garage\n');
        }
      }
    } else {
      console.log('⏭️  Step 2: Skipping Garage initialization (credentials not provided)\n');
    }

    // Step 3: Seed demo data (which now creates user if needed)
    if (process.env.ENABLE_DEMO_MODE === 'true') {
      console.log('🌱 Step 3: Seeding demo data...');
      const { seedDemoData } = await import('../scripts/seed-demo-data.js');
      await seedDemoData();
      console.log('✅ Demo data seeded\n');
    } else {
      console.log('⏭️  Step 3: Skipping demo data (ENABLE_DEMO_MODE is not true)\n');
    }

    console.log('🎉 Database setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ All tables created');
    console.log('   ✅ All indexes created');
    if (process.env.GARAGE_ACCESS_KEY_ID && process.env.GARAGE_SECRET_ACCESS_KEY) {
      console.log('   ✅ Garage storage initialized');
    }
    if (process.env.ENABLE_DEMO_MODE === 'true') {
      console.log('   ✅ Demo user created');
      console.log('   ✅ Demo workspace created');
      console.log('   ✅ Demo tasks, tags, and columns created');
      // DEMO MODE: Default credentials (no configuration needed)
      console.log(`\n📧 Demo credentials:`);
      console.log(`   Email: demo@kollab.app`);
      // SECURITY: Don't print password in production
      if (process.env.NODE_ENV === 'development') {
        console.log(`   Password: Demo123456!`);
      } else {
        console.log(`   Password: (check documentation)`);
      }
    }
    console.log('\n✨ You can now start the API with: npm run dev\n');

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      if (error.stack && process.env.NODE_ENV === 'development') {
        console.error('   Stack:', error.stack);
      }
    }
    process.exit(1);
  }
}

// Run setup
setupDatabase();

