import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/service-role';
import { z } from 'zod';

export const scanEventSchema = z.object({
  rfid_tag_id: z.string().min(1, "rfid_tag_id is required"),
  gate_id: z.string().min(1, "gate_id is required"),
  event_type: z.enum([
    "checkout",         // factory gate → in_transit
    "delivery_signed",  // manifest signed at client site → out
    "checkin",          // returned to factory gate → quality_check
    "inspection_pass",  // quality check passed → in_stock (wash_count++)
    "inspection_fail",  // quality check failed → rewash
    "audit",
    "rewash",
    "reject",
  ]),
  client_id: z.string().uuid("Invalid client_id UUID").optional().nullable(),
  scanned_at: z.string().datetime("invalid datetime ISO").optional(),
  org_id: z.string().uuid("Invalid org_id UUID"),
  source: z.string().optional(),
  batch_id: z.string().uuid("Invalid batch_id UUID").optional().nullable(),
});

export type ScanEventPayload = z.infer<typeof scanEventSchema>;

export async function processScanEvent(payload: ScanEventPayload) {
  const supabase = await createClient();

  // 2. Find internal item by rfid_tag_id and org_id
  const { data: item, error: itemError } = await supabase
    .from('linen_items')
    .select('id, status, wash_count')
    .eq('org_id', payload.org_id)
    .eq('rfid_tag_id', payload.rfid_tag_id)
    .single();

  if (itemError || !item) {
    return { success: false, warning: "unknown_tag", error: itemError?.message };
  }

  // 3. Deduplication: same tag + same event within 2 seconds
  const twoSecsAgo = new Date(Date.now() - 2000).toISOString();
  const { data: recentScan } = await supabase
    .from('scan_events')
    .select('id')
    .eq('org_id', payload.org_id)
    .eq('rfid_tag_id', payload.rfid_tag_id)
    .eq('event_type', payload.event_type)
    .gte('created_at', twoSecsAgo)
    .limit(1)
    .maybeSingle();

  if (recentScan) {
    return { success: true, skipped: true, warning: "duplicate_scan" };
  }

  // 6. Business logic warnings
  const warnings: string[] = [];
  if (payload.event_type === 'checkout' && (item.status === 'in_transit' || item.status === 'out')) {
    warnings.push("already_dispatched");
  }
  if (payload.event_type === 'delivery_signed' && item.status !== 'in_transit') {
    warnings.push("unexpected_delivery_sign");
  }
  if (payload.event_type === 'checkin' && item.status !== 'out') {
    warnings.push("unexpected_return");
  }
  if (payload.event_type === 'inspection_pass' && item.status !== 'quality_check') {
    warnings.push("unexpected_inspection");
  }
  if (payload.event_type === 'inspection_pass' && item.wash_count >= 180) {
    warnings.push("near_end_of_life");
  }

  // 4. Insert scan_events row
  const { data: newRow, error: insertError } = await supabase
    .from('scan_events')
    .insert({
      org_id: payload.org_id,
      rfid_tag_id: payload.rfid_tag_id,
      item_id: item.id,
      event_type: payload.event_type,
      client_id: payload.client_id || null,
      gate_id: payload.gate_id,
      batch_id: payload.batch_id || null,
      source: payload.source || null,
      created_at: payload.scanned_at || new Date().toISOString()
    })
    .select()
    .single();

  if (insertError || !newRow) {
    return { success: false, error: insertError?.message || 'Insert failed' };
  }

  // --- BROADCAST FALLBACK ---
  try {
    const adminSupabase = createAdminClient();
    const channelName = `broadcast-${payload.org_id}`;
    const channel = adminSupabase.channel(channelName);
    
    // Non-blocking wait: we resolve quickly to allow simulation to proceed
    // but give the broadcast a small window to ship.
    await new Promise<void>((resolve) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({
            type: 'broadcast',
            event: 'new-scan',
            payload: { ...newRow, source_method: 'broadcast' }
          });
          // Increased buffer slightly for better network reliability
          setTimeout(() => {
            adminSupabase.removeChannel(channel);
            resolve();
          }, 150); 
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          resolve(); 
        }
      });
      setTimeout(resolve, 250); // Balanced timeout for simulation speed vs reliability
    });
  } catch (broadcastErr) {
    console.error('Realtime broadcast failed:', broadcastErr);
  }

  // Evaluate the new status to return (mirrors the DB trigger logic)
  let new_status = item.status;
  if (payload.event_type === 'checkout')         new_status = 'in_transit';
  else if (payload.event_type === 'delivery_signed') new_status = 'out';
  else if (payload.event_type === 'checkin')     new_status = 'quality_check';
  else if (payload.event_type === 'inspection_pass') new_status = 'in_stock';
  else if (payload.event_type === 'inspection_fail') new_status = 'rewash';
  else if (payload.event_type === 'rewash')      new_status = 'rewash';
  else if (payload.event_type === 'reject')      new_status = 'rejected';

  // 7. Return expected shape
  return {
    success: true,
    item_id: item.id,
    new_status,
    warnings
  };
}
