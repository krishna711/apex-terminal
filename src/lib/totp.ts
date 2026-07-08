import * as OTPAuth from 'otpauth';

/**
 * Generates the current 6-digit TOTP code for a given Base32 secret.
 */
export function generateTOTP(secret: string): string | null {
  if (!secret) return null;
  try {
    const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
    const totp = new OTPAuth.TOTP({
      issuer: 'BrokerApp',
      label: 'Broker',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(cleanSecret),
    });
    return totp.generate();
  } catch (error) {
    console.error('TOTP generation failed:', error);
    return null;
  }
}
