import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate signature for MeterSphere API authentication
 * Format: AESEncrypt(accessKey|uuid|timestamp, secretKey, accessKey)
 * 
 * Uses AES-128-CBC with:
 * - Key: raw bytes from secretKey (UTF-8), padded to 16 bytes
 * - IV: raw bytes from accessKey (UTF-8), padded to 16 bytes  
 * - Output: BASE64 encoded
 */
export function generateSignature(accessKey: string, secretKey: string): string {
  const timestamp = Date.now();
  const uuid = uuidv4();
  const payload = `${accessKey}|${uuid}|${timestamp}`;
  
  try {
    // Use raw UTF-8 bytes, pad to 16 bytes for AES-128
    let key = Buffer.from(secretKey, 'utf8');
    let iv = Buffer.from(accessKey, 'utf8');
    
    // Pad to 16 bytes if needed
    if (key.length < 16) {
      key = Buffer.concat([key, Buffer.alloc(16 - key.length)]);
    }
    if (iv.length < 16) {
      iv = Buffer.concat([iv, Buffer.alloc(16 - iv.length)]);
    }
    
    const cipher = crypto.createCipheriv('aes-128-cbc', key.slice(0, 16), iv.slice(0, 16));
    let signature = cipher.update(payload, 'utf8', 'base64');
    signature += cipher.final('base64');
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
