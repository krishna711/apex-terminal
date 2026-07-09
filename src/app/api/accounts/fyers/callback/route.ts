import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';

// Helper to get local midnight date
function getMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

// Helper to construct absolute redirect URLs utilizing proxy forwarding headers
function getAbsoluteRedirectUrl(path: string, request: Request): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || 
                (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}${path}`;
}

export async function GET(request: Request) {
  let accountId = '';
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // State maps to accountId

    if (!code || !state) {
      console.error('[Fyers Callback] Missing code or state parameters');
      return NextResponse.redirect(getAbsoluteRedirectUrl('/?error=Fyers login failed: Missing auth parameters.', request));
    }

    accountId = state;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      console.error(`[Fyers Callback] Account not found for ID: ${accountId}`);
      return NextResponse.redirect(getAbsoluteRedirectUrl('/?error=Fyers login failed: Account record not found.', request));
    }

    // Defensive check: If the account has an access token and was logged in within the last 15 seconds,
    // redirect to success. This prevents double-request/prefetching race conditions from consuming the code twice.
    const now = new Date();
    const isRecentlyLoggedIn = account.accessToken && 
                               account.lastLogin && 
                               (now.getTime() - new Date(account.lastLogin).getTime() < 15000);

    if (isRecentlyLoggedIn) {
      console.log(`[Fyers Callback] Account ${account.name} was recently authenticated. Skipping duplicate exchange.`);
      return NextResponse.redirect(getAbsoluteRedirectUrl(`/?success=Successfully logged into Fyers`, request));
    }

    const apiSecret = decrypt(account.apiSecret);
    if (!account.apiKey || !apiSecret) {
      console.error(`[Fyers Callback] API Key or Secret missing for account: ${account.name}`);
      return NextResponse.redirect(getAbsoluteRedirectUrl('/?error=Fyers login failed: Account is missing App ID or Secret.', request));
    }

    // Generate SHA-256 hash of appId:appSecret
    const appIdHash = crypto
      .createHash('sha256')
      .update(`${account.apiKey}:${apiSecret}`)
      .digest('hex');

    console.log(`[Fyers Callback] Exchanging auth code for account: ${account.name}`);
    console.log(`[Fyers Callback] App ID (apiKey): "${account.apiKey}"`);
    console.log(`[Fyers Callback] Decrypted secret length: ${apiSecret ? apiSecret.length : 0}`);
    console.log(`[Fyers Callback] Computed appIdHash: "${appIdHash}"`);

    // Construct the exact callback URL passed to Fyers during auth code generation
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 
                     (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    const callbackUrl = `${protocol}://${host}/api/accounts/fyers/callback`;

    // Call Fyers validate-authcode endpoint (API v3)
    const response = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: code,
        redirect_uri: callbackUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.s !== 'ok' || !data.access_token) {
      console.error('[Fyers Callback] Token validation failed:', data);
      const errMsg = data.message || 'Token validation failed';
      return NextResponse.redirect(getAbsoluteRedirectUrl(`/?error=Fyers login failed: ${encodeURIComponent(errMsg)}`, request));
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
    return NextResponse.redirect(getAbsoluteRedirectUrl(`/?success=Successfully logged into Fyers`, request));

  } catch (error: any) {
    console.error('[Fyers Callback] Process crashed:', error);
    return NextResponse.redirect(
      getAbsoluteRedirectUrl(`/?error=Fyers login crashed: ${encodeURIComponent(error.message || 'Unknown error')}`, request)
    );
  }
}
