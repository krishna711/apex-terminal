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
      const response = await fetch('https://api.dhan.co/v2/trades', {
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
        throw new Error(data.remarks || data.message || 'Failed to fetch trades from Dhan');
      }

      const tradesList = Array.isArray(data) ? data : data.data || [];

      // Map Dhan trades to standardized trades
      const trades = tradesList.map((item: any) => ({
        tradeId: item.tradeId,
        orderId: item.orderId,
        time: item.updateTime || item.createTime || '',
        symbol: item.tradingSymbol || 'UNKNOWN',
        exchange: item.exchangeSegment?.replace('_EQ', '') || 'NSE',
        transactionType: item.transactionType || 'BUY',
        quantity: item.tradedQuantity || 0,
        price: item.tradedPrice || 0,
      }));

      return NextResponse.json(trades);
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Trades fetch failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch trades' }, { status: 500 });
  }
}
