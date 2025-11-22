import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function verifyDatabaseData() {
  const sql = postgres(connectionString as string, { max: 1 });

  try {
    console.log('Vérification des données des databases...\n');

    // Get all databases
    const databases = await sql<Array<{
      id: string;
      name: string;
      properties: unknown;
      views: unknown;
      workspace_id: string;
    }>>`
      SELECT id, name, properties, views, workspace_id
      FROM database_schemas
      ORDER BY created_at DESC
      LIMIT 10
    `;

    console.log(`Trouvé ${databases.length} database(s)\n`);

    for (const db of databases) {
      console.log(`📊 Database: ${db.name} (${db.id})`);
      console.log(`   Workspace: ${db.workspace_id}`);
      
      // Check properties
      if (db.properties && typeof db.properties === 'object' && db.properties !== null) {
        const properties = db.properties as Record<string, { type?: string; name?: string }>;
        const propertyKeys = Object.keys(properties);
        console.log(`   ✅ Properties: ${propertyKeys.length} colonne(s)`);
        propertyKeys.forEach(key => {
          const prop = properties[key];
          console.log(`      - ${key}: ${prop?.type || 'unknown'} (${prop?.name || key})`);
        });
      } else {
        console.log(`   ❌ Properties: manquant ou invalide`);
      }

      // Check views
      if (db.views && Array.isArray(db.views)) {
        const views = db.views as Array<{ type?: string; name?: string; order?: string[] }>;
        const columnOrderView = views.find((v) => v.type === '_columnOrder');
        const regularViews = views.filter((v) => v.type && !v.type.startsWith('_'));
        
        console.log(`   ✅ Views: ${regularViews.length} vue(s) visible(s)`);
        regularViews.forEach((v) => {
          console.log(`      - ${v.type}: ${v.name || v.type}`);
        });
        
        if (columnOrderView && columnOrderView.order) {
          console.log(`   ✅ Ordre des colonnes sauvegardé: ${columnOrderView.order.length} colonne(s)`);
          console.log(`      Ordre: ${columnOrderView.order.join(' → ')}`);
        } else {
          console.log(`   ⚠️  Ordre des colonnes non sauvegardé`);
        }
      } else {
        console.log(`   ❌ Views: manquant ou invalide`);
      }

      // Check entries
      const entries = await sql<Array<{ id: string; data: unknown }>>`
        SELECT id, data
        FROM database_entries
        WHERE schema_id = ${db.id}
        LIMIT 5
      `;

      console.log(`   ✅ Entries: ${entries.length} entrée(s) trouvée(s)`);
      if (entries.length > 0) {
        entries.forEach((entry, idx) => {
          const data = entry.data as Record<string, unknown> | null;
          const dataKeys = data ? Object.keys(data) : [];
          console.log(`      Entrée ${idx + 1}: ${dataKeys.length} propriété(s)`);
        });
      }

      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('Vérification terminée');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

verifyDatabaseData();

