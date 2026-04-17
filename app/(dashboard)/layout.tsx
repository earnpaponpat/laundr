import React from 'react';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Topbar } from '@/components/dashboard/Topbar';
import { HeaderActionsProvider } from '@/lib/contexts/HeaderActionsContext';
import { RealtimeProvider } from '@/lib/contexts/RealtimeContext';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id || '';

  return (
    <HeaderActionsProvider>
      <RealtimeProvider initialOrgId={orgId}>
        <div className="flex h-screen bg-[#F1F5F9] text-slate-900 overflow-hidden">
          {/* Redesigned Sidebar */}
          <Sidebar />

          <div className="flex-1 flex flex-col min-w-0">
            {/* Redesigned Topbar */}
            <Topbar />

            {/* Main Workspace with increased padding */}
            <main className="flex-1 overflow-auto p-10 lg:p-12 scrollbar-hide">
              <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700">
                {children}
              </div>
            </main>
          </div>
        </div>
      </RealtimeProvider>
    </HeaderActionsProvider>
  );
}
