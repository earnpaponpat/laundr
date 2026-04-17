import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) env[key.trim()] = valueParts.join('=').trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('📦 Seeding delivery batches for previous checkout events...');
  
  const { data: events, error } = await supabase
    .from('scan_events')
    .select('id, org_id, client_id, route_id, created_at, batch_id')
    .eq('event_type', 'checkout');

  if (error || !events || events.length === 0) {
    console.log('No unbatched checkout events found.');
    process.exit(0);
  }

  const unbatched = events.filter(e => !e.batch_id);
  if (unbatched.length === 0) {
    console.log('All checkouts already have a batch.');
    process.exit(0);
  }

  const batches = new Map();
  
  unbatched.forEach(e => {
    if (!e.client_id) return;
    const date = e.created_at.split('T')[0];
    const key = `${e.client_id}_${date}`;
    if (!batches.has(key)) {
      batches.set(key, { org_id: e.org_id, client_id: e.client_id, created_at: e.created_at, events: [] });
    }
    batches.get(key).events.push(e.id);
  });

  for (const [key, batchData] of batches) {
    const { data: newBatch, error: err } = await supabase
      .from('delivery_batches')
      .insert({
        org_id: batchData.org_id,
        client_id: batchData.client_id,
        batch_type: 'outbound',
        total_items: batchData.events.length,
        created_at: batchData.created_at
      })
      .select('id')
      .single();

    if (err) throw err;

    await supabase
      .from('scan_events')
      .update({ batch_id: newBatch.id })
      .in('id', batchData.events);
      
    console.log(`✅ Created batch ${newBatch.id} for client ${batchData.client_id} with ${batchData.events.length} items.`);
  }
  console.log('Done!');
}
main();
