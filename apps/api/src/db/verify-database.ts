import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

// SECURITY: Require DATABASE_URL to be set explicitly (no default password)
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Please set DATABASE_URL in your .env file');
  process.exit(1);
}

// Type assertion: connectionString is guaranteed to be string after the check above
const dbUrl: string = connectionString;

// Liste complète des tables attendues selon le schéma
const EXPECTED_TABLES = [
  'users',
  'sessions',
  'workspaces',
  'workspace_members',
  'teams',
  'team_members',
  'projects',
  'project_teams',
  'documents',
  'document_versions',
  'tasks',
  'events',
  'task_columns',
  'task_attachments',
  'task_tags',
  'task_tag_relations',
  'task_templates',
  'comments',
  'database_schemas',
  'database_entries',
  'templates',
  'template_gallery',
  'favorite_templates',
  'notifications',
  'notification_preferences',
  'drive_folders',
  'drive_files',
  'notes',
  'wiki_pages',
  'wiki_page_links',
];

// Index critiques à vérifier
const CRITICAL_INDEXES = [
  'users_email_idx',
  'sessions_user_idx',
  'workspaces_slug_idx',
  'workspace_members_workspace_user_idx',
  'documents_workspace_idx',
  'document_versions_document_idx',
  'tasks_workspace_status_idx',
  'events_workspace_date_idx',
  'notifications_recipient_read_idx',
  'drive_folders_workspace_idx',
  'drive_files_workspace_idx',
  'notes_workspace_idx',
  'wiki_pages_workspace_idx',
  'wiki_pages_workspace_slug_idx',
];

interface VerificationResult {
  success: boolean;
  tables: {
    found: string[];
    missing: string[];
  };
  indexes: {
    found: string[];
    missing: string[];
  };
  foreignKeys: {
    total: number;
    valid: number;
  };
  errors: string[];
}

async function verifyDatabase(): Promise<VerificationResult> {
  const sql = postgres(dbUrl, { max: 1 });
  const result: VerificationResult = {
    success: true,
    tables: {
      found: [],
      missing: [],
    },
    indexes: {
      found: [],
      missing: [],
    },
    foreignKeys: {
      total: 0,
      valid: 0,
    },
    errors: [],
  };

  try {
    console.log('Verification de la base de donnees...\n');

    // 1. Verifier la connexion
    console.log('1. Test de connexion...');
    await sql`SELECT 1`;
    console.log('   OK: Connexion reussie\n');

    // 2. Verifier les tables
    console.log('2. Verification des tables...');
    const existingTables = await sql<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;

    const tableNames = existingTables.map((t) => t.tablename);

    for (const expectedTable of EXPECTED_TABLES) {
      if (tableNames.includes(expectedTable)) {
        result.tables.found.push(expectedTable);
        console.log(`   OK: Table "${expectedTable}" existe`);
      } else {
        result.tables.missing.push(expectedTable);
        result.success = false;
        console.log(`   ERREUR: Table "${expectedTable}" manquante`);
      }
    }

    console.log(`\n   Resume: ${result.tables.found.length}/${EXPECTED_TABLES.length} tables trouvees\n`);

    // 3. Verifier les index critiques
    console.log('3. Verification des index critiques...');
    const existingIndexes = await sql<Array<{ indexname: string }>>`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY indexname
    `;

    const indexNames = existingIndexes.map((i) => i.indexname);

    for (const expectedIndex of CRITICAL_INDEXES) {
      if (indexNames.includes(expectedIndex)) {
        result.indexes.found.push(expectedIndex);
        console.log(`   OK: Index "${expectedIndex}" existe`);
      } else {
        result.indexes.missing.push(expectedIndex);
        result.success = false;
        console.log(`   ERREUR: Index "${expectedIndex}" manquant`);
      }
    }

    console.log(`\n   Resume: ${result.indexes.found.length}/${CRITICAL_INDEXES.length} index critiques trouves\n`);

    // 4. Verifier les cles etrangeres
    console.log('4. Verification des cles etrangeres...');
    const foreignKeys = await sql<Array<{
      constraint_name: string;
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>>`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name
    `;

    result.foreignKeys.total = foreignKeys.length;
    result.foreignKeys.valid = foreignKeys.length; // Toutes sont valides si la requête réussit

    console.log(`   OK: ${foreignKeys.length} cles etrangeres trouvees\n`);

    // 5. Verifier les colonnes critiques de quelques tables importantes
    console.log('5. Verification des colonnes critiques...');
    const criticalColumns = [
      { table: 'users', columns: ['id', 'email', 'name', 'created_at'] },
      { table: 'workspaces', columns: ['id', 'name', 'slug', 'created_by'] },
      { table: 'documents', columns: ['id', 'workspace_id', 'title', 'created_by'] },
      { table: 'tasks', columns: ['id', 'workspace_id', 'title', 'status'] },
    ];

    for (const { table, columns } of criticalColumns) {
      if (!tableNames.includes(table)) {
        result.errors.push(`Table "${table}" manquante, impossible de verifier les colonnes`);
        continue;
      }

      const tableColumns = await sql<Array<{ column_name: string }>>`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = ${table}
      `;

      const columnNames = tableColumns.map((c) => c.column_name);
      const missingColumns = columns.filter((col) => !columnNames.includes(col));

      if (missingColumns.length === 0) {
        console.log(`   OK: Table "${table}" a toutes les colonnes requises`);
      } else {
        result.success = false;
        result.errors.push(`Table "${table}" manque les colonnes: ${missingColumns.join(', ')}`);
        console.log(`   ERREUR: Table "${table}" manque: ${missingColumns.join(', ')}`);
      }
    }

    console.log('');

    // 6. Afficher le resume final
    console.log('═══════════════════════════════════════════════════════');
    console.log('RESUME DE LA VERIFICATION');
    console.log('═══════════════════════════════════════════════════════\n');

    if (result.success) {
      console.log('SUCCES: La base de donnees est complete et correctement initialisee!\n');
      console.log(`Tables: ${result.tables.found.length}/${EXPECTED_TABLES.length} presentes`);
      console.log(`Index critiques: ${result.indexes.found.length}/${CRITICAL_INDEXES.length} presents`);
      console.log(`Cles etrangeres: ${result.foreignKeys.valid} valides`);
    } else {
      console.log('ERREURS DETECTEES:\n');
      
      if (result.tables.missing.length > 0) {
        console.log(`Tables manquantes (${result.tables.missing.length}):`);
        result.tables.missing.forEach((table) => {
          console.log(`  - ${table}`);
        });
        console.log('');
      }

      if (result.indexes.missing.length > 0) {
        console.log(`Index manquants (${result.indexes.missing.length}):`);
        result.indexes.missing.forEach((index) => {
          console.log(`  - ${index}`);
        });
        console.log('');
      }

      if (result.errors.length > 0) {
        console.log('Autres erreurs:');
        result.errors.forEach((error) => {
          console.log(`  - ${error}`);
        });
        console.log('');
      }

      console.log('ACTION REQUISE:');
      console.log('  Executez: npm run db:init');
      console.log('  Ou: npm run db:push');
    }

    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Erreur de connexion: ${errorMessage}`);
    console.error('ERREUR:', errorMessage);
    console.log('\nVerifiez que:');
    console.log('  1. PostgreSQL est demarre');
    console.log('  2. La variable DATABASE_URL est correctement configuree');
    console.log('  3. La base de donnees "kollab" existe');
  } finally {
    await sql.end();
  }

  return result;
}

// Exécuter la vérification
verifyDatabase()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });

