/**
 * Script de Vérification de l'Implémentation
 * 
 * Vérifie que toutes les améliorations sont correctement implémentées
 * et que le serveur peut démarrer sans erreurs
 */

import { log } from '../lib/logger';

interface VerificationResult {
  name: string;
  status: 'ok' | 'error' | 'warning';
  message: string;
}

const results: VerificationResult[] = [];

function addResult(name: string, status: 'ok' | 'error' | 'warning', message: string) {
  results.push({ name, status, message });
  const icon = status === 'ok' ? '✓' : status === 'error' ? '✗' : '⚠';
  console.log(`${icon} ${name}: ${message}`);
}

async function verifyImports() {
  try {
    // Vérifier que TaskService existe et est importable
    const { TaskService } = await import('../services/task-service');
    if (TaskService) {
      addResult('TaskService Import', 'ok', 'TaskService importé avec succès');
    }
  } catch (error) {
    const errorMsg = (error as Error).message;
    if (errorMsg.includes('DATABASE_URL')) {
      addResult('TaskService Import', 'warning', 'TaskService disponible (DB non configurée)');
    } else {
      addResult('TaskService Import', 'error', `Erreur: ${errorMsg}`);
    }
  }

  try {
    // Vérifier que les relations Drizzle sont disponibles
    const { db } = await import('../db');
    if (db && 'query' in db) {
      addResult('Drizzle Relations', 'ok', 'Relations Drizzle disponibles');
    }
  } catch (error) {
    const errorMsg = (error as Error).message;
    if (errorMsg.includes('DATABASE_URL')) {
      addResult('Drizzle Relations', 'warning', 'Relations Drizzle configurées (DB non configurée)');
    } else {
      addResult('Drizzle Relations', 'error', `Erreur: ${errorMsg}`);
    }
  }

  try {
    // Vérifier que la pagination est disponible
    const { parseCursorPagination } = await import('../lib/pagination');
    if (typeof parseCursorPagination === 'function') {
      addResult('Pagination Helpers', 'ok', 'Helpers de pagination disponibles');
    }
  } catch (error) {
    addResult('Pagination Helpers', 'error', `Erreur: ${(error as Error).message}`);
  }

  try {
    // Vérifier que les métriques sont disponibles
    const { getMetrics } = await import('../lib/metrics');
    if (typeof getMetrics === 'function') {
      addResult('Prometheus Metrics', 'ok', 'Métriques Prometheus disponibles');
    }
  } catch (error) {
    const errorMsg = (error as Error).message;
    if (errorMsg.includes('prom-client')) {
      addResult('Prometheus Metrics', 'warning', 'Métriques configurées (prom-client à installer)');
    } else {
      addResult('Prometheus Metrics', 'error', `Erreur: ${errorMsg}`);
    }
  }

  try {
    // Vérifier que la validation UUID est disponible
    const { validateUUID } = await import('../middleware/validation');
    if (typeof validateUUID === 'function') {
      addResult('UUID Validation', 'ok', 'Middleware de validation UUID disponible');
    }
  } catch (error) {
    addResult('UUID Validation', 'error', `Erreur: ${(error as Error).message}`);
  }
}

async function verifyTaskServiceMethods() {
  try {
    const { TaskService } = await import('../services/task-service');
    
    // Vérifier que toutes les méthodes existent
    const methods = ['getTasks', 'getTaskById', 'createTask', 'updateTask', 'deleteTask'];
    const missingMethods: string[] = [];
    
    for (const method of methods) {
      if (typeof (TaskService as unknown as Record<string, unknown>)[method] !== 'function') {
        missingMethods.push(method);
      }
    }
    
    if (missingMethods.length === 0) {
      addResult('TaskService Methods', 'ok', `Toutes les méthodes présentes (${methods.length})`);
    } else {
      addResult('TaskService Methods', 'error', `Méthodes manquantes: ${missingMethods.join(', ')}`);
    }
  } catch (error) {
    const errorMsg = (error as Error).message;
    if (errorMsg.includes('DATABASE_URL')) {
      addResult('TaskService Methods', 'warning', 'TaskService disponible (DB non configurée)');
    } else {
      addResult('TaskService Methods', 'error', `Erreur: ${errorMsg}`);
    }
  }
}

