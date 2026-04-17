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
  const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
  const { data: client } = await supabase.from('clients').select('id, name').limit(1).single();
  
  if (!org || !client) process.exit(1);

  // 1. Create a dummy batch
  const { data: batch } = await supabase.from('delivery_batches').insert({
    org_id: org.id,
    client_id: client.id,
    batch_type: 'outbound',
    total_items: 20
  }).select().single();

  console.log(`Created batch ${batch.id} for ${client.name}`);

  // 2. Fetch some items to create fake events for
  const { data: items } = await supabase.from('linen_items').select('*').limit(20);
  
  // 3. Create checkout events 2 days ago linked to this batch
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  
  for (let i = 0; i < items.length; i++) {
    await supabase.from('scan_events').insert({
      org_id: org.id,
      rfid_tag_id: items[i].rfid_tag_id,
      item_id: items[i].id,
      event_type: 'checkout',
      client_id: client.id,
      batch_id: batch.id,
      created_at: twoDaysAgo.toISOString()
    });
  }

  // 4. Create returned/rewash events for SOME of them 1 day ago
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  for (let i = 0; i < 15; i++) {
    const isRewash = i % 5 === 0;
    await supabase.from('scan_events').insert({
      org_id: org.id,
      rfid_tag_id: items[i].rfid_tag_id,
      item_id: items[i].id,
      event_type: isRewash ? 'rewash' : 'checkin',
      client_id: client.id,
      created_at: oneDayAgo.toISOString()
    });
  }
  
  console.log('✅ Created 20 checkouts, 12 returned, 3 rewash, and 5 missing items perfectly for Reconcile test!');
}
main();
