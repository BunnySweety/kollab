/**
 * Script to initialize Garage storage
 * 
 * This script creates the bucket and sets up basic configuration for Garage.
 * Run this after starting Garage for the first time.
 * 
 * Usage: tsx src/scripts/init-garage.ts
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
async function runGarageCommand(command: string, useAdminApi: boolean = false, silent: boolean = false): Promise<{ stdout: string; stderr: string }> {
  try {
    const inDocker = await isGarageInDocker();
    let fullCommand: string;
    let execOptions: { env?: Record<string, string> } = {};

    if (inDocker) {
      // Garage is in Docker, use docker exec
      // For admin commands, use the admin API endpoint via -e flag
      // For S3 commands, use the S3 endpoint and credentials
      const envFlags: string[] = [];
      
      if (useAdminApi) {
        // Admin API uses the config file, but we can specify endpoint if needed
        // Actually, admin commands don't need GARAGE_ENDPOINT, they use the config file
        // But we can set it if we want to override
        envFlags.push(`-e GARAGE_ENDPOINT=http://localhost:3903`);
      } else {
        // S3 API commands need endpoint and credentials
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
      if (!silent) {
        log.debug('Running Garage command in Docker', { command, container: GARAGE_CONTAINER, useAdminApi });
      }
    } else {
      // Garage CLI is installed locally
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
      if (!silent) {
        log.debug('Running Garage command locally', { command, useAdminApi });
      }
    }

    const { stdout, stderr } = await execAsync(fullCommand, execOptions);
    
    // Log stderr if present (for debugging)
    if (stderr && stderr.trim() && !silent) {
      log.debug('Garage command stderr', { stderr: stderr.trim(), command });
    }
    
    return { stdout, stderr };
  } catch (error: unknown) {
    // Extract error message from stderr if available
    const errorObj = error as { stderr?: string; message?: string };
    const errorMessage = errorObj.stderr || errorObj.message || 'Unknown error';
    const errorStr = errorMessage.toString().toLowerCase();
    
    // Check if this is a "not ready" error (non-critical)
    const isNotReadyError = errorStr.includes('not ready') || 
                           errorStr.includes('layout not ready') ||
                           errorStr.includes('connection refused') ||
                           errorStr.includes('connection reset') ||
                           errorStr.includes('no such container');
    
    if (!silent) {
      if (isNotReadyError) {
        // Use warn instead of error for non-critical "not ready" errors
        log.warn('Garage command failed (service may not be ready yet)', { 
          command, 
          errorMessage: errorMessage.toString().substring(0, 200) 
        });
      } else {
        log.error('Garage command failed', error as Error, { 
          command, 
          errorMessage: errorMessage.toString().substring(0, 200) 
        });
      }
    }
    throw error;
  }
}

/**
 * Check if Garage layout is ready
 */
async function checkLayoutReady(): Promise<boolean> {
  try {
    // Check layout status - if version is 0 or no nodes have roles, layout is not ready
    const { stdout } = await runGarageCommand('layout show', true);
    
    // Check if layout is initialized (version > 0 and nodes have roles)
    if (stdout.includes('Current cluster layout version: 0') || 
        stdout.includes('No nodes currently have a role')) {
      return false;
    }
    
    // Check if there's at least one node with a role assigned
    const hasAssignedNodes = stdout.includes('Zone') || stdout.includes('Capacity');
    return hasAssignedNodes;
  } catch (error: unknown) {
    const errorObj = error as { stderr?: string; message?: string };
    const errorMsg = errorObj.stderr || errorObj.message || '';
    if (errorMsg.includes('Layout not ready') || errorMsg.includes('not ready')) {
      return false;
    }
    // If we can't check layout, assume it's not ready
    return false;
  }
}

/**
 * Initialize Garage layout (required before creating buckets/keys)
 */
