import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArg(name: string, fallback: number): number {
  const token = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!token) return fallback;
  const n = Number(token.split('=')[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const envLocal = parseEnvFile(path.resolve(process.cwd(), '.env.local'));
  const env = { ...envLocal, ...process.env };

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const orgId = env.SEED_ORG_ID || process.argv.find((arg) => arg.startsWith('--org='))?.split('=')[1];

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!orgId) {
    throw new Error('Missing org id. Pass --org=<uuid> or set SEED_ORG_ID.');
  }

  const daysBack = parseArg('days', 90);
  const dailyVolume = parseArg('daily', 500);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Building historical dataset for org ${orgId}`);
  console.log(`days_back=${daysBack}, daily_volume=${dailyVolume}`);

  const now = new Date();
  const records: Array<Record<string, unknown>> = [];

  for (let dayOffset = daysBack; dayOffset >= 1; dayOffset -= 1) {
    const dayDate = new Date(now);
    dayDate.setDate(now.getDate() - dayOffset);

    const dayOfWeek = dayDate.getDay();
    let factor = 1;
    if (dayOfWeek === 6) factor = 0.7;
    if (dayOfWeek === 0) factor = 0.4;

    const weekNum = Math.ceil((daysBack - dayOffset + 1) / 7);
    let lossRate = 0.03;
    let rewashRate = 0.03;
    if (weekNum === 3) lossRate = 0.08;
    if (weekNum === 6) rewashRate = 0.1;
    if (weekNum === 8) lossRate = 0.005;

    const dayTotal = Math.max(1, Math.floor(dailyVolume * factor));
    const dispatchCount = Math.floor(dayTotal * 0.8);
    const returnCount = Math.floor(dispatchCount * (1 - lossRate));
    const rewashCount = Math.floor(returnCount * rewashRate);

    for (let i = 0; i < dispatchCount; i += 1) {
      const ts = new Date(dayDate);
      ts.setHours(7, Math.floor((i / Math.max(1, dispatchCount)) * 60), Math.floor(Math.random() * 60), 0);
      records.push({
        org_id: orgId,
        rfid_tag_id: `HIST-${dayDate.toISOString().slice(0, 10)}-D-${String(i).padStart(6, '0')}`,
        event_type: 'dispatch',
        gate_id: 'gate_a',
        source: 'seed_historical_script',
        created_at: ts.toISOString(),
      });
    }

    for (let i = 0; i < returnCount; i += 1) {
      const ts = new Date(dayDate);
      ts.setHours(14, Math.floor((i / Math.max(1, returnCount)) * 60), Math.floor(Math.random() * 60), 0);
      records.push({
        org_id: orgId,
        rfid_tag_id: `HIST-${dayDate.toISOString().slice(0, 10)}-R-${String(i).padStart(6, '0')}`,
        event_type: 'checkin',
        gate_id: 'gate_b',
        source: 'seed_historical_script',
        created_at: ts.toISOString(),
      });
    }

    for (let i = 0; i < rewashCount; i += 1) {
      const ts = new Date(dayDate);
      ts.setHours(18, Math.floor((i / Math.max(1, rewashCount)) * 60), Math.floor(Math.random() * 60), 0);
      records.push({
        org_id: orgId,
        rfid_tag_id: `HIST-${dayDate.toISOString().slice(0, 10)}-W-${String(i).padStart(6, '0')}`,
        event_type: 'qc_rewash',
        gate_id: 'qc_1',
        source: 'seed_historical_script',
        created_at: ts.toISOString(),
      });
    }
  }

  console.log(`Generated ${records.length.toLocaleString()} records in memory`);

  const chunks: Array<Array<Record<string, unknown>>> = [];
  for (let i = 0; i < records.length; i += 1000) {
    chunks.push(records.slice(i, i + 1000));
  }

  for (let i = 0; i < chunks.length; i += 1) {
    const payload = chunks[i];
    const { error } = await supabase.from('scan_events').insert(payload);
    if (error) {
      console.error(`Chunk ${i + 1}/${chunks.length} failed:`, error.message);
      throw error;
    }

    console.log(`Inserting chunk ${i + 1}/${chunks.length}... (${payload.length} rows)`);
    await sleep(100);
  }

  console.log('Historical seed complete');
  console.log(`Total inserted rows: ${records.length.toLocaleString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
