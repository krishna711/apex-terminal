import { NextResponse } from 'next/server';
import { getValidAccessToken, getAngelOneHeaders, getFyersHeaders } from '@/lib/broker';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const { accessToken, broker, apiKey } = await getValidAccessToken(accountId);

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
    } else if (broker === 'ANGELONE') {
      if (!apiKey) {
        throw new Error('API Key is missing for AngelOne account.');
      }

      const response = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getFundsAndLimits', {
        method: 'GET',
        headers: getAngelOneHeaders(apiKey, accessToken),
      });

      const data = await response.json();
      if (!response.ok || !data.status || !data.data) {
        throw new Error(data.message || 'Failed to fetch funds from AngelOne');
      }

      return NextResponse.json({
        availableBalance: Number(data.data.net || 0),
        utilizedMargin: Math.abs(Number(data.data.utilized || 0)) || 0,
        collateralValue: Number(data.data.collateral || 0) || 0,
        withdrawableBalance: Number(data.data.net || 0),
        raw: data,
      });
    } else if (broker === 'FYERS') {
      if (!apiKey) {
        throw new Error('API Key (App ID) is missing for Fyers account.');
      }

      const response = await fetch('https://api-t1.fyers.in/api/v3/funds', {
        method: 'GET',
        headers: getFyersHeaders(apiKey, accessToken),
      });

      const data = await response.json();
      if (!response.ok || data.s !== 'ok' || !data.fund_limit) {
        throw new Error(data.message || 'Failed to fetch funds from Fyers');
      }

      const limitObj = data.fund_limit.find((f: any) => f.title === 'Limit' || f.id === 10);
      const utilizedObj = data.fund_limit.find((f: any) => f.title === 'Utilized' || f.id === 12);
      const collateralObj = data.fund_limit.find((f: any) => f.title === 'Collateral' || f.id === 2);

      const available = limitObj ? limitObj.equityAmount : 0;
      const utilized = utilizedObj ? utilizedObj.equityAmount : 0;
      const collateral = collateralObj ? collateralObj.equityAmount : 0;

      return NextResponse.json({
        availableBalance: Number(available),
        utilizedMargin: Number(utilized),
        collateralValue: Number(collateral),
        withdrawableBalance: Number(available),
        raw: data,
      });
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Funds fetch failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch funds' }, { status: 500 });
  }
}
