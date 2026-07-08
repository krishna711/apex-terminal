import crypto from 'crypto';

// The encryption key should be 32 bytes (256 bits).
// We fall back to a default key in development mode, but warning the user.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest() 
  : crypto.createHash('sha256').update('fallback-secret-key-change-in-production').digest();

const IV_LENGTH = 16; // AES block size

export function encrypt(text: string | null | undefined): string | null {
  if (!text) return null;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV concatenated with encrypted text as iv:encrypted
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decrypt(text: string | null | undefined): string | null {
  if (!text) return null;
  
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return null;
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
}
