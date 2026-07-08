import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { broker } = await request.json();

    if (!broker || (broker !== 'DHAN' && broker !== 'ANGELONE')) {
      return NextResponse.json({ error: 'Valid broker (DHAN or ANGELONE) is required' }, { status: 400 });
    }

    if (broker === 'DHAN') {
      console.log('[Symbol Sync] Fetching Dhan scrip master...');
      const res = await fetch('https://images.dhan.co/api-data/api-scrip-master.csv');
      
      if (!res.ok) {
        throw new Error(`Failed to fetch Dhan scrip master: ${res.statusText}`);
      }

      const text = await res.text();
      console.log('[Symbol Sync] Parsing Dhan scrip master CSV...');
      const lines = text.split(/\r?\n/);
      
      if (lines.length < 2) {
        throw new Error('CSV file is empty or invalid');
      }

      const headers = lines[0].split(',');
      const exchIdIdx = headers.indexOf('SEM_EXM_EXCH_ID');
      const segmentIdx = headers.indexOf('SEM_SEGMENT');
      const symbolIdx = headers.indexOf('SEM_TRADING_SYMBOL');
      const securityIdIdx = headers.indexOf('SEM_SMST_SECURITY_ID');

      if (exchIdIdx === -1 || segmentIdx === -1 || symbolIdx === -1 || securityIdIdx === -1) {
        throw new Error('Required CSV headers not found');
      }

      const symbolsToInsert: any[] = [];
      const seen = new Set<string>();

      // Parse lines
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',');
        if (cols.length < headers.length) continue;

        const segment = cols[segmentIdx].trim().toUpperCase();
        const exchange = cols[exchIdIdx].trim().toUpperCase();
        
        // Filter strictly for NSE and BSE Equities and Derivatives (Segment 'E' or 'D')
        if ((segment === 'E' || segment === 'D') && (exchange === 'NSE' || exchange === 'BSE')) {
          const symbol = cols[symbolIdx].trim();
          const token = cols[securityIdIdx].trim();
          const key = `${exchange}:${symbol}`;

          if (!seen.has(key)) {
            seen.add(key);
            const rawName = cols[15] || cols[7] || symbol;
            const name = rawName.trim().replace(/^"|"$/g, '') || `${symbol} Equity on ${exchange}`;
            
            const dbExchange = segment === 'D' ? `${exchange}_FNO` : `${exchange}_EQ`;
            symbolsToInsert.push({
              broker: 'DHAN',
              symbol: symbol,
              token: token,
              exchange: dbExchange,
              name: name,
            });
          }
        }
      }

      console.log(`[Symbol Sync] Found ${symbolsToInsert.length} Dhan Equity symbols. Clearing old data...`);
      
      // Delete old Dhan symbols
      await prisma.symbol.deleteMany({
        where: { broker: 'DHAN' },
      });

      console.log('[Symbol Sync] Inserting new Dhan symbols in chunks...');
      const chunkSize = 500;
      for (let i = 0; i < symbolsToInsert.length; i += chunkSize) {
        const chunk = symbolsToInsert.slice(i, i + chunkSize);
        await prisma.symbol.createMany({
          data: chunk,
        });
      }

      console.log('[Symbol Sync] Dhan sync completed!');
      return NextResponse.json({
        success: true,
        message: `Successfully synced ${symbolsToInsert.length} Dhan equity symbols.`,
      });

    } else if (broker === 'ANGELONE') {
      console.log('[Symbol Sync] Fetching AngelOne scrip master JSON...');
      const res = await fetch('https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json');
      
      if (!res.ok) {
        throw new Error(`Failed to fetch AngelOne scrip master: ${res.statusText}`);
      }

      const instruments = await res.json();
      console.log('[Symbol Sync] Parsing AngelOne scrip master...');

      if (!Array.isArray(instruments)) {
        throw new Error('AngelOne response is not a valid JSON array');
      }

      const symbolsToInsert: any[] = [];
      const seen = new Set<string>();

      for (const inst of instruments) {
        const exch = (inst.exch_seg || '').toUpperCase();
        const instType = (inst.instrumenttype || '').toUpperCase();
        const symbol = inst.symbol || '';
        const token = inst.token || '';
        
        // Filter strictly for NSE / BSE Equities and NFO / BFO F&O instruments
        const isEquity = (exch === 'NSE' || exch === 'BSE') && (!instType || instType === 'EQUITY') && symbol.endsWith('-EQ');
        const isFO = exch === 'NFO' || exch === 'BFO';
        
        if (isEquity || isFO) {
          const key = `${exch}:${symbol}`;
          if (!seen.has(key)) {
            seen.add(key);
            symbolsToInsert.push({
              broker: 'ANGELONE',
              symbol: symbol,
              token: token,
              exchange: exch,
              name: inst.name || `${symbol} on ${exch}`,
            });
          }
        }
      }

      console.log(`[Symbol Sync] Found ${symbolsToInsert.length} AngelOne Equity symbols. Clearing old data...`);
      
      // Delete old AngelOne symbols
      await prisma.symbol.deleteMany({
        where: { broker: 'ANGELONE' },
      });

      console.log('[Symbol Sync] Inserting new AngelOne symbols in chunks...');
      const chunkSize = 500;
      for (let i = 0; i < symbolsToInsert.length; i += chunkSize) {
        const chunk = symbolsToInsert.slice(i, i + chunkSize);
        await prisma.symbol.createMany({
          data: chunk,
        });
      }

      console.log('[Symbol Sync] AngelOne sync completed!');
      return NextResponse.json({
        success: true,
        message: `Successfully synced ${symbolsToInsert.length} AngelOne equity symbols.`,
      });
    }

    return NextResponse.json({ error: 'Unsupported broker' }, { status: 400 });

  } catch (error: any) {
    console.error('[Symbol Sync] Sync failed:', error);
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}
