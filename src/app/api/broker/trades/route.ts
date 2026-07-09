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
    } else if (broker === 'ANGELONE') {
      if (!apiKey) {
        throw new Error('API Key is missing for AngelOne account.');
      }

      const response = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getTradeBook', {
        method: 'GET',
        headers: getAngelOneHeaders(apiKey, accessToken),
      });

      const data = await response.json();
      if (!response.ok || !data.status) {
        throw new Error(data.message || 'Failed to fetch trade book from AngelOne');
      }

      const tradesList = Array.isArray(data.data) ? data.data : [];

      const trades = tradesList.map((item: any) => ({
        tradeId: item.uniqueorderid || item.orderid,
        orderId: item.orderid,
        time: item.filltime || '',
        symbol: item.tradingsymbol || 'UNKNOWN',
        exchange: item.exchange || 'NSE',
        transactionType: item.transactiontype || 'BUY',
        quantity: Number(item.fillsize || 0),
        price: Number(item.fillprice || 0),
      }));

      return NextResponse.json(trades);
    } else if (broker === 'FYERS') {
      if (!apiKey) {
        throw new Error('API Key is missing for Fyers account.');
      }

      const response = await fetch('https://api-t1.fyers.in/api/v3/tradebook', {
        method: 'GET',
        headers: getFyersHeaders(apiKey, accessToken),
      });

      const data = await response.json();
      if (!response.ok || data.s !== 'ok' || !data.tradeBook) {
        throw new Error(data.message || 'Failed to fetch trade book from Fyers');
      }

      const tradesList = Array.isArray(data.tradeBook) ? data.tradeBook : [];

      const trades = tradesList.map((item: any) => {
        const cleanSymbol = (item.symbol || 'UNKNOWN').split(':').pop()?.replace('-EQ', '') || item.symbol;
        return {
          tradeId: item.id || item.orderId,
          orderId: item.orderId,
          time: item.tradeTime || '',
          symbol: cleanSymbol,
          exchange: (item.symbol || '').startsWith('BSE') ? 'BSE' : 'NSE',
          transactionType: item.transactionType === 1 ? 'BUY' : 'SELL',
          quantity: Number(item.qty || 0),
          price: Number(item.tradePrice || 0),
        };
      });

      return NextResponse.json(trades);
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Trades fetch failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch trades' }, { status: 500 });
  }
}
