import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
  process.env.ENCRYPTION_KEY || 'default-secret-key-at-least-32-chars-long'
);

export async function signToken(payload: { id: string; username: string }): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // Session valid for 24 hours
    .sign(SECRET_KEY);
}

export async function verifyToken(token: string): Promise<{ id: string; username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload as { id: string; username: string };
  } catch (error) {
    console.error('[JWT Verification] Failed:', error);
    return null;
  }
}
