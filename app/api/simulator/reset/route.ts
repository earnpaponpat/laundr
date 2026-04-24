import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();

    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData
      || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    if (!orgId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 });
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    // Call the heavy-duty reset and seed procedure
    const { data, error } = await supabase.rpc('reset_to_default', { 
      p_org_id: orgId,
      p_user_id: userId
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Simulator Reset Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
