import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/broker';
import { prisma } from '@/lib/db';

// GET: Retrieve daily orders
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const { accessToken, broker } = await getValidAccessToken(accountId);

    if (broker === 'DHAN') {
      const response = await fetch('https://api.dhan.co/v2/orders', {
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
        throw new Error(data.remarks || data.message || 'Failed to fetch orders from Dhan');
      }

      const ordersList = Array.isArray(data) ? data : data.data || [];

      // Map Dhan orders to standard format
      const orders = ordersList.map((item: any) => ({
        orderId: item.orderId,
        time: item.updateTime || item.orderTime || '',
        symbol: item.tradingSymbol || 'UNKNOWN',
        exchange: item.exchangeSegment?.replace('_EQ', '') || 'NSE',
        transactionType: item.transactionType || 'BUY',
        orderType: item.orderType || 'MARKET',
        productType: item.productType || 'INTRADAY',
        quantity: item.quantity || 0,
        price: item.price || 0,
        status: item.orderStatus || 'PENDING', // PENDING, REJECTED, TRADED, CANCELLED
      }));

      return NextResponse.json(orders);
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Orders fetch failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch orders' }, { status: 500 });
  }
}

// POST: Place a new order
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountId, symbol, exchange, transactionType, orderType, productType, quantity, price, triggerPrice } = body;

    if (!accountId || !symbol || !exchange || !transactionType || !orderType || !productType || !quantity) {
      return NextResponse.json({ error: 'Missing required order parameters' }, { status: 400 });
    }

    const { accessToken, broker, clientId } = await getValidAccessToken(accountId);

    if (broker === 'DHAN') {
      // 1. Look up Dhan Security ID in our SQLite database
      const symRecord = await prisma.symbol.findFirst({
        where: {
          broker: 'DHAN',
          symbol: symbol.toUpperCase(),
          exchange: exchange.toUpperCase(),
        },
      });

      if (!symRecord) {
        return NextResponse.json({ error: `Symbol '${symbol}' on ${exchange} not found in Dhan Master. Try syncing symbols first.` }, { status: 404 });
      }

      // 2. Build Dhan order payload
      const payload = {
        dhanClientId: clientId,
        correlationId: `ord_${Date.now()}`,
        transactionType: transactionType.toUpperCase(), // BUY / SELL
        exchangeSegment: symRecord.exchange, // E.g. 'NSE_EQ', 'NSE_FNO'
        productType: productType.toUpperCase(), // INTRADAY, CNC, MARGIN
        orderType: orderType.toUpperCase(), // MARKET, LIMIT, SL, SL-M
        validity: 'DAY',
        securityId: symRecord.token,
        quantity: Number(quantity),
        price: orderType.toUpperCase() === 'LIMIT' ? Number(price) : 0,
        triggerPrice: (orderType.toUpperCase() === 'SL' || orderType.toUpperCase() === 'SL-M') ? Number(triggerPrice) : 0,
        disclosedQuantity: 0,
        afterMarketOrder: false,
        amoTime: 'OPEN',
      };

      console.log('[Dhan Order] Placing order payload:', payload);

      const response = await fetch('https://api.dhan.co/v2/orders', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'access-token': accessToken,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || data.status === 'failure') {
        console.error('[Dhan Order] Placement failed:', data);
        throw new Error(data.remarks || data.message || 'Order placement failed from Dhan');
      }

      return NextResponse.json({
        success: true,
        orderId: data.orderId,
        message: 'Order placed successfully on Dhan',
        raw: data,
      });
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Order placement failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to place order' }, { status: 500 });
  }
}

// DELETE: Cancel an order
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const orderId = searchParams.get('orderId');

    if (!accountId || !orderId) {
      return NextResponse.json({ error: 'Account ID and Order ID are required' }, { status: 400 });
    }

    const { accessToken, broker } = await getValidAccessToken(accountId);

    if (broker === 'DHAN') {
      const response = await fetch(`https://api.dhan.co/v2/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'access-token': accessToken,
        },
      });

      const data = await response.json();
      if (!response.ok || data.status === 'failure') {
        throw new Error(data.remarks || data.message || 'Order cancellation failed on Dhan');
      }

      return NextResponse.json({
        success: true,
        orderId: data.orderId,
        message: 'Order cancelled successfully on Dhan',
      });
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Order cancellation failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to cancel order' }, { status: 500 });
  }
}
