"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, AlertTriangle, RefreshCw, Package, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: 'lost' | 'eol' | 'rewash' | 'reconcile';
  title: string;
  time: Date;
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData
      || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    if (!orgId) { setLoading(false); return; }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: lostItems },
      { data: eolItems },
      { data: stuckRewash },
      { data: missingBatches },
    ] = await Promise.all([
      // Lost items in last 7 days — join to clients
      supabase
        .from('linen_items')
        .select('id, updated_at, clients(name)')
        .eq('org_id', orgId)
        .eq('status', 'lost')
        .gte('updated_at', sevenDaysAgo)
        .limit(10),

      // Near end-of-life items by category
      supabase
        .from('linen_items')
        .select('id, linen_categories(name)')
        .eq('org_id', orgId)
        .gte('wash_count', 180)
        .limit(100),

      // Rewash records stuck > 3 days
      supabase
        .from('rewash_records')
        .select('id, created_at')
        .eq('org_id', orgId)
        .eq('resolved', false)
        .lt('created_at', threeDaysAgo)
        .limit(50),

      // Delivery batches with missing items older than 24h
      supabase
        .from('delivery_batches')
        .select('id, created_at, total_items, returned_items, clients(name)')
        .eq('org_id', orgId)
        .lt('created_at', oneDayAgo)
        .limit(20),
    ]);

    const notifs: Notification[] = [];

    // Lost items notification
    if (lostItems && lostItems.length > 0) {
      const clientName = (lostItems[0].clients as any)?.name;
      notifs.push({
        id: 'lost',
        type: 'lost',
        title: `${lostItems.length} item${lostItems.length > 1 ? 's' : ''} marked as lost${clientName ? ` — ${clientName}` : ''}`,
        time: new Date(lostItems[0].updated_at),
      });
    }

    // EOL notification — group by category
    if (eolItems && eolItems.length > 0) {
      const catCounts: Record<string, number> = {};
      eolItems.forEach((item: any) => {
        const cat = item.linen_categories?.name || 'Unknown';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
      Object.entries(catCounts).slice(0, 3).forEach(([cat, count], i) => {
        notifs.push({
          id: `eol-${i}`,
          type: 'eol',
          title: `${count} items need replacement — ${cat}`,
          time: new Date(),
        });
      });
    }

    // Stuck rewash notification
    if (stuckRewash && stuckRewash.length > 0) {
      notifs.push({
        id: 'rewash',
        type: 'rewash',
        title: `${stuckRewash.length} items stuck in rewash queue`,
        time: new Date(stuckRewash[0].created_at),
      });
    }

    // Missing items from batches
    if (missingBatches) {
      missingBatches
        .filter((b: any) => (b.returned_items ?? 0) < (b.total_items ?? 0))
        .slice(0, 3)
        .forEach((b: any) => {
          const missing = (b.total_items ?? 0) - (b.returned_items ?? 0);
          const client = (b.clients as any)?.name || 'Unknown';
          notifs.push({
            id: `batch-${b.id}`,
            type: 'reconcile',
            title: `Batch from ${client} has ${missing} missing items`,
            time: new Date(b.created_at),
          });
        });
    }

    setNotifications(notifs);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  const iconMap = {
    lost: { icon: AlertTriangle, bg: 'bg-red-100', color: 'text-red-600' },
    eol: { icon: Package, bg: 'bg-orange-100', color: 'text-orange-600' },
    rewash: { icon: RefreshCw, bg: 'bg-amber-100', color: 'text-amber-600' },
    reconcile: { icon: Users, bg: 'bg-indigo-100', color: 'text-indigo-600' },
  };

  const count = notifications.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors relative">
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-xl" align="end">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
          {count > 0 && (
            <button
              onClick={() => setNotifications([])}
              className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-xs text-slate-400">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <Bell className="w-8 h-8 text-slate-200" />
              <p className="text-sm text-slate-400 font-medium">All caught up!</p>
              <p className="text-xs text-slate-300">No new notifications</p>
            </div>
          ) : (
            notifications.map((n) => {
              const cfg = iconMap[n.type];
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  className="flex gap-3 p-3 hover:bg-slate-50 border-b border-slate-100 cursor-pointer last:border-0"
                >
                  <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 leading-snug">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDistanceToNow(n.time, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