async function initializeLayout(): Promise<void> {
  try {
    log.info('Initializing Garage layout...');
    
    // Get the node ID from status
    const { stdout: statusOutput } = await runGarageCommand('status', true);
    log.debug('Garage status', { output: statusOutput });
    
    // Extract node ID from status output
    // Format: ID                Hostname      Address          Tags  Zone  Capacity          DataAvail  Version
    //         dec020334cb01abb  3da4c947d492  172.18.0.5:3901              NO ROLE ASSIGNED             v2.1.0
    // Note: Output may contain log messages before the actual status table
    const lines = statusOutput.split('\n');
    let nodeId: string | null = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) {
        continue;
      }
      
      // Skip log messages (lines starting with timestamps or INFO/WARN/ERROR)
      if (/^\d{4}-\d{2}-\d{2}T/.test(trimmedLine) || 
          /^(INFO|WARN|ERROR|DEBUG)/.test(trimmedLine) ||
          trimmedLine.startsWith('====')) {
        continue;
      }
      
      // Skip header lines
      if (trimmedLine.includes('ID') && trimmedLine.includes('Hostname')) {
        continue;
      }
      
      // Match node ID pattern: 16 hex characters (may have leading whitespace from log messages)
      const match = trimmedLine.match(/^([a-f0-9]{16})\s+/);
      if (match && match[1]) {
        nodeId = match[1];
        break;
      }
    }
    
    if (!nodeId) {
      throw new Error('Could not extract node ID from Garage status');
    }
    
    log.info('Found node ID', { nodeId });
    
    try {
      // Assign the node to a zone (dc1) with capacity 1024 bytes (minimum required)
      log.info('Assigning layout roles...');
      await runGarageCommand(`layout assign -z dc1 -c 1024 ${nodeId}`, true);
      
      log.info('Applying layout...');
      await runGarageCommand('layout apply --version 1', true);
      
      // Wait a bit for layout to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify layout is now ready
      const layoutReady = await checkLayoutReady();
      if (!layoutReady) {
        throw new Error('Layout was applied but is still not ready');
      }
      
      log.info('Garage layout initialized successfully');
    } catch (layoutError: unknown) {
      // Layout might already be initialized, check if we can proceed
      const errorObj = layoutError as { stderr?: string; message?: string };
      const errorMsg = errorObj.stderr || errorObj.message || '';
      if (errorMsg.includes('already') || errorMsg.includes('exists') || errorMsg.includes('already assigned')) {
        log.info('Layout already initialized, verifying...');
        // Verify it's actually ready
        const layoutReady = await checkLayoutReady();
        if (!layoutReady) {
          throw new Error('Layout appears initialized but is not ready');
        }
        return;
      }
      throw layoutError;
    }
  } catch (error) {
    log.error('Failed to initialize layout', error as Error);
    throw error;
  }
}

