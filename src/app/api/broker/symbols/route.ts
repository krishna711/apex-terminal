import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const broker = searchParams.get('broker')?.toUpperCase();
    const query = searchParams.get('q')?.toUpperCase() || '';
    const reqExchange = searchParams.get('exchange')?.toUpperCase();

    if (!broker) {
      return NextResponse.json({ error: 'Broker parameter is required' }, { status: 400 });
    }

    if (query.length < 2) {
      return NextResponse.json([]);
    }

    // Map requested exchange to database exchange formats
    let dbExchanges: string[] = [];
    if (reqExchange) {
      if (reqExchange === 'NSE') {
        dbExchanges = ['NSE_EQ', 'NSE'];
      } else if (reqExchange === 'BSE') {
        dbExchanges = ['BSE_EQ', 'BSE'];
      } else if (reqExchange === 'NFO') {
        dbExchanges = ['NSE_FNO', 'NFO'];
      } else if (reqExchange === 'BFO') {
        dbExchanges = ['BSE_FNO', 'BFO'];
      } else {
        dbExchanges = [reqExchange];
      }
    }

    const whereClause: any = {
      symbol: {
        contains: query,
      },
    };

    if (dbExchanges.length > 0) {
      whereClause.exchange = { in: dbExchanges };
    }

    if (broker === 'DHAN' || broker === 'ANGELONE') {
      const symbols = await prisma.symbol.findMany({
        where: {
          broker,
          ...whereClause,
        },
        take: 20,
      });
      return NextResponse.json(symbols);
    } else if (broker === 'FYERS') {
      // For Fyers, search Dhan symbols and map them to Fyers' format "EXCHANGE:SYMBOL-EQ"
      const symbols = await prisma.symbol.findMany({
        where: {
          broker: 'DHAN',
          ...whereClause,
        },
        take: 20,
      });

      const fyersSymbols = symbols.map(s => ({
        id: s.id,
        broker: 'FYERS',
        symbol: `${s.exchange}:${s.symbol}-EQ`,
        token: `${s.exchange}:${s.symbol}-EQ`, // Fyers uses symbol as token
        exchange: s.exchange,
        name: s.name.replace('Equity on ', ''),
      }));

      return NextResponse.json(fyersSymbols);
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });
  } catch (error: any) {
    console.error('Symbol search failed:', error);
    return NextResponse.json({ error: error.message || 'Symbol search failed' }, { status: 500 });
  }
}
