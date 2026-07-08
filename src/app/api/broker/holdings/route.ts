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
      const response = await fetch('https://api.dhan.co/v2/holdings', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'access-token': accessToken,
        },
      });

      // Dhan returns a JSON array or an object containing an array. If no holdings, it might be empty or 204.
      if (response.status === 204) {
        return NextResponse.json([]);
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.remarks || data.message || 'Failed to fetch holdings from Dhan');
      }

      const holdingsList = Array.isArray(data) ? data : data.data || [];

      // Map Dhan holdings to standardized holdings
      const holdings = holdingsList.map((item: any) => {
        const qty = item.totalQty || 0;
        const avgPrice = item.avgCostPrice || 0;
        const ltp = item.lastPrice || avgPrice; // Fallback to average price if ltp is not available
        const marketValue = qty * ltp;
        const pnl = qty * (ltp - avgPrice);
        const pnlPercentage = avgPrice > 0 ? (pnl / (qty * avgPrice)) * 100 : 0;

        return {
          symbol: item.tradingSymbol || 'UNKNOWN',
          exchange: item.exchange || 'NSE',
          quantity: qty,
          averagePrice: avgPrice,
          currentPrice: ltp,
          marketValue: Number(marketValue.toFixed(2)),
          pnl: Number(pnl.toFixed(2)),
          pnlPercentage: Number(pnlPercentage.toFixed(2)),
        };
      });

      return NextResponse.json(holdings);
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Holdings fetch failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch holdings' }, { status: 500 });
  }
}