async function checkOrCreateAccessKey(): Promise<boolean> {
  if (!GARAGE_ACCESS_KEY_ID || !GARAGE_SECRET_ACCESS_KEY) {
    log.error('Access key ID and secret key must be provided');
    return false;
  }

  // First, check if the key exists in Garage (via Admin API)
  // Use silent mode to avoid logging expected errors when key doesn't exist
  try {
    await runGarageCommand(`key info ${GARAGE_ACCESS_KEY_ID}`, true, true);
    log.info('Access key exists in Garage');
    
    // Also verify it works for S3 operations
    try {
      await runGarageCommand('bucket list');
      log.info('Access key is valid and working');
      return true;
    } catch (s3Error: unknown) {
      const errorObj = s3Error as { stderr?: string; message?: string };
      const s3ErrorMsg = errorObj.stderr || errorObj.message || '';
      if (s3ErrorMsg.includes('Layout not ready') || s3ErrorMsg.includes('not ready')) {
        log.warn('Layout not ready, but key exists in Garage');
        return true; // Key exists, just layout issue
      }
      log.warn('Key exists in Garage but S3 operations failed', { error: s3ErrorMsg.substring(0, 200) });
      return true; // Key exists, might be a temporary issue
    }
  } catch (_infoError: unknown) {
    // Key doesn't exist in Garage, need to import it
    log.info('Access key does not exist in Garage, importing...');
    
    try {
      // Test if credentials work for S3 (they might be valid but not imported)
      try {
        await runGarageCommand('bucket list');
        log.info('Credentials work for S3, but key not registered in Garage');
      } catch (s3Error: unknown) {
        const errorObj = s3Error as { stderr?: string; message?: string };
        const s3ErrorMsg = errorObj.stderr || errorObj.message || '';
        if (s3ErrorMsg.includes('Layout not ready') || s3ErrorMsg.includes('not ready')) {
          log.warn('Layout not ready, will import key anyway');
        } else {
          log.warn('Credentials may not work for S3, but will try to import key');
        }
      }
      
      // Import the key
      log.info('Importing access key into Garage...');
      const importKeyCommand = `key import --yes -n "kollab-dev" ${GARAGE_ACCESS_KEY_ID} ${GARAGE_SECRET_ACCESS_KEY}`;
      await runGarageCommand(importKeyCommand, true);
      log.info('Access key imported successfully');
      return true;
    } catch (importError: unknown) {
      const errorObj = importError as { stderr?: string; message?: string };
      const importErrorMsg = errorObj.stderr || errorObj.message || '';
      log.error('Failed to import access key', importError as Error, { 
        errorMessage: importErrorMsg.substring(0, 200) 
      });
      
      log.error('Please create the access key manually:');
      log.error('1. Run: docker exec kollab-garage /garage key create -n "kollab-dev"');
      log.error('2. Or import existing key: docker exec kollab-garage /garage key import --yes -n "kollab-dev" <key-id> <secret-key>');
      log.error('3. Update GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY in .env with the created key');
      return false;
    }
  }
}

