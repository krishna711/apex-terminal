import { NextResponse } from 'next/server';
import { getValidAccessToken, getAngelOneHeaders, getFyersHeaders } from '@/lib/broker';
import { prisma } from '@/lib/db';

// GET: Retrieve daily orders
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const { accessToken, broker, apiKey } = await getValidAccessToken(accountId);

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
    } else if (broker === 'ANGELONE') {
      if (!apiKey) {
        throw new Error('API Key is missing for AngelOne account.');
      }

      const response = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getOrderBook', {
        method: 'GET',
        headers: getAngelOneHeaders(apiKey, accessToken),
      });

      const data = await response.json();
      if (!response.ok || !data.status || !data.data) {
        throw new Error(data.message || 'Failed to fetch orders from AngelOne');
      }

      const ordersList = Array.isArray(data.data) ? data.data : [];

      const orders = ordersList.map((item: any) => {
        let mappedStatus = 'PENDING';
        const st = (item.status || '').toLowerCase();
        if (st === 'complete') mappedStatus = 'TRADED';
        else if (st === 'rejected') mappedStatus = 'REJECTED';
        else if (st === 'cancelled') mappedStatus = 'CANCELLED';

        return {
          orderId: item.orderid,
          time: item.updatetime || item.ordertime || '',
          symbol: item.tradingsymbol || 'UNKNOWN',
          exchange: item.exchange || 'NSE',
          transactionType: item.transactiontype || 'BUY',
          orderType: item.ordertype || 'MARKET',
          productType: item.producttype || 'INTRADAY',
          quantity: Number(item.quantity || 0),
          price: Number(item.price || 0),
          status: mappedStatus,
        };
      });

      return NextResponse.json(orders);
    } else if (broker === 'FYERS') {
      if (!apiKey) {
        throw new Error('API Key is missing for Fyers account.');
      }

      const response = await fetch('https://api-t1.fyers.in/api/v3/orders', {
        method: 'GET',
        headers: getFyersHeaders(apiKey, accessToken),
      });

      const data = await response.json();
      if (!response.ok || data.s !== 'ok' || !data.orderBook) {
        throw new Error(data.message || 'Failed to fetch orders from Fyers');
      }

      const ordersList = Array.isArray(data.orderBook) ? data.orderBook : [];

      const orders = ordersList.map((item: any) => {
        let mappedStatus = 'PENDING';
        const st = Number(item.status);
        if (st === 2) mappedStatus = 'TRADED';
        else if (st === 5) mappedStatus = 'REJECTED';
        else if (st === 1) mappedStatus = 'CANCELLED';

        let mappedOrderType = 'MARKET';
        const ot = Number(item.type);
        if (ot === 1) mappedOrderType = 'LIMIT';
        else if (ot === 3) mappedOrderType = 'SL';
        else if (ot === 4) mappedOrderType = 'SL-M';

        const cleanSymbol = (item.symbol || 'UNKNOWN').split(':').pop()?.replace('-EQ', '') || item.symbol;

        return {
          orderId: item.id,
          time: item.orderDateTime || '',
          symbol: cleanSymbol,
          exchange: (item.symbol || '').startsWith('BSE') ? 'BSE' : 'NSE',
          transactionType: item.side === 1 ? 'BUY' : 'SELL',
          orderType: mappedOrderType,
          productType: item.productType || 'INTRADAY',
          quantity: Number(item.qty || 0),
          price: Number(item.price || 0),
          status: mappedStatus,
        };
      });

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

    const { accessToken, broker, clientId, apiKey } = await getValidAccessToken(accountId);

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
      if (!response.ok || data.status === 'failure' || data.errorType) {
        console.error('[Dhan Order] Placement failed:', data);
        throw new Error(data.errorMessage || data.remarks || data.message || 'Order placement failed from Dhan');
      }

      return NextResponse.json({
        success: true,
        orderId: data.orderId,
        message: 'Order placed successfully on Dhan',
        raw: data,
      });
    } else if (broker === 'ANGELONE') {
      if (!apiKey) {
        throw new Error('API Key is missing for AngelOne account.');
      }

      // 1. Look up AngelOne token in database
      const symRecord = await prisma.symbol.findFirst({
        where: {
          broker: 'ANGELONE',
          symbol: symbol.toUpperCase(),
          exchange: exchange.toUpperCase(),
        },
      });

      if (!symRecord) {
        return NextResponse.json({ error: `Symbol '${symbol}' on ${exchange} not found in AngelOne Master.` }, { status: 404 });
      }

      // 2. Map Product Type (Delivery for Equities, Carryforward for F&O)
      const exch = symRecord.exchange.toUpperCase();
      let mappedProduct = 'INTRADAY';
      if (productType.toUpperCase() === 'CNC') {
        mappedProduct = (exch === 'NSE' || exch === 'BSE') ? 'DELIVERY' : 'CARRYFORWARD';
      }

      // 3. Map Order Type
      let mappedOrderType = 'MARKET';
      const ot = orderType.toUpperCase();
      if (ot === 'LIMIT') mappedOrderType = 'LIMIT';
      else if (ot === 'SL') mappedOrderType = 'STOPLOSS_LIMIT';
      else if (ot === 'SL-M') mappedOrderType = 'STOPLOSS_MARKET';

      // 4. Build payload
      const payload = {
        variety: 'NORMAL',
        tradingsymbol: symRecord.symbol,
        symboltoken: symRecord.token,
        transactiontype: transactionType.toUpperCase(),
        exchange: symRecord.exchange,
        ordertype: mappedOrderType,
        producttype: mappedProduct,
        duration: 'DAY',
        price: (mappedOrderType === 'LIMIT' || mappedOrderType === 'STOPLOSS_LIMIT') ? Number(price) : 0,
        triggerprice: (mappedOrderType === 'STOPLOSS_LIMIT' || mappedOrderType === 'STOPLOSS_MARKET') ? Number(triggerPrice) : 0,
        quantity: Number(quantity),
        disclosedquantity: 0,
      };

      console.log('[AngelOne Order] Placing order payload:', payload);

      const response = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder', {
        method: 'POST',
        headers: getAngelOneHeaders(apiKey, accessToken),
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.status || !data.data) {
        console.error('[AngelOne Order] Placement failed:', data);
        throw new Error(data.message || 'Order placement failed on AngelOne');
      }

      return NextResponse.json({
        success: true,
        orderId: data.data.orderid,
        message: 'Order placed successfully on AngelOne',
        raw: data,
      });
    } else if (broker === 'FYERS') {
      if (!apiKey) {
        throw new Error('API Key is missing for Fyers account.');
      }

      // 1. Look up Fyers symbol in database
      const symRecord = await prisma.symbol.findFirst({
        where: {
          broker: 'FYERS',
          symbol: symbol.toUpperCase(),
          exchange: exchange.toUpperCase(),
        },
      });

      if (!symRecord) {
        return NextResponse.json({ error: `Symbol '${symbol}' on ${exchange} not found in Fyers Master.` }, { status: 404 });
      }

      // 2. Map Product Type (CNC for Equities, MARGIN for Carryforward Derivatives, INTRADAY for MIS)
      const exch = symRecord.exchange.toUpperCase();
      let mappedProduct = 'INTRADAY';
      if (productType.toUpperCase() === 'CNC') {
        mappedProduct = (exch === 'NSE' || exch === 'BSE') ? 'CNC' : 'MARGIN';
      }

      // 3. Map Order Type (1: Limit, 2: Market, 3: SL, 4: SL-M)
      let mappedType = 2; // Default to Market
      const ot = orderType.toUpperCase();
      if (ot === 'LIMIT') mappedType = 1;
      else if (ot === 'SL') mappedType = 3;
      else if (ot === 'SL-M') mappedType = 4;

      // 4. Build payload
      const payload = {
        symbol: symRecord.token, // Store contains full Fyers symbol string e.g. "NSE:SBIN-EQ"
        qty: Number(quantity),
        type: mappedType,
        side: transactionType.toUpperCase() === 'BUY' ? 1 : -1,
        productType: mappedProduct,
        limitPrice: (mappedType === 1 || mappedType === 3) ? Number(price) : 0,
        stopPrice: (mappedType === 3 || mappedType === 4) ? Number(triggerPrice) : 0,
        validity: 'DAY',
        disclosedQty: 0,
        offlineOrder: false,
      };

      console.log('[Fyers Order] Placing order payload:', payload);

      const response = await fetch('https://api-t1.fyers.in/api/v3/orders/sync', {
        method: 'POST',
        headers: getFyersHeaders(apiKey, accessToken),
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || data.s !== 'ok' || !data.id) {
        console.error('[Fyers Order] Placement failed:', data);
        throw new Error(data.message || 'Order placement failed on Fyers');
      }

      return NextResponse.json({
        success: true,
        orderId: data.id,
        message: 'Order placed successfully on Fyers',
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

    const { accessToken, broker, apiKey } = await getValidAccessToken(accountId);

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
    } else if (broker === 'ANGELONE') {
      if (!apiKey) {
        throw new Error('API Key is missing for AngelOne account.');
      }

      const response = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/cancelOrder', {
        method: 'POST', // AngelOne cancelOrder API uses POST method
        headers: getAngelOneHeaders(apiKey, accessToken),
        body: JSON.stringify({
          variety: 'NORMAL',
          orderid: orderId,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.status) {
        throw new Error(data.message || 'Order cancellation failed on AngelOne');
      }

      return NextResponse.json({
        success: true,
        orderId: data.data.orderid || orderId,
        message: 'Order cancelled successfully on AngelOne',
      });
    } else if (broker === 'FYERS') {
      if (!apiKey) {
        throw new Error('API Key is missing for Fyers account.');
      }

      const response = await fetch('https://api-t1.fyers.in/api/v3/orders/sync', {
        method: 'DELETE',
        headers: getFyersHeaders(apiKey, accessToken),
        body: JSON.stringify({
          id: orderId,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.s !== 'ok' || !data.id) {
        throw new Error(data.message || 'Order cancellation failed on Fyers');
      }

      return NextResponse.json({
        success: true,
        orderId: data.id || orderId,
        message: 'Order cancelled successfully on Fyers',
      });
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('Order cancellation failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to cancel order' }, { status: 500 });
  }
}
