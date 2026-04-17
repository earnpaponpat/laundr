import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// Bypass RLS with Service Role Key
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('🌱 Starting database seed script...\n');

  try {
    // 1. Organization
    console.log('1️⃣ Seeding Organization...');
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .upsert(
        { name: 'LaundryTrack', slug: 'laundrytrack' }, 
        { onConflict: 'slug' }
      )
      .select()
      .single();

    if (orgError) throw orgError;
    console.log(`✅ Organization created: ${org.name} (Slug: ${org.slug})\n`);

    // 2. Profile (admin)
    console.log('2️⃣ Seeding Admin Profile...');
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) throw authError;

    const users = authData.users;
    let assignedAdmin = false;
    
    if (users.length === 0) {
      console.warn('⚠️ No users found in Supabase Auth. Skipping admin profile generation.');
      console.warn('   (Please register a user in Supabase first, then run seed again to assign admin).');
    } else {
      // Pick the first user or the one currently logged in
      const firstUser = users[0];
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          { 
            id: firstUser.id, 
            org_id: org.id, 
            full_name: 'Super Admin', 
            role: 'admin' 
          },
          { onConflict: 'id' } // Upsert based on User ID
        );
        
      if (profileError) throw profileError;
      assignedAdmin = true;
      console.log(`✅ Assigned admin role to user ID: ${firstUser.id} (${firstUser.email})\n`);
    }

    // 3. Linen Categories
    console.log('3️⃣ Seeding Linen Categories...');
    const categoryDefinitions = [
      { name: 'Bed Sheet', lifespan_cycles: 200, replacement_cost: 350, code: 'BS', count: 150 },
      { name: 'Bath Towel (Large)', lifespan_cycles: 200, replacement_cost: 180, code: 'BT', count: 100 },
      { name: 'Bath Towel (Small)', lifespan_cycles: 200, replacement_cost: 80, code: 'ST', count: 80 },
      { name: 'Staff Uniform', lifespan_cycles: 150, replacement_cost: 450, code: 'UF', count: 80 },
      { name: 'Duvet Cover', lifespan_cycles: 200, replacement_cost: 600, code: 'DC', count: 60 },
      { name: 'Apron', lifespan_cycles: 100, replacement_cost: 120, code: 'AP', count: 30 },
    ];

    const categoryMap = new Map<string, { id: string; code: string; count: number }>();

    for (const cat of categoryDefinitions) {
      const { data: catData, error: catError } = await supabase
        .from('linen_categories')
        .insert({
          org_id: org.id,
          name: cat.name,
          lifespan_cycles: cat.lifespan_cycles,
          replacement_cost: cat.replacement_cost,
        })
        .select()
        .single();

      if (catError) {
        // If it already exists, just fetch it
        const { data: existingData } = await supabase
           .from('linen_categories')
           .select('id')
           .eq('name', cat.name)
           .eq('org_id', org.id)
           .single();
           
        if(existingData) {
           categoryMap.set(cat.name, { id: existingData.id, code: cat.code, count: cat.count });
        } else {
           throw catError;
        }
      } else {
        categoryMap.set(cat.name, { id: catData.id, code: cat.code, count: cat.count });
      }
    }
    console.log(`✅ Seeded ${categoryDefinitions.length} Linen Categories\n`);

    // 4. Clients
    console.log('4️⃣ Seeding Clients / Hotels...');
    const hotelNames = [
      'Hilton Pattaya',
      'Royal Cliff Beach Hotel',
      'Hard Rock Hotel Pattaya',
      'Centara Grand Mirage Beach Resort',
      'Dusit Thani Pattaya'
    ];

    const clientIds: string[] = [];
    for (const hotel of hotelNames) {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .insert({
          org_id: org.id,
          name: hotel,
          active: true,
        })
        .select()
        .single();
        
      if (clientError) {
        const { data: existingClient } = await supabase
           .from('clients')
           .select('id')
           .eq('name', hotel)
           .eq('org_id', org.id)
           .single();
        if (existingClient) clientIds.push(existingClient.id);
        else throw clientError;
      } else {
        clientIds.push(clientData.id);
      }
    }
    console.log(`✅ Seeded ${hotelNames.length} Hotels in Pattaya\n`);

    // 5. Linen Items
    console.log('5️⃣ Seeding 500 Linen Items...');
    const itemsToInsert = [];
    
    // Clear old items for idempotency (optional, but good for local seed scripts)
    const { error: deleteError } = await supabase.from('linen_items').delete().eq('org_id', org.id);
    if(deleteError) console.warn('Warning: Could not clear old linen items (maybe due to FK constraint). Proceeding to seed new ones.');
    
    for (const catName of categoryMap.keys()) {
      const catData = categoryMap.get(catName)!;
      for (let i = 1; i <= catData.count; i++) {
        // Randomly assign to a client
        const randomClientId = clientIds[Math.floor(Math.random() * clientIds.length)];
        
        // Random wash count between 0 and 180
        const randomWashCount = Math.floor(Math.random() * 181);
        
        // Generate Tag ID e.g. TG-BS-000001
        const rfidTagId = `TG-${catData.code}-${String(i).padStart(6, '0')}`;
        
        itemsToInsert.push({
          org_id: org.id,
          rfid_tag_id: rfidTagId,
          category_id: catData.id,
          client_id: randomClientId,
          status: 'in_stock',
          wash_count: randomWashCount,
        });
      }
    }

    // Insert to DB using chunks just in case of payload size limits, though 500 is very small
    const chunkSize = 100;
    let insertedCount = 0;
    for (let i = 0; i < itemsToInsert.length; i += chunkSize) {
      const chunk = itemsToInsert.slice(i, i + chunkSize);
      const { error: insertError } = await supabase.from('linen_items').insert(chunk);
      if (insertError) throw insertError;
      insertedCount += chunk.length;
    }
    console.log(`✅ Seeded ${insertedCount} Linen Items (Status: in_stock)\n`);

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 SEEDING SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Organization : 1 (LaundryTrack)`);
    console.log(`Admin User   : ${assignedAdmin ? 'Yes' : 'No (auth.users empty)'}`);
    console.log(`Categories   : 6 types (${categoryDefinitions.reduce((a, b) => a + b.count, 0)} distributed tag rules)`);
    console.log(`Clients      : 5 hotels in Pattaya`);
    console.log(`Linen Items  : ${insertedCount} tags registered`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('You are ready to go!');
    
  } catch (err) {
    console.error('\n❌ An error occurred during database seeding:');
    console.error(err);
    process.exit(1);
  }
}

main();
