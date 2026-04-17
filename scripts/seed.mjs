import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual .env.local parser to avoid dependency on 'dotenv'
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
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🌱 Starting database seed script (MJS version)...\n');

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
      console.warn('   (Register a user in Supabase first).');
    } else {
      const firstUser = users[0];
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ 
          id: firstUser.id, 
          org_id: org.id, 
          full_name: 'Super Admin', 
          role: 'admin' 
        });
        
      if (profileError) throw profileError;
      assignedAdmin = true;
      console.log(`✅ Assigned admin: ${firstUser.email}\n`);
    }

    // 3. Linen Categories
    console.log('3️⃣ Seeding Linen Categories...');
    const categories = [
      { name: 'Bed Sheet', lifespan_cycles: 200, replacement_cost: 350, code: 'BS', count: 150 },
      { name: 'Bath Towel (Large)', lifespan_cycles: 200, replacement_cost: 180, code: 'BT', count: 100 },
      { name: 'Bath Towel (Small)', lifespan_cycles: 200, replacement_cost: 80, code: 'ST', count: 80 },
      { name: 'Staff Uniform', lifespan_cycles: 150, replacement_cost: 450, code: 'UF', count: 80 },
      { name: 'Duvet Cover', lifespan_cycles: 200, replacement_cost: 600, code: 'DC', count: 60 },
      { name: 'Apron', lifespan_cycles: 100, replacement_cost: 120, code: 'AP', count: 30 },
    ];

    const categoryMap = new Map();
    for (const cat of categories) {
      // First, try to fetch existing
      const { data: existing } = await supabase
        .from('linen_categories')
        .select('id')
        .eq('org_id', org.id)
        .eq('name', cat.name)
        .single();

      if (existing) {
        categoryMap.set(cat.name, { id: existing.id, code: cat.code, count: cat.count });
      } else {
        const { data: newCat, error: catError } = await supabase
          .from('linen_categories')
          .insert({
            org_id: org.id,
            name: cat.name,
            lifespan_cycles: cat.lifespan_cycles,
            replacement_cost: cat.replacement_cost,
          })
          .select()
          .single();
        if (catError) throw catError;
        categoryMap.set(cat.name, { id: newCat.id, code: cat.code, count: cat.count });
      }
    }
    console.log(`✅ Seeded ${categories.length} Categories\n`);

    // 4. Clients
    console.log('4️⃣ Seeding Clients...');
    const hotels = ['Hilton Pattaya', 'Royal Cliff Beach Hotel', 'Hard Rock Hotel Pattaya', 'Centara Grand Mirage Beach Resort', 'Dusit Thani Pattaya'];
    const clientIds = [];
    for (const hotel of hotels) {
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('org_id', org.id)
        .eq('name', hotel)
        .single();

      if (existing) {
        clientIds.push(existing.id);
      } else {
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({ org_id: org.id, name: hotel, active: true })
          .select()
          .single();
        if (clientError) throw clientError;
        clientIds.push(newClient.id);
      }
    }
    console.log(`✅ Seeded ${hotels.length} Clients\n`);

    // 5. Linen Items
    console.log('5️⃣ Seeding 500 Linen Items...');
    const items = [];
    for (const [catName, cat] of categoryMap) {
      for (let i = 1; i <= cat.count; i++) {
        items.push({
          org_id: org.id,
          rfid_tag_id: `TG-${cat.code}-${String(i).padStart(6, '0')}`,
          category_id: cat.id,
          client_id: clientIds[Math.floor(Math.random() * clientIds.length)],
          status: 'in_stock',
          wash_count: Math.floor(Math.random() * 181),
        });
      }
    }

    // Chunked insert
    for (let i = 0; i < items.length; i += 100) {
      const chunk = items.slice(i, i + 100);
      const { error } = await supabase.from('linen_items').upsert(chunk, { onConflict: 'org_id,rfid_tag_id' });
      if (error) throw error;
    }

    console.log('✅ SEED SUCCESSFUL!');
  } catch (err) {
    console.error('❌ SEED ERROR:', err);
    process.exit(1);
  }
}

main();
