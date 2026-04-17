import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read env from .env.local
const env = {};
try {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  envFile.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
  });
} catch (e) {
  console.error('Could not read .env.local');
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function seedDrivers() {
  console.log('--- Seeding Drivers ---');

  // 1. Get Org
  const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
  if (!org) {
    console.error('No organization found. Please run the initial schema first.');
    return;
  }
  const orgId = org.id;

  const driversToSeed = [
    { email: 'driver1@laundrytrack.app', name: 'Somchai Driver' },
    { email: 'driver2@laundrytrack.app', name: 'Wichai Trucker' },
  ];

  for (const d of driversToSeed) {
    console.log(`Checking/Creating user: ${d.email}`);
    
    // Create Auth User
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: d.email,
      password: 'password123',
      email_confirm: true
    });

    if (userError && !userError.message.includes('already registered')) {
      console.error(`Error creating user ${d.email}:`, userError.message);
      continue;
    }

    // Get the ID (either newly created or existing)
    let userId;
    if (userData?.user) {
      userId = userData.user.id;
    } else {
      // Find existing user
      const { data: users } = await supabase.auth.admin.listUsers();
      userId = users.users.find(u => u.email === d.email)?.id;
    }

    if (!userId) {
      console.error(`Could not find or create user for ${d.email}`);
      continue;
    }

    // Create Profile
    console.log(`Creating profile for ${d.name} (${userId})`);
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      org_id: orgId,
      full_name: d.name,
      role: 'driver'
    });

    if (profileError) {
      console.error(`Error creating profile for ${d.name}:`, profileError.message);
    } else {
      console.log(`Successfully seeded ${d.name}`);
    }
  }

  console.log('--- Seeding Complete ---');
}

seedDrivers();
