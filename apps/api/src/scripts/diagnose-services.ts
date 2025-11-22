/**
 * Diagnostic Script for Redis and MeiliSearch
 * 
 * Checks why Redis and MeiliSearch are not available
 */

import { log } from '../lib/logger';
import { connectRedis, pingRedis, isRedisAvailable, redisClient } from '../lib/redis';
import { checkMeiliSearchAvailability } from '../services/search';

async function diagnoseServices() {
  console.log('\n=== Diagnostic des Services ===\n');

  // 1. Vérifier les variables d'environnement
  console.log('1. Variables d\'environnement:');
  console.log('   REDIS_URL:', process.env.REDIS_URL || 'redis://localhost:6379 (défaut)');
  console.log('   MEILISEARCH_URL:', process.env.MEILISEARCH_URL || 'http://localhost:7700 (défaut)');
  console.log('   MEILISEARCH_MASTER_KEY:', process.env.MEILISEARCH_MASTER_KEY ? '***configuré***' : 'masterKey (défaut)');
  console.log('');

  // 2. Diagnostiquer Redis
  console.log('2. Diagnostic Redis:');
  try {
    console.log('   - État du client:', {
      isOpen: redisClient.isOpen,
      isReady: redisClient.isReady,
      isReadyState: redisClient.isReady ? 'ready' : 'not ready'
    });

    if (!redisClient.isOpen) {
      console.log('   ⚠️  Redis n\'est pas connecté, tentative de connexion...');
      await connectRedis();
    }

    const isAvailable = isRedisAvailable();
    console.log('   - Disponible:', isAvailable);

    if (isAvailable) {
      const pingResult = await pingRedis();
      console.log('   - Ping:', pingResult ? '✅ PONG' : '❌ Échec');
    } else {
      console.log('   ❌ Redis n\'est pas disponible');
      console.log('   Raisons possibles:');
      console.log('     - Redis n\'est pas démarré (docker-compose up redis)');
      console.log('     - REDIS_URL incorrect');
      console.log('     - Problème de réseau/firewall');
    }
  } catch (error) {
    console.log('   ❌ Erreur Redis:', (error as Error).message);
    console.log('   Stack:', (error as Error).stack);
  }
  console.log('');

  // 3. Diagnostiquer MeiliSearch
  console.log('3. Diagnostic MeiliSearch:');
  try {
    const isAvailable = await checkMeiliSearchAvailability();
    console.log('   - Disponible:', isAvailable ? '✅ Oui' : '❌ Non');

    if (!isAvailable) {
      console.log('   Raisons possibles:');
      console.log('     - MeiliSearch n\'est pas démarré (docker-compose up meilisearch)');
      console.log('     - MEILISEARCH_URL incorrect');
      console.log('     - MEILISEARCH_MASTER_KEY incorrect');
      console.log('     - Problème de réseau/firewall');
      console.log('     - Variables d\'environnement non configurées (service optionnel)');
    } else {
      console.log('   ✅ MeiliSearch est disponible');
    }
  } catch (error) {
    console.log('   ❌ Erreur MeiliSearch:', (error as Error).message);
    console.log('   Stack:', (error as Error).stack);
  }
  console.log('');

  // 4. Vérifier Docker
  console.log('4. Vérification Docker:');
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout: redisStatus } = await execAsync('docker ps --filter "name=kollab-redis" --format "{{.Status}}"');
      if (redisStatus.trim()) {
        console.log('   ✅ Redis container:', redisStatus.trim());
      } else {
        console.log('   ⚠️  Redis container non trouvé');
        console.log('   Solution: docker-compose up -d redis');
      }
    } catch {
      console.log('   ⚠️  Impossible de vérifier Redis container (Docker non disponible ou container non démarré)');
    }

    try {
      const { stdout: meiliStatus } = await execAsync('docker ps --filter "name=kollab-meilisearch" --format "{{.Status}}"');
      if (meiliStatus.trim()) {
        console.log('   ✅ MeiliSearch container:', meiliStatus.trim());
      } else {
        console.log('   ⚠️  MeiliSearch container non trouvé');
        console.log('   Solution: docker-compose up -d meilisearch');
      }
    } catch {
      console.log('   ⚠️  Impossible de vérifier MeiliSearch container (Docker non disponible ou container non démarré)');
    }
  } catch (error) {
    console.log('   ⚠️  Impossible de vérifier Docker:', (error as Error).message);
  }
  console.log('');

  // 5. Résumé et recommandations
  console.log('=== Résumé ===\n');
  
  const redisOk = isRedisAvailable();
  const meiliOk = await checkMeiliSearchAvailability();

  if (redisOk && meiliOk) {
    console.log('✅ Tous les services sont disponibles');
  } else {
    console.log('⚠️  Certains services ne sont pas disponibles:');
    if (!redisOk) {
      console.log('   - Redis: ❌ Indisponible');
      console.log('     → L\'application fonctionnera sans cache (performance réduite)');
      console.log('     → Pour activer: docker-compose up -d redis');
    }
    if (!meiliOk) {
      console.log('   - MeiliSearch: ❌ Indisponible');
      console.log('     → L\'application fonctionnera sans recherche (fonctionnalité désactivée)');
      console.log('     → Pour activer: docker-compose up -d meilisearch');
    }
    console.log('');
    console.log('💡 Note: Ces services sont optionnels. L\'application fonctionne sans eux.');
  }

  console.log('\n=== Fin du diagnostic ===\n');
}

diagnoseServices().catch(error => {
  log.error('Erreur lors du diagnostic', error as Error);
  process.exit(1);
});

