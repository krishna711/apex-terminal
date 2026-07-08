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
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Positions fetch failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch positions' }, { status: 500 });
  }
}
