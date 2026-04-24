import { createClient } from '@/lib/supabase/server';
import { getDemoDriverProfile, isDriverDemoBypassEnabled } from '@/lib/driver/demo';

export type DriverRole = 'admin' | 'manager' | 'staff' | 'driver';

export type DriverContext = {
  supabase: Awaited<ReturnType<typeof createClient>> | null;
  userId: string;
  orgId: string;
  role: DriverRole;
  fullName: string;
  demoMode?: boolean;
};

export async function getDriverContext(): Promise<DriverContext | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    if (!isDriverDemoBypassEnabled()) {
      return null;
    }

    const driver = getDemoDriverProfile();
    return {
      supabase: null,
      userId: driver.id,
      orgId: '00000000-0000-0000-0000-000000000001',
      role: 'driver',
      fullName: driver.full_name,
      demoMode: true,
    };
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
