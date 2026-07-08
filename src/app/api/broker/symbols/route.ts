import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const broker = searchParams.get('broker')?.toUpperCase();
    const query = searchParams.get('q')?.toUpperCase() || '';

    if (!broker) {
      return NextResponse.json({ error: 'Broker parameter is required' }, { status: 400 });
    }

    if (query.length < 2) {
      return NextResponse.json([]);
    }

    if (broker === 'DHAN' || broker === 'ANGELONE') {
      const symbols = await prisma.symbol.findMany({
        where: {
          broker,
          symbol: {
            contains: query,
          },
        },
        take: 20,
      });
      return NextResponse.json(symbols);
    } else if (broker === 'FYERS') {
      // For Fyers, search Dhan symbols and map them to Fyers' format "EXCHANGE:SYMBOL-EQ"
      const symbols = await prisma.symbol.findMany({
        where: {
          broker: 'DHAN',
          symbol: {
            contains: query,
          },
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
