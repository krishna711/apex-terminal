import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { generateTOTP } from '@/lib/totp';

// Helper to get local midnight date
function getMidnight(): Date {
  const now = new Date();
  // Set to 23:59:59.999 of the current day
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

export async function POST(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const account = await prisma.account.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const broker = account.broker.toUpperCase();

    if (broker === 'DHAN') {
      const pin = decrypt(account.password);
      const totpSecret = decrypt(account.totpSecret);

      if (!pin || !totpSecret) {
        return NextResponse.json({ error: 'Account details are missing PIN or TOTP secret' }, { status: 400 });
      }

      const totpCode = generateTOTP(totpSecret);
      if (!totpCode) {
        return NextResponse.json({ error: 'Failed to generate TOTP code' }, { status: 500 });
      }

      console.log(`[Dhan Login] Attempting login for client ${account.clientId} using TOTP ${totpCode}`);

      // Call Dhan generateAccessToken API
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
        console.error('[Dhan Login] Authentication failed:', data);
        return NextResponse.json({ 
          error: data.remarks || data.message || 'Authentication failed from Dhan' 
        }, { status: 400 });
      }

      // Update account with access token and midnight expiration
      const midnight = getMidnight();
      await prisma.account.update({
        where: { id },
        data: {
          accessToken: data.accessToken,
          lastLogin: new Date(),
          tokenExpiredAt: midnight,
        },
      });

      return NextResponse.json({ 
        success: true, 
        message: `Successfully logged into Dhan. Token valid until midnight.`,
        clientName: data.dhanClientName 
      });

    } else if (broker === 'ANGELONE') {
      const password = decrypt(account.password);
      const totpSecret = decrypt(account.totpSecret);

      if (!password || !totpSecret || !account.apiKey) {
        return NextResponse.json({ error: 'Account details are missing MPIN, TOTP secret, or API Key' }, { status: 400 });
      }

      const totpCode = generateTOTP(totpSecret);
      if (!totpCode) {
        return NextResponse.json({ error: 'Failed to generate TOTP code' }, { status: 500 });
      }

      console.log(`[AngelOne Login] Attempting login for client ${account.clientId} using TOTP`);

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
        console.error('[AngelOne Login] Authentication failed:', data);
        return NextResponse.json({ 
          error: data.message || 'Authentication failed from AngelOne' 
        }, { status: 400 });
      }

      // Update account with access token, feed token, and midnight expiration
      const midnight = getMidnight();
      await prisma.account.update({
        where: { id },
        data: {
          accessToken: data.data.jwtToken,
          feedToken: data.data.feedToken,
          lastLogin: new Date(),
          tokenExpiredAt: midnight,
        },
      });

      return NextResponse.json({ 
        success: true, 
        message: `Successfully logged into AngelOne. Token valid until midnight.`
      });

    } else if (broker === 'FYERS') {
      // Skeleton for Fyers login (to be fully implemented in phase 3)
      return NextResponse.json({ 
        error: 'Fyers integration is planned for Phase 3. Please start with Dhan first.' 
      }, { status: 501 });
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Login process failed:', error);
    return NextResponse.json({ error: error.message || 'Login failed' }, { status: 500 });
  }
}
