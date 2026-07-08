import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

// GET: Retrieve all accounts (omitting sensitive details)
export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();

    // Map accounts to check login status and mask details
    const sanitizedAccounts = accounts.map((acc) => {
      const isTokenValid =
        acc.accessToken &&
        acc.tokenExpiredAt &&
        new Date(acc.tokenExpiredAt) > now;

      return {
        id: acc.id,
        name: acc.name,
        broker: acc.broker,
        clientId: acc.clientId,
        isLoggedIn: !!isTokenValid,
        lastLogin: acc.lastLogin,
        tokenExpiredAt: acc.tokenExpiredAt,
        apiKey: acc.apiKey ? '***' : null,
        hasSecret: !!acc.apiSecret,
        hasPassword: !!acc.password,
        hasTotp: !!acc.totpSecret,
      };
    });

    return NextResponse.json(sanitizedAccounts);
  } catch (error) {
    console.error('Failed to get accounts:', error);
    return NextResponse.json({ error: 'Failed to retrieve accounts' }, { status: 500 });
  }
}

// POST: Add a new broker account
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, broker, clientId, apiKey, apiSecret, password, totpSecret } = body;

    if (!name || !broker || !clientId) {
      return NextResponse.json({ error: 'Name, broker, and clientId are required' }, { status: 400 });
    }

    const cleanClientId = clientId?.trim();
    const cleanApiKey = apiKey?.trim() || null;
    const cleanApiSecret = apiSecret?.trim() || null;
    const cleanPassword = password?.trim();
    const cleanTotpSecret = totpSecret?.trim();

    // Encrypt sensitive fields
    const encryptedPassword = encrypt(cleanPassword);
    const encryptedTotpSecret = encrypt(cleanTotpSecret);

    const account = await prisma.account.create({
      data: {
        name,
        broker: broker.toUpperCase(),
        clientId: cleanClientId,
        apiKey: cleanApiKey,
        apiSecret: cleanApiSecret,
        password: encryptedPassword,
        totpSecret: encryptedTotpSecret,
      },
    });

    return NextResponse.json({
      id: account.id,
      name: account.name,
      broker: account.broker,
      clientId: account.clientId,
    });
  } catch (error) {
    console.error('Failed to create account:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}

// DELETE: Remove an account
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    await prisma.account.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete account:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
