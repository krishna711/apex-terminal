import { prisma } from './db';
import { decrypt } from './encryption';
import { generateTOTP } from './totp';

function getMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

/**
 * Retrieves a valid access token for the given account.
 * If the token has expired (or is missing) and the broker is Dhan or AngelOne,
 * it will perform a silent login to refresh the token automatically.
 */
export async function getValidAccessToken(accountId: string): Promise<{
  accessToken: string;
  broker: string;
  clientId: string;
  apiKey?: string | null;
  apiSecret?: string | null;
  feedToken?: string | null;
}> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error('Account not found');
  }

  const now = new Date();
  const isTokenValid =
    account.accessToken &&
    account.tokenExpiredAt &&
    new Date(account.tokenExpiredAt) > now;

  if (isTokenValid) {
    return {
      accessToken: account.accessToken!,
      broker: account.broker,
      clientId: account.clientId,
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      feedToken: account.feedToken,
    };
  }

  // Token is missing or expired. Attempt auto-reauth.
  const broker = account.broker.toUpperCase();
  console.log(`[Auto-Reauth] Access token for ${account.name} (${broker}) is expired or missing. Attempting silent login...`);

  if (broker === 'DHAN') {
    const pin = decrypt(account.password);
    const totpSecret = decrypt(account.totpSecret);

    if (!pin || !totpSecret) {
      throw new Error('Silent login failed: PIN or TOTP secret is not configured.');
    }

    const totpCode = generateTOTP(totpSecret);
    if (!totpCode) {
      throw new Error('Silent login failed: Failed to generate TOTP code.');
    }

    const dhanAuthUrl = `https://auth.dhan.co/app/generateAccessToken?dhanClientId=${account.clientId}&pin=${pin}&totp=${totpCode}`;
    const response = await fetch(dhanAuthUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (!response.ok || !data.accessToken) {
      throw new Error(`Silent login to Dhan failed: ${data.remarks || data.message || 'Unknown error'}`);
    }

    const midnight = getMidnight();
    const updatedAccount = await prisma.account.update({
      where: { id: accountId },
      data: {
        accessToken: data.accessToken,
        lastLogin: new Date(),
        tokenExpiredAt: midnight,
      },
    });

    console.log(`[Auto-Reauth] Successfully refreshed Dhan token for ${account.name}.`);

    return {
      accessToken: updatedAccount.accessToken!,
      broker: 'DHAN',
      clientId: updatedAccount.clientId,
      apiKey: updatedAccount.apiKey,
      apiSecret: updatedAccount.apiSecret,
    };

  } else if (broker === 'ANGELONE') {
    const password = decrypt(account.password);
    const totpSecret = decrypt(account.totpSecret);

    if (!password || !totpSecret || !account.apiKey) {
      throw new Error('Silent login failed: MPIN, TOTP secret, or API Key is missing.');
    }

    const totpCode = generateTOTP(totpSecret);
    if (!totpCode) {
      throw new Error('Silent login failed: Failed to generate TOTP code.');
    }

    // Call AngelOne login endpoint
    const response = await fetch('https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '192.168.1.1',
        'X-ClientPublicIP': '106.193.147.98',
        'X-MACAddress': 'FE:80:00:00:00:00',
        'X-PrivateKey': account.apiKey,
      },
      body: JSON.stringify({
        clientcode: account.clientId,
        password: password,
        totp: totpCode,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.status || !data.data) {
      throw new Error(`Silent login to AngelOne failed: ${data.message || 'Unknown error'}`);
    }

    const midnight = getMidnight();
    const updatedAccount = await prisma.account.update({
      where: { id: accountId },
      data: {
        accessToken: data.data.jwtToken,
        feedToken: data.data.feedToken,
        lastLogin: new Date(),
        tokenExpiredAt: midnight,
      },
    });

    console.log(`[Auto-Reauth] Successfully refreshed AngelOne token for ${account.name}.`);

    return {
      accessToken: updatedAccount.accessToken!,
      broker: 'ANGELONE',
      clientId: updatedAccount.clientId,
      apiKey: updatedAccount.apiKey,
      apiSecret: updatedAccount.apiSecret,
      feedToken: updatedAccount.feedToken,
    };
  }

  // Fyers doesn't support silent programmatic login (requires manual OAuth redirect page)
  throw new Error('Session expired. Please click "Login" to authorize Fyers via web page.');
}

/**
 * Generates standard headers required for the AngelOne OpenAPI endpoints.
 */
export function getAngelOneHeaders(apiKey: string, accessToken: string) {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '192.168.1.1',
    'X-ClientPublicIP': '106.193.147.98',
    'X-MACAddress': 'FE:80:00:00:00:00',
    'X-PrivateKey': apiKey,
    'Authorization': `Bearer ${accessToken}`,
  };
}
