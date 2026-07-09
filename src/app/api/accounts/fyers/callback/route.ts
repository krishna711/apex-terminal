import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';

// Helper to get local midnight date
function getMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

export async function GET(request: Request) {
  let accountId = '';
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // State maps to accountId

    if (!code || !state) {
      console.error('[Fyers Callback] Missing code or state parameters');
      return NextResponse.redirect(new URL('/?error=Fyers login failed: Missing auth parameters.', request.url));
    }

    accountId = state;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      console.error(`[Fyers Callback] Account not found for ID: ${accountId}`);
      return NextResponse.redirect(new URL('/?error=Fyers login failed: Account record not found.', request.url));
    }

    const apiSecret = decrypt(account.apiSecret);
    if (!account.apiKey || !apiSecret) {
      console.error(`[Fyers Callback] API Key or Secret missing for account: ${account.name}`);
      return NextResponse.redirect(new URL('/?error=Fyers login failed: Account is missing App ID or Secret.', request.url));
    }

    // Generate SHA-256 hash of appId:appSecret
    const appIdHash = crypto
      .createHash('sha256')
      .update(`${account.apiKey}:${apiSecret}`)
      .digest('hex');

    console.log(`[Fyers Callback] Exchanging auth code for account: ${account.name}`);

    // Call Fyers validate-authcode endpoint
    const response = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: code,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.s !== 'ok' || !data.access_token) {
      console.error('[Fyers Callback] Token validation failed:', data);
      const errMsg = data.message || 'Token validation failed';
      return NextResponse.redirect(new URL(`/?error=Fyers login failed: ${encodeURIComponent(errMsg)}`, request.url));
    }

    // Save access token and set expiry to midnight
    const midnight = getMidnight();
    await prisma.account.update({
      where: { id: accountId },
      data: {
        accessToken: data.access_token,
        lastLogin: new Date(),
        tokenExpiredAt: midnight,
      },
    });

    console.log(`[Fyers Callback] Successfully authenticated Fyers account: ${account.name}`);
    return NextResponse.redirect(new URL(`/?success=Successfully logged into Fyers`, request.url));

  } catch (error: any) {
    console.error('[Fyers Callback] Process crashed:', error);
    return NextResponse.redirect(
      new URL(`/?error=Fyers login crashed: ${encodeURIComponent(error.message || 'Unknown error')}`, request.url)
    );
  }
}
