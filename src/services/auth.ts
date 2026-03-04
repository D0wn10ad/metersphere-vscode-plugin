import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate signature for MeterSphere API authentication
 * Format: AESEncrypt(accessKey|uuid|timestamp, secretKey, accessKey)
 */
export function generateSignature(accessKey: string, secretKey: string): string {
  const timestamp = Date.now();
  const uuid = uuidv4();
  const payload = `${accessKey}|${uuid}|${timestamp}`;
  
  try {
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = crypto.createHash('sha256').update(accessKey).digest().slice(0, 16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let signature = cipher.update(payload, 'utf8', 'hex');
    signature += cipher.final('hex');
    return signature;
  } catch (error) {
    throw new Error(`Failed to generate signature: ${error}`);
  }
}

/**
 * Build authentication headers for MeterSphere API
 */
export function buildAuthHeaders(accessKey: string, secretKey: string): Record<string, string> {
  return {
    'accessKey': accessKey,
    'signature': generateSignature(accessKey, secretKey)
  };
}
