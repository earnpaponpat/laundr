import { createClient } from '@/lib/supabase/server';

export type DriverRole = 'admin' | 'manager' | 'staff' | 'driver';

export type DriverContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  orgId: string;
  role: DriverRole;
  fullName: string;
};

export async function getDriverContext(): Promise<DriverContext | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.org_id || !profile?.role) {
    return null;
  }

  return {
    supabase,
    userId,
    orgId: profile.org_id,
    role: profile.role as DriverRole,
    fullName: profile.full_name || 'Driver',
  };
}

export function canUseDriverApp(role: DriverRole): boolean {
  return role === 'driver' || role === 'admin';
}

export function canUseDashboard(role: DriverRole): boolean {
  return role === 'admin' || role === 'manager' || role === 'staff';
}
