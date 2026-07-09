import { NextResponse } from 'next/server';
import { getValidAccessToken, getAngelOneHeaders, getFyersHeaders } from '@/lib/broker';
import { prisma } from '@/lib/db';

interface OrderLeg {
  symbol: string;
  exchange: string;
  transactionType: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  productType: string;
  quantity: number;
  price: number;
  triggerPrice?: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountId, legs } = body as { accountId: string; legs: OrderLeg[] };

    if (!accountId || !legs || !Array.isArray(legs) || legs.length === 0) {
      return NextResponse.json({ error: 'Account ID and a list of order legs are required' }, { status: 400 });
    }

    const { accessToken, broker, clientId, apiKey } = await getValidAccessToken(accountId);

    if (broker !== 'DHAN' && broker !== 'ANGELONE' && broker !== 'FYERS') {
      return NextResponse.json({ error: 'Basket orders currently only supported for Dhan, AngelOne and Fyers.' }, { status: 400 });
    }

    // Partition legs into BUY and SELL
    const buyLegs = legs.filter(leg => leg.transactionType.toUpperCase() === 'BUY');
    const sellLegs = legs.filter(leg => leg.transactionType.toUpperCase() === 'SELL');

    const buyResults: any[] = [];
    const sellResults: any[] = [];

    // Helper function to place a single order leg
    const placeLegOrder = async (leg: OrderLeg) => {
      // 1. Look up Symbol
      const symRecord = await prisma.symbol.findFirst({
        where: {
          broker: broker,
          symbol: leg.symbol.toUpperCase(),
          exchange: leg.exchange.toUpperCase(),
        },
      });

      if (!symRecord) {
        throw new Error(`Symbol '${leg.symbol}' on ${leg.exchange} not found in ${broker} Master database.`);
      }

      if (broker === 'DHAN') {
        // Prepare Dhan payload
        const payload = {
          dhanClientId: clientId,
          correlationId: `bskt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          transactionType: leg.transactionType.toUpperCase(),
          exchangeSegment: symRecord.exchange, // Use stored segment (NSE_EQ, NSE_FNO, etc.)
          productType: leg.productType.toUpperCase(),
          orderType: leg.orderType.toUpperCase(),
          validity: 'DAY',
          securityId: symRecord.token,
          quantity: Number(leg.quantity),
          price: leg.orderType.toUpperCase() === 'LIMIT' ? Number(leg.price) : 0,
          triggerPrice: (leg.orderType.toUpperCase() === 'SL' || leg.orderType.toUpperCase() === 'SL-M') ? Number(leg.triggerPrice || 0) : 0,
          disclosedQuantity: 0,
          afterMarketOrder: false,
          amoTime: 'OPEN',
        };

        console.log('[Basket Dhan Leg] Placing payload:', payload);

        const res = await fetch('https://api.dhan.co/v2/orders', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'access-token': accessToken,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || data.status === 'failure' || data.errorType) {
          throw new Error(data.errorMessage || data.remarks || data.message || `Order placement failed for ${leg.symbol}`);
        }

        return {
          symbol: leg.symbol,
          orderId: data.orderId,
          status: data.orderStatus || 'SUCCESS',
        };
      } else if (broker === 'ANGELONE') {
        // AngelOne
        if (!apiKey) {
          throw new Error('API Key is missing for AngelOne account.');
        }

        // Map Product Type (Delivery for Equities, Carryforward for F&O)
        const exch = symRecord.exchange.toUpperCase();
        let mappedProduct = 'INTRADAY';
        if (leg.productType.toUpperCase() === 'CNC') {
          mappedProduct = (exch === 'NSE' || exch === 'BSE') ? 'DELIVERY' : 'CARRYFORWARD';
        }

        // Map Order Type
        let mappedOrderType = 'MARKET';
        const ot = leg.orderType.toUpperCase();
        if (ot === 'LIMIT') mappedOrderType = 'LIMIT';
        else if (ot === 'SL') mappedOrderType = 'STOPLOSS_LIMIT';
        else if (ot === 'SL-M') mappedOrderType = 'STOPLOSS_MARKET';

        const payload = {
          variety: 'NORMAL',
          tradingsymbol: symRecord.symbol,
          symboltoken: symRecord.token,
          transactiontype: leg.transactionType.toUpperCase(),
          exchange: symRecord.exchange,
          ordertype: mappedOrderType,
          producttype: mappedProduct,
          duration: 'DAY',
          price: (mappedOrderType === 'LIMIT' || mappedOrderType === 'STOPLOSS_LIMIT') ? Number(leg.price) : 0,
          triggerprice: (mappedOrderType === 'STOPLOSS_LIMIT' || mappedOrderType === 'STOPLOSS_MARKET') ? Number(leg.triggerPrice || 0) : 0,
          quantity: Number(leg.quantity),
          disclosedquantity: 0,
        };

        console.log('[Basket AngelOne Leg] Placing payload:', payload);

        const res = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder', {
          method: 'POST',
          headers: getAngelOneHeaders(apiKey, accessToken),
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || !data.status || !data.data) {
          throw new Error(data.message || `Order placement failed for ${leg.symbol} on AngelOne`);
        }

        return {
          symbol: leg.symbol,
          orderId: data.data.orderid,
          status: 'SUCCESS',
        };
      } else {
        // Fyers
        if (!apiKey) {
          throw new Error('API Key is missing for Fyers account.');
        }

        const exch = symRecord.exchange.toUpperCase();
        let mappedProduct = 'INTRADAY';
        if (leg.productType.toUpperCase() === 'CNC') {
          mappedProduct = (exch === 'NSE' || exch === 'BSE') ? 'CNC' : 'MARGIN';
        }

        let mappedType = 2; // Default to Market
        const ot = leg.orderType.toUpperCase();
        if (ot === 'LIMIT') mappedType = 1;
        else if (ot === 'SL') mappedType = 3;
        else if (ot === 'SL-M') mappedType = 4;

        const payload = {
          symbol: symRecord.token, // contains e.g. "NSE:SBIN-EQ"
          qty: Number(leg.quantity),
          type: mappedType,
          side: leg.transactionType.toUpperCase() === 'BUY' ? 1 : -1,
          productType: mappedProduct,
          limitPrice: (mappedType === 1 || mappedType === 3) ? Number(leg.price) : 0,
          stopPrice: (mappedType === 3 || mappedType === 4) ? Number(leg.triggerPrice || 0) : 0,
          validity: 'DAY',
          disclosedQty: 0,
          offlineOrder: 'False',
        };

        console.log('[Basket Fyers Leg] Placing payload:', payload);

        const res = await fetch('https://api-t1.fyers.in/api/v3/orders/sync', {
          method: 'POST',
          headers: getFyersHeaders(apiKey, accessToken),
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || data.s !== 'ok' || !data.id) {
          throw new Error(data.message || `Order placement failed for ${leg.symbol} on Fyers`);
        }

        return {
          symbol: leg.symbol,
          orderId: data.id,
          status: 'SUCCESS',
        };
      }
    };

    // 1. EXECUTE BUY LEGS FIRST
    console.log(`[Basket Execution] Executing ${buyLegs.length} BUY legs first...`);
    for (const leg of buyLegs) {
      try {
        const result = await placeLegOrder(leg);
        buyResults.push(result);
      } catch (err: any) {
        console.error(`[Basket Execution] BUY leg failed:`, err.message);
        return NextResponse.json({
          success: false,
          error: `BUY leg failed: ${err.message}. Order execution stopped.`,
          buyResults,
          sellResults, // will be empty since we stop
        }, { status: 400 });
      }
    }

    // 2. EXECUTE SELL LEGS SECOND (ONLY if all BUY legs succeeded)
    console.log(`[Basket Execution] All BUY legs executed successfully. Placing ${sellLegs.length} SELL legs...`);
    for (const leg of sellLegs) {
      try {
        const result = await placeLegOrder(leg);
        sellResults.push(result);
      } catch (err: any) {
        console.error(`[Basket Execution] SELL leg failed:`, err.message);
        return NextResponse.json({
          success: false,
          error: `SELL leg failed: ${err.message}. (BUY legs executed successfully).`,
          buyResults,
          sellResults,
        }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Basket executed successfully. ${buyLegs.length} BUY legs and ${sellLegs.length} SELL legs placed.`,
      buyResults,
      sellResults,
    });

  } catch (error: any) {
    console.error('[Basket Execution] System error:', error);
    return NextResponse.json({ error: error.message || 'Basket execution failed.' }, { status: 500 });
  }
}
