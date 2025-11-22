import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { log } from './logger';

// Garage/S3 configuration
// Use localhost in development (when API runs outside Docker), garage in Docker
const GARAGE_ENDPOINT = process.env.GARAGE_ENDPOINT || (process.env.NODE_ENV === 'production' ? 'http://garage:3900' : 'http://localhost:3900');
// Garage credentials - MUST be set via environment variables in production
const GARAGE_ACCESS_KEY_ID = process.env.GARAGE_ACCESS_KEY_ID;
const GARAGE_SECRET_ACCESS_KEY = process.env.GARAGE_SECRET_ACCESS_KEY;
const GARAGE_BUCKET = process.env.GARAGE_BUCKET || 'kollab';
const GARAGE_REGION = process.env.GARAGE_REGION || 'garage';

// Validate required Garage credentials
if (!GARAGE_ACCESS_KEY_ID || !GARAGE_SECRET_ACCESS_KEY) {
  log.warn('Garage credentials not configured. File upload features will be disabled.');
  log.warn('Please set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY environment variables.');
}

// Initialize S3 client for Garage
const s3Client = GARAGE_ACCESS_KEY_ID && GARAGE_SECRET_ACCESS_KEY
  ? new S3Client({
      endpoint: GARAGE_ENDPOINT,
      region: GARAGE_REGION,
      credentials: {
        accessKeyId: GARAGE_ACCESS_KEY_ID,
        secretAccessKey: GARAGE_SECRET_ACCESS_KEY
      },
      forcePathStyle: true // Required for Garage
    })
  : null;

/**
 * Upload a file to Garage/S3
 * @param file Buffer or Uint8Array of the file
 * @param key S3 object key (path)
 * @param contentType MIME type of the file
 * @returns URL of the uploaded file
 */
export async function uploadFile(
  file: Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  if (!s3Client) {
    throw new Error('Garage is not configured. Please set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY.');
  }

  try {
    const command = new PutObjectCommand({
      Bucket: GARAGE_BUCKET,
      Key: key,
      Body: file,
      ContentType: contentType
    });

    await s3Client.send(command);

    // Return a permanent proxy URL instead of presigned URL
    // This URL will never expire and uses the backend to serve the file
    const publicUrl = process.env.PUBLIC_API_URL || process.env.FRONTEND_URL?.replace(':3000', ':4000') || 'http://localhost:4000';
    const proxyUrl = `${publicUrl}/api/upload/file/${encodeURIComponent(key)}`;
    
    log.info('File uploaded to Garage', { key, contentType, bucket: GARAGE_BUCKET, url: proxyUrl });
    return proxyUrl;
  } catch (error) {
    // Type guard for AWS SDK errors
    const awsError = error as Error & {
      $metadata?: { httpStatusCode?: number };
      code?: string;
    };
    
    const errorDetails = {
      key,
      contentType,
      bucket: GARAGE_BUCKET,
      endpoint: GARAGE_ENDPOINT,
      hasCredentials: !!(GARAGE_ACCESS_KEY_ID && GARAGE_SECRET_ACCESS_KEY),
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : undefined,
      errorCode: awsError?.$metadata?.httpStatusCode || awsError?.code
    };
    log.error('Failed to upload file to Garage', error as Error, errorDetails);
    throw error;
  }
}

/**
 * Generate a presigned URL for uploading (for direct client uploads)
 * @param key S3 object key
 * @param contentType MIME type
 * @param expiresIn Expiration time in seconds (default: 1 hour)
 * @returns Presigned URL
 */
export async function generateUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!s3Client) {
    throw new Error('Garage is not configured. Please set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY.');
  }

  try {
    const command = new PutObjectCommand({
      Bucket: GARAGE_BUCKET,
      Key: key,
      ContentType: contentType
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    log.info('Generated presigned upload URL', { key, contentType, expiresIn });
    return url;
  } catch (error) {
    log.error('Failed to generate presigned upload URL', error as Error, { key, contentType });
    throw error;
  }
}

/**
 * Generate a presigned URL for downloading
 * @param key S3 object key
 * @param expiresIn Expiration time in seconds (default: 1 hour)
 * @returns Presigned URL
 */
export async function generateDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!s3Client) {
    throw new Error('Garage is not configured. Please set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY.');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: GARAGE_BUCKET,
      Key: key
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    log.info('Generated presigned download URL', { key, expiresIn });
    return url;
  } catch (error) {
    log.error('Failed to generate presigned download URL', error as Error, { key });
    throw error;
  }
}

/**
 * Delete a file from Garage/S3
 * @param key S3 object key
 */
export async function deleteFile(key: string): Promise<void> {
  if (!s3Client) {
    throw new Error('Garage is not configured. Please set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY.');
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: GARAGE_BUCKET,
      Key: key
    });

    await s3Client.send(command);
    log.info('File deleted from Garage', { key, bucket: GARAGE_BUCKET });
  } catch (error) {
    log.error('Failed to delete file from Garage', error as Error, { key });
    throw error;
  }
}

/**
 * Get a file stream from Garage/S3
 * @param key S3 object key
 * @returns Readable stream of the file
 */
export async function getFileStream(key: string): Promise<{ stream: Readable; contentType?: string; contentLength?: number }> {
  if (!s3Client) {
    throw new Error('Garage is not configured. Please set GARAGE_ACCESS_KEY_ID and GARAGE_SECRET_ACCESS_KEY.');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: GARAGE_BUCKET,
      Key: key
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      throw new Error('No body in response');
    }

    // Convert the body to a Node.js Readable stream
    // AWS SDK v3 returns a ReadableStream, but Hono needs a Node.js stream
    const body = response.Body as Readable | ReadableStream<Uint8Array> | unknown;
    const stream = body instanceof Readable 
      ? body 
      : Readable.fromWeb(body as ReadableStream<Uint8Array>);
    
    const contentType = response.ContentType;
    const contentLength = response.ContentLength;

    log.info('File stream retrieved from Garage', { key, contentType, contentLength });
    return { stream, contentType, contentLength };
  } catch (error) {
    log.error('Failed to get file stream from Garage', error as Error, { key });
    throw error;
  }
}

/**
 * Extract S3 key from a Garage URL
 * @param url Full Garage URL
 * @returns S3 key
 */
export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // Remove leading bucket name from path
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 1) {
      return pathParts.slice(1).join('/');
    }
    return pathParts[0] || null;
  } catch {
    // If URL parsing fails, try to extract key manually
    const match = url.match(/\/[^/]+\/(.+)$/);
    return match && match[1] ? match[1] : null;
  }
}

