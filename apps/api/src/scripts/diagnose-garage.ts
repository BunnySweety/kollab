/**
 * Script de diagnostic pour Garage
 * 
 * Ce script vérifie l'état de Garage et identifie les problèmes potentiels.
 * 
 * Usage: tsx src/scripts/diagnose-garage.ts
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { log } from '../lib/logger';

const execAsync = promisify(exec);

const GARAGE_ENDPOINT = process.env.GARAGE_ENDPOINT || 'http://localhost:3900';
const GARAGE_ACCESS_KEY_ID = process.env.GARAGE_ACCESS_KEY_ID;
const GARAGE_SECRET_ACCESS_KEY = process.env.GARAGE_SECRET_ACCESS_KEY;
const GARAGE_BUCKET = process.env.GARAGE_BUCKET || 'kollab';
const GARAGE_CONTAINER = process.env.GARAGE_CONTAINER || 'kollab-garage';

/**
 * Check if Garage is running in Docker
 */
async function isGarageInDocker(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`docker ps --filter name=${GARAGE_CONTAINER} --format "{{.Names}}"`);
    return stdout.trim() === GARAGE_CONTAINER;
  } catch {
    return false;
  }
}

/**
 * Run a Garage command, using Docker exec if Garage is in a container
 */
async function runGarageCommand(command: string, useAdminApi: boolean = false): Promise<{ stdout: string; stderr: string }> {
  try {
    const inDocker = await isGarageInDocker();
    let fullCommand: string;
    let execOptions: { env?: Record<string, string> } = {};

    if (inDocker) {
      const envFlags: string[] = [];
      
      if (useAdminApi) {
        envFlags.push(`-e GARAGE_ENDPOINT=http://localhost:3903`);
      } else {
        const endpoint = GARAGE_ENDPOINT?.replace('localhost:3900', 'localhost:3900') || 'http://localhost:3900';
        envFlags.push(`-e GARAGE_ENDPOINT=${endpoint}`);
        
        if (GARAGE_ACCESS_KEY_ID) {
          envFlags.push(`-e GARAGE_ACCESS_KEY_ID=${GARAGE_ACCESS_KEY_ID}`);
        }
        if (GARAGE_SECRET_ACCESS_KEY) {
          envFlags.push(`-e GARAGE_SECRET_ACCESS_KEY=${GARAGE_SECRET_ACCESS_KEY}`);
        }
      }
      
      const envFlagsStr = envFlags.join(' ');
      fullCommand = `docker exec ${envFlagsStr} ${GARAGE_CONTAINER} /garage ${command}`;
    } else {
      const env: Record<string, string | undefined> = {
        ...process.env
      };
      
      if (useAdminApi) {
        const adminEndpoint = GARAGE_ENDPOINT?.replace(':3900', ':3903') || 'http://localhost:3903';
        env.GARAGE_ENDPOINT = adminEndpoint;
      } else {
        if (GARAGE_ENDPOINT) {
          env.GARAGE_ENDPOINT = GARAGE_ENDPOINT;
        }
        if (GARAGE_ACCESS_KEY_ID) {
          env.GARAGE_ACCESS_KEY_ID = GARAGE_ACCESS_KEY_ID;
        }
        if (GARAGE_SECRET_ACCESS_KEY) {
          env.GARAGE_SECRET_ACCESS_KEY = GARAGE_SECRET_ACCESS_KEY;
        }
      }
      
      execOptions = { env: env as Record<string, string> };
      fullCommand = `garage ${command}`;
    }

    const { stdout, stderr } = await execAsync(fullCommand, execOptions);
    return { stdout, stderr };
  } catch (error: unknown) {
    const errorObj = error as { stderr?: string; message?: string };
    const errorMessage = errorObj.stderr || errorObj.message || 'Unknown error';
    throw new Error(`Garage command failed: ${errorMessage.toString().substring(0, 200)}`);
  }
}