export async function initGarage() {
  // If credentials are provided, try to use them or create them
  if (GARAGE_ACCESS_KEY_ID && GARAGE_SECRET_ACCESS_KEY) {
    log.info('Using provided Garage credentials...');
  } else {
    const error = new Error('Garage credentials are required. Please set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY environment variables.');
    log.error('Garage credentials are required. Please set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY environment variables.');
    log.error('You can create them manually using: garage key new --name "kollab-dev"');
    throw error;
  }

  log.info('Initializing Garage storage...', { endpoint: GARAGE_ENDPOINT, bucket: GARAGE_BUCKET });

  try {
    // Check if Garage is accessible
    log.info('Checking Garage connection...');
    try {
      // Try to ping Garage using a simple HTTP request
      const response = await fetch(`${GARAGE_ENDPOINT}/`, { 
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      if (response.status === 403 || response.status === 200 || response.status === 404) {
        // Any response means Garage is running
        log.info('Garage is accessible');
      }
    } catch (error) {
      // Check if this is a timeout or connection error (Garage not ready yet)
      const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const isConnectionError = errorMsg.includes('timeout') || 
                                errorMsg.includes('connection refused') ||
                                errorMsg.includes('econnrefused') ||
                                errorMsg.includes('fetch failed');
      
      if (isConnectionError) {
        const err = new Error('Garage is not accessible yet. It may still be starting up. You can initialize Garage later with: npm run db:init-garage');
        log.warn('Garage is not accessible yet. It may still be starting up.', { 
          endpoint: GARAGE_ENDPOINT,
          suggestion: 'You can initialize Garage later with: npm run db:init-garage'
        });
        throw err;
      } else {
        const err = new Error('Garage is not accessible. Make sure Garage is running and GARAGE_ENDPOINT is correct.');
        log.error('Garage is not accessible. Make sure Garage is running and GARAGE_ENDPOINT is correct.', error as Error);
        throw err;
      }
    }

    // Check if layout is ready, initialize if needed
    log.info('Checking Garage layout...');
    let layoutReady = await checkLayoutReady();
    if (!layoutReady) {
      log.info('Layout not ready, initializing...');
      await initializeLayout();
      
      // Wait a bit for layout to be applied and verify it's ready
      log.info('Waiting for layout to be applied...');
      let retries = 5;
      while (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        layoutReady = await checkLayoutReady();
        if (layoutReady) {
          log.info('Layout is now ready');
          break;
        }
        retries--;
        if (retries > 0) {
          log.debug(`Layout not ready yet, retrying... (${retries} attempts left)`);
        }
      }
      
      if (!layoutReady) {
        throw new Error('Layout initialization completed but layout is still not ready after retries');
      }
    } else {
      log.info('Layout is ready');
    }

    // Check or create access key
    const keyValid = await checkOrCreateAccessKey();
    if (!keyValid) {
      log.warn('Access key validation failed. Continuing anyway - uploads may fail until key is created.');
    }

    // Check if bucket exists
    log.info(`Checking if bucket '${GARAGE_BUCKET}' exists...`);
    try {
      const { stdout } = await runGarageCommand(`bucket info ${GARAGE_BUCKET}`);
      log.info(`Bucket '${GARAGE_BUCKET}' already exists`);
      log.info('Bucket info:', { info: stdout });
    } catch (_error) {
      // Bucket doesn't exist, create it
      log.info(`Bucket '${GARAGE_BUCKET}' does not exist. Creating...`);
      await runGarageCommand(`bucket create ${GARAGE_BUCKET}`);
      log.info(`Bucket '${GARAGE_BUCKET}' created successfully`);
    }

    // Allow access key to read and write to the bucket
    // You can customize this based on your security requirements
    if (GARAGE_ACCESS_KEY_ID) {
      log.info('Setting bucket permissions...');
      try {
        await runGarageCommand(`bucket allow --read --write ${GARAGE_BUCKET} --key ${GARAGE_ACCESS_KEY_ID}`);
        log.info('Bucket permissions set');
      } catch (error) {
        log.warn('Could not set bucket permissions. This may require manual configuration.', { error });
      }
    } else {
      log.warn('No access key ID provided, skipping bucket permissions configuration');
    }

    log.info('Garage initialization completed successfully!');
    log.info('Next steps:');
    log.info('1. Configure CORS if needed for direct client uploads');
    log.info('2. Set up proper access keys for production');
    log.info('3. Configure bucket policies based on your security requirements');
  } catch (error) {
    // Check if this is a "not ready" error (non-critical)
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const isNotReadyError = errorMsg.includes('not accessible yet') ||
                           errorMsg.includes('not ready') ||
                           errorMsg.includes('still be starting') ||
                           errorMsg.includes('connection refused') ||
                           errorMsg.includes('connection reset') ||
                           errorMsg.includes('timeout') ||
                           errorMsg.includes('econnrefused') ||
                           errorMsg.includes('fetch failed');
    
    if (isNotReadyError) {
      // Use warn instead of error for non-critical "not ready" errors
      log.warn('Garage initialization failed (service may not be ready yet)', {
        error: error instanceof Error ? error.message : String(error),
        suggestion: 'You can initialize Garage later with: npm run db:init-garage'
      });
    } else {
      log.error('Failed to initialize Garage', error as Error);
    }
    throw error;
  }
}

// Run initialization if script is executed directly (not imported)
// Check if this file is being run directly
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
                     process.argv[1]?.includes('init-garage.ts') ||
                     process.argv[1]?.includes('init-garage.js');

if (isMainModule) {
  initGarage().catch((error) => {
    // Check if this is a "not ready" error (non-critical)
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const isNotReadyError = errorMsg.includes('not accessible yet') ||
                           errorMsg.includes('not ready') ||
                           errorMsg.includes('still be starting') ||
                           errorMsg.includes('connection refused') ||
                           errorMsg.includes('connection reset') ||
                           errorMsg.includes('timeout') ||
                           errorMsg.includes('econnrefused') ||
                           errorMsg.includes('fetch failed');
    
    if (isNotReadyError) {
      // Use warn instead of error for non-critical "not ready" errors
      log.warn('Garage initialization skipped (service not ready yet)', {
        error: error instanceof Error ? error.message : String(error),
        suggestion: 'You can initialize Garage later with: npm run db:init-garage'
      });
      process.exit(0); // Exit successfully, not as an error
    } else {
      log.error('Unhandled error during Garage initialization', error as Error);
      process.exit(1);
    }
  });
}

