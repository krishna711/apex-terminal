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
      const response = await fetch('https://api.dhan.co/v2/positions', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'access-token': accessToken,
        },
      });

      if (response.status === 204) {
        return NextResponse.json([]);
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.remarks || data.message || 'Failed to fetch positions from Dhan');
      }

      const positionsList = Array.isArray(data) ? data : data.data || [];

      // Map Dhan positions to standardized positions
      const positions = positionsList.map((item: any) => {
        const netQty = item.netQty || 0;
        const buyAvg = item.buyAvg || 0;
        const sellAvg = item.sellAvg || 0;
        const realized = item.realizedProfit || 0;
        const unrealized = item.unrealizedProfit || 0;
        const pnl = realized + unrealized;

        // Formulate average entry price
        const entryPrice = netQty >= 0 ? buyAvg : sellAvg;

        return {
          symbol: item.tradingSymbol || 'UNKNOWN',
          exchange: item.exchange || 'NSE',
          productType: item.productType || 'INTRADAY',
          quantity: netQty,
          buyPrice: buyAvg,
          sellPrice: sellAvg,
          ltp: item.lastPrice || entryPrice,
          pnl: Number(pnl.toFixed(2)),
          realized: Number(realized.toFixed(2)),
          unrealized: Number(unrealized.toFixed(2)),
        };
      });

      return NextResponse.json(positions);
    } else if (broker === 'ANGELONE') {
      if (!apiKey) {
        throw new Error('API Key is missing for AngelOne account.');
      }

      const response = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getPosition', {
        method: 'GET',
        headers: getAngelOneHeaders(apiKey, accessToken),
      });

      const data = await response.json();
      if (!response.ok || !data.status) {
        throw new Error(data.message || 'Failed to fetch positions from AngelOne');
      }

      const positionsList = Array.isArray(data.data) ? data.data : [];

      const positions = positionsList.map((item: any) => {
        const netQty = Number(item.netqty || 0);
        const buyPrice = Number(item.buyprice || 0);
        const sellPrice = Number(item.sellprice || 0);
        const ltp = Number(item.ltp || 0);
        const pnl = Number(item.pnl || 0);

        return {
          symbol: item.tradingsymbol || 'UNKNOWN',
          exchange: item.exchange || 'NSE',
          productType: item.producttype || 'INTRADAY',
          quantity: netQty,
          buyPrice: buyPrice,
          sellPrice: sellPrice,
          ltp: ltp,
          pnl: pnl,
          realized: 0,
          unrealized: pnl,
        };
      });

      return NextResponse.json(positions);
    } else if (broker === 'FYERS') {
      if (!apiKey) {
        throw new Error('API Key is missing for Fyers account.');
      }

      const response = await fetch('https://api-t1.fyers.in/api/v3/positions', {
        method: 'GET',
        headers: getFyersHeaders(apiKey, accessToken),
      });

      const data = await response.json();
      if (!response.ok || data.s !== 'ok' || !data.netPositions) {
        throw new Error(data.message || 'Failed to fetch positions from Fyers');
      }

      const positionsList = Array.isArray(data.netPositions) ? data.netPositions : [];

      const positions = positionsList.map((item: any) => {
        const netQty = Number(item.netQty || 0);
        const buyAvg = Number(item.buyAvg || 0);
        const sellAvg = Number(item.sellAvg || 0);
        const ltp = Number(item.ltp || 0);
        const pnl = Number(item.pl || 0);
        const realized = Number(item.realized_pnl || 0);
        const unrealized = Number(item.unrealized_pnl || 0);

        // Fyers symbols look like "NSE:SBIN-EQ". Clean the name to e.g. "SBIN"
        const cleanSymbol = (item.symbol || 'UNKNOWN').split(':').pop()?.replace('-EQ', '') || item.symbol;

        return {
          symbol: cleanSymbol,
          exchange: (item.symbol || '').startsWith('BSE') ? 'BSE' : 'NSE',
          productType: item.productType || 'INTRADAY',
          quantity: netQty,
          buyPrice: buyAvg,
          sellPrice: sellAvg,
          ltp: ltp,
          pnl: pnl,
          realized: realized,
          unrealized: unrealized,
        };
      });

      return NextResponse.json(positions);
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Positions fetch failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch positions' }, { status: 500 });
  }
}
