import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/broker';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const { accessToken, broker } = await getValidAccessToken(accountId);

    if (broker === 'DHAN') {
      const response = await fetch('https://api.dhan.co/v2/fundlimit', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'access-token': accessToken,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.remarks || data.message || 'Failed to fetch funds from Dhan');
      }

      // Map Dhan fields (handling the API's known spelling 'availabelBalance')
      return NextResponse.json({
        availableBalance: data.availabelBalance || data.availableBalance || 0,
        utilizedMargin: data.utilizedAmount || 0,
        collateralValue: data.collateralAmount || 0,
        withdrawableBalance: data.withdrawableBalance || 0,
        raw: data,
      });
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Funds fetch failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch funds' }, { status: 500 });
  }
}