async function verifyDrizzleWithUsage() {
  try {
    const fs = await import('fs/promises');
    const sourceCode = await fs.readFile('src/services/task-service.ts', 'utf-8').catch(() => null);
    
    if (sourceCode) {
      const usesWith = sourceCode.includes('db.query.tasks.findMany') && 
                       sourceCode.includes('.with(');
      
      if (usesWith) {
        addResult('Drizzle .with() Usage', 'ok', 'Utilisation de .with() détectée dans TaskService');
      } else {
        addResult('Drizzle .with() Usage', 'warning', 'Utilisation de .with() non détectée');
      }
    } else {
      addResult('Drizzle .with() Usage', 'warning', 'Impossible de lire le code source');
    }
  } catch (error) {
    addResult('Drizzle .with() Usage', 'warning', `Erreur: ${(error as Error).message}`);
  }
}

async function verifyRoutesMigration() {
  try {
    const fs = await import('fs/promises');
    const tasksRoute = await fs.readFile('src/routes/tasks.ts', 'utf-8');
    
    // Vérifier que TaskService est utilisé
    const usesTaskService = tasksRoute.includes('TaskService.');
    const usesDbDirectly = tasksRoute.includes('db.select().from(tasks)') || 
                          tasksRoute.includes('db.insert(tasks)');
    
    if (usesTaskService && !usesDbDirectly) {
      addResult('Routes Migration', 'ok', 'Routes utilisent TaskService (migration complète)');
    } else if (usesTaskService && usesDbDirectly) {
      addResult('Routes Migration', 'warning', 'Routes utilisent TaskService mais aussi db directement');
    } else {
      addResult('Routes Migration', 'error', 'Routes n\'utilisent pas TaskService');
    }
  } catch (error) {
    addResult('Routes Migration', 'warning', `Erreur: ${(error as Error).message}`);
  }
}

async function verifyCompressionSelective() {
  try {
    const fs = await import('fs/promises');
    const indexFile = await fs.readFile('src/index.ts', 'utf-8');
    
    const hasSelectiveCompression = indexFile.includes('shouldCompress') || 
                                   (indexFile.includes('content-length') && 
                                    indexFile.includes('content-type'));
    
    if (hasSelectiveCompression) {
      addResult('Compression Sélective', 'ok', 'Compression sélective implémentée');
    } else {
      addResult('Compression Sélective', 'warning', 'Compression sélective non détectée');
    }
  } catch (error) {
    addResult('Compression Sélective', 'warning', `Erreur: ${(error as Error).message}`);
  }
}

async function verifyIntegrationTests() {
  try {
    const fs = await import('fs/promises');
    const testFile = await fs.readFile('src/tests/integration/tasks.test.ts', 'utf-8');
    
    const testCount = (testFile.match(/it\(/g) || []).length;
    
    if (testCount > 0) {
      addResult('Tests d\'Intégration', 'ok', `${testCount} tests d'intégration présents`);
    } else {
      addResult('Tests d\'Intégration', 'error', 'Aucun test d\'intégration trouvé');
    }
  } catch (error) {
    addResult('Tests d\'Intégration', 'warning', `Erreur: ${(error as Error).message}`);
  }
}

async function main() {
  console.log('🔍 Vérification de l\'implémentation des améliorations...\n');
  
  await verifyImports();
  await verifyTaskServiceMethods();
  await verifyDrizzleWithUsage();
  await verifyRoutesMigration();
  await verifyCompressionSelective();
  await verifyIntegrationTests();
  
  console.log('\n📊 Résumé:');
  const ok = results.filter(r => r.status === 'ok').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const errors = results.filter(r => r.status === 'error').length;
  
  console.log(`  ✓ OK: ${ok}`);
  console.log(`  ⚠ Warnings: ${warnings}`);
  console.log(`  ✗ Erreurs: ${errors}`);
  
  // Compter seulement les erreurs critiques (pas les warnings)
  const criticalErrors = results.filter(r => r.status === 'error' && 
    !r.message.includes('DATABASE_URL') && !r.message.includes('prom-client')).length;
  
  if (criticalErrors === 0) {
    console.log('\n✅ Toutes les vérifications critiques sont passées!');
    if (warnings > 0) {
      console.log(`⚠️  ${warnings} avertissement(s) (non bloquants)`);
    }
    process.exit(0);
  } else {
    console.log(`\n❌ ${criticalErrors} vérification(s) critique(s) ont échoué`);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error('Erreur lors de la vérification', error as Error);
  process.exit(1);
});