async function diagnoseGarage() {
  log.info('=== Diagnostic Garage ===');
  log.info('');

  // 1. Vérifier les variables d'environnement
  log.info('1. Vérification des variables d\'environnement...');
  if (!GARAGE_ACCESS_KEY_ID || !GARAGE_SECRET_ACCESS_KEY) {
    log.error('   ❌ GARAGE_ACCESS_KEY_ID ou GARAGE_SECRET_ACCESS_KEY manquants');
    return;
  } else {
    log.info('   ✅ Variables d\'environnement configurées');
    log.info(`      Endpoint: ${GARAGE_ENDPOINT}`);
    log.info(`      Bucket: ${GARAGE_BUCKET}`);
    log.info(`      Access Key ID: ${GARAGE_ACCESS_KEY_ID.substring(0, 10)}...`);
  }
  log.info('');

  // 2. Vérifier l'accessibilité HTTP
  log.info('2. Vérification de l\'accessibilité HTTP...');
  try {
    const response = await fetch(`${GARAGE_ENDPOINT}/`);
    if (response.status === 403 || response.status === 200 || response.status === 404) {
      log.info('   ✅ Garage est accessible via HTTP');
    } else {
      log.warn(`   ⚠️  Réponse HTTP inattendue: ${response.status}`);
    }
  } catch (error) {
    log.error('   ❌ Garage n\'est pas accessible via HTTP', error as Error);
    return;
  }
  log.info('');

  // 3. Vérifier le conteneur Docker
  log.info('3. Vérification du conteneur Docker...');
  const inDocker = await isGarageInDocker();
  if (inDocker) {
    log.info(`   ✅ Conteneur ${GARAGE_CONTAINER} est en cours d'exécution`);
  } else {
    log.warn('   ⚠️  Garage ne semble pas être dans Docker (peut être installé localement)');
  }
  log.info('');

  // 4. Vérifier le statut Garage
  log.info('4. Vérification du statut Garage...');
  try {
    const { stdout } = await runGarageCommand('status', true);
    log.info('   ✅ Statut Garage:');
    log.info(stdout);
  } catch (error) {
    log.error('   ❌ Impossible d\'obtenir le statut Garage', error as Error);
    return;
  }
  log.info('');

  // 5. Vérifier le layout
  log.info('5. Vérification du layout...');
  try {
    const { stdout } = await runGarageCommand('layout show', true);
    log.info('   ✅ Layout Garage:');
    log.info(stdout);
    
    // Vérifier si le layout est prêt
    if (stdout.includes('Current cluster layout version: 0')) {
      log.error('   ❌ Layout version est 0 - layout non initialisé');
    } else if (stdout.includes('No nodes currently have a role')) {
      log.error('   ❌ Aucun nœud n\'a de rôle assigné');
    } else {
      log.info('   ✅ Layout semble prêt');
    }
  } catch (error) {
    log.error('   ❌ Impossible d\'obtenir le layout', error as Error);
    return;
  }
  log.info('');

  // 6. Vérifier la clé d'accès
  log.info('6. Vérification de la clé d\'accès...');
  try {
    const { stdout } = await runGarageCommand(`key info ${GARAGE_ACCESS_KEY_ID}`, true);
    log.info('   ✅ Clé d\'accès existe:');
    log.info(stdout);
  } catch (error) {
    log.error('   ❌ Clé d\'accès non trouvée ou invalide', error as Error);
    log.info('   💡 Essayez d\'importer la clé:');
    log.info(`      docker exec ${GARAGE_CONTAINER} /garage key import --yes -n "kollab-dev" ${GARAGE_ACCESS_KEY_ID} ${GARAGE_SECRET_ACCESS_KEY}`);
  }
  log.info('');

  // 7. Vérifier le bucket
  log.info('7. Vérification du bucket...');
  try {
    const { stdout } = await runGarageCommand(`bucket info ${GARAGE_BUCKET}`);
    log.info(`   ✅ Bucket '${GARAGE_BUCKET}' existe:`);
    log.info(stdout);
  } catch (error) {
    log.error(`   ❌ Bucket '${GARAGE_BUCKET}' n'existe pas`, error as Error);
    log.info('   💡 Créez le bucket avec:');
    log.info(`      docker exec -e GARAGE_ENDPOINT=${GARAGE_ENDPOINT} -e GARAGE_ACCESS_KEY_ID=${GARAGE_ACCESS_KEY_ID} -e GARAGE_SECRET_ACCESS_KEY=${GARAGE_SECRET_ACCESS_KEY} ${GARAGE_CONTAINER} /garage bucket create ${GARAGE_BUCKET}`);
  }
  log.info('');

  // 8. Tester les opérations S3
  log.info('8. Test des opérations S3...');
  try {
    const { stdout } = await runGarageCommand('bucket list');
    log.info('   ✅ Opérations S3 fonctionnent:');
    log.info(stdout);
  } catch (error) {
    log.error('   ❌ Opérations S3 échouent', error as Error);
    const errorMsg = (error as Error).message;
    if (errorMsg.includes('Layout not ready')) {
      log.error('   ❌ Layout n\'est pas prêt - initialisez le layout d\'abord');
    } else if (errorMsg.includes('InvalidAccessKeyId')) {
      log.error('   ❌ Clé d\'accès invalide');
    } else if (errorMsg.includes('SignatureDoesNotMatch')) {
      log.error('   ❌ Signature invalide - vérifiez GARAGE_SECRET_ACCESS_KEY');
    }
  }
  log.info('');

  log.info('=== Diagnostic terminé ===');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
    process.argv[1]?.includes('diagnose-garage')) {
  diagnoseGarage().catch((error) => {
    log.error('Erreur lors du diagnostic', error as Error);
    process.exit(1);
  });
}

export { diagnoseGarage };

