/**
 * Script to test Garage upload functionality
 * 
 * Usage: tsx src/scripts/test-garage-upload.ts
 */

import { uploadFile } from '../lib/storage';
import { log } from '../lib/logger';

async function testGarageUpload() {
  log.info('Testing Garage upload...');

  try {
    // Create a test file (simple text file)
    const testContent = Buffer.from('Test file content for Garage upload');
    const testKey = `test/upload-test-${Date.now()}.txt`;
    const contentType = 'text/plain';

    log.info('Uploading test file...', { key: testKey, contentType });

    const fileUrl = await uploadFile(testContent, testKey, contentType);

    log.info('Upload successful!', { fileUrl });

    // Verify the file exists by trying to access it via the proxy endpoint
    const response = await fetch(fileUrl);
    if (response.ok) {
      const content = await response.text();
      log.info('File verification successful', { 
        url: fileUrl, 
        contentLength: content.length 
      });
      console.log('✅ Garage upload test PASSED');
      console.log(`   File URL (proxy): ${fileUrl}`);
      console.log(`   Content: ${content.substring(0, 50)}...`);
      console.log(`   Content-Type: ${response.headers.get('Content-Type')}`);
      console.log(`   Cache-Control: ${response.headers.get('Cache-Control')}`);
    } else {
      log.warn('File uploaded but not accessible', { 
        url: fileUrl, 
        status: response.status 
      });
      console.log('⚠️  Garage upload test PARTIAL');
      console.log(`   File uploaded but not accessible: ${response.status}`);
    }
  } catch (error) {
    log.error('Garage upload test failed', error as Error);
    console.error('❌ Garage upload test FAILED');
    console.error('   Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run test
testGarageUpload().catch((error) => {
  log.error('Unhandled error during Garage upload test', error as Error);
  process.exit(1);
});

