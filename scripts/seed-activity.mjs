import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual .env.local parser
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase config in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🌱 Seeding dashboard activity data...\n');

  try {
    // 1. Get Organization ID
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', 'laundrytrack')
      .single();
    if (orgError) throw orgError;
    const orgId = org.id;

    // 2. Get some Linen Items and Clients
    const { data: items, error: itemsError } = await supabase
      .from('linen_items')
      .select('id, rfid_tag_id, client_id')
      .eq('org_id', orgId)
      .limit(100);
    if (itemsError) throw itemsError;

    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('org_id', orgId);
    if (clientsError) throw clientsError;

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // 3. Seed Routes
    console.log('🚚 Seeding Today\'s Routes...');
    const routeNames = ['North Pattaya (Hotel Row)', 'Walking Street & Jomtien', 'Naklua Industrial'];
    const routes = routeNames.map(name => ({
      org_id: orgId,
      name,
      status: 'active',
      scheduled_at: today.toISOString(),
      vehicle_plate: `${Math.floor(Math.random() * 9)}กข-${Math.floor(Math.random() * 9000 + 1000)}`,
      stops: JSON.stringify([
          { client: clients[0].name, status: 'completed' },
          { client: clients[1].name, status: 'pending' }
      ])
    }));
    const { error: routeError } = await supabase.from('routes').insert(routes);
    if (routeError) throw routeError;
    console.log(`✅ Seeded ${routes.length} active routes.\n`);

    // 4. Seed Scan Events (Yesterday)
    console.log('🕒 Seeding Yesterday\'s Activity...');
    const yesterdayEvents = [];
    for (let i = 0; i < 40; i++) {
        const item = items[Math.floor(Math.random() * items.length)];
        const eventType = i % 3 === 0 ? 'checkin' : 'checkout';
        yesterdayEvents.push({
            org_id: orgId,
            rfid_tag_id: item.rfid_tag_id,
            item_id: item.id,
            event_type: eventType,
            client_id: item.client_id,
            gate_id: 'gate_a',
            source: 'simulator',
            created_at: new Date(yesterday.getTime() + (i * 15 * 60000)).toISOString()
        });
    }
    const { error: ytdError } = await supabase.from('scan_events').insert(yesterdayEvents);
    if (ytdError) throw ytdError;
    console.log(`✅ Seeded ${yesterdayEvents.length} events for yesterday.\n`);

    // 5. Seed Scan Events (Today)
    console.log('⚡ Seeding Today\'s Activity...');
    const todayEvents = [];
    for (let i = 0; i < 25; i++) {
        const item = items[Math.floor(Math.random() * items.length)];
        const eventType = i % 4 === 0 ? 'checkin' : 'checkout';
        todayEvents.push({
            org_id: orgId,
            rfid_tag_id: item.rfid_tag_id,
            item_id: item.id,
            event_type: eventType,
            client_id: item.client_id,
            gate_id: i % 2 === 0 ? 'gate_a' : 'handheld_1',
            source: 'simulator',
            created_at: new Date(today.getTime() - (i * 20 * 60000)).toISOString() // Spreadsheet throughout the day
        });
    }
    const { error: todayError } = await supabase.from('scan_events').insert(todayEvents);
    if (todayError) throw todayError;
    console.log(`✅ Seeded ${todayEvents.length} events for today.\n`);

    // 6. Update some Item Statuses to make metrics interesting
    console.log('📉 Updating Item Statuses (Rewash/Lost/Out)...');
    // Set 10 items to rewash
    const { error: rewashError } = await supabase
        .from('linen_items')
        .update({ status: 'rewash' })
        .in('id', items.slice(0, 10).map(i => i.id));
    
    // Set 5 items to lost
    const { error: lostError } = await supabase
        .from('linen_items')
        .update({ status: 'lost' })
        .in('id', items.slice(10, 15).map(i => i.id));

    // Set 50 items to 'out' (checked out)
    const { error: outError } = await supabase
        .from('linen_items')
        .update({ status: 'out' })
        .in('id', items.slice(15, 65).map(i => i.id));

    if (rewashError || lostError || outError) console.warn('⚠️ Some status updates failed or matched no rows.');
    else console.log('✅ Updated status for 65 items.\n');

    console.log('🎉 ACTIVITY SEEDING COMPLETE!');
    console.log('The dashboard should now show live metrics, trends, and recent feed items.');

  } catch (err) {
    console.error('❌ SEED ERROR:', err);
    process.exit(1);
  }
}

main();
