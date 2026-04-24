import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canUseDriverApp, getDriverContext } from '@/lib/driver/context';

const schema = z.object({
  tags: z.array(z.string().min(1)).min(1),
  scan_type: z.enum(['deliver', 'collect']),
  session_id: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ stopId: string }> }
) {
  try {
    const { stopId } = await params;
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json({ error: 'validation_error', details: parsed.error.flatten() }, { status: 400 });
    }

    const ctx = await getDriverContext();
    if (!ctx) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    if (!canUseDriverApp(ctx.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const { data: stop } = await ctx.supabase
      .from('trip_stops')
      .select('id, trip_id, org_id, order_id, client_id, delivered_count, collected_count')
      .eq('id', stopId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (!stop) {
      return NextResponse.json({ error: 'stop_not_found' }, { status: 404 });
    }

    const { data: trip } = await ctx.supabase
      .from('delivery_trips')
      .select('id, driver_id, status')
      .eq('id', stop.trip_id)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (!trip) {
      return NextResponse.json({ error: 'trip_not_found' }, { status: 404 });
    }

    if (ctx.role === 'driver' && trip.driver_id !== ctx.userId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const { data: outboundBatch } = stop.order_id
      ? await ctx.supabase
          .from('delivery_batches')
          .select('id')
          .eq('org_id', ctx.orgId)
          .eq('order_id', stop.order_id)
          .eq('batch_type', 'outbound')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    if (parsed.data.scan_type === 'deliver' && !outboundBatch) {
      return NextResponse.json({ error: 'outbound_batch_not_found' }, { status: 404 });
    }

    const sessionSource = `driver_${parsed.data.scan_type}:${stopId}:${parsed.data.session_id}`;

    const { data: alreadyScanned } = await ctx.supabase
      .from('scan_events')
      .select('rfid_tag_id')
      .eq('org_id', ctx.orgId)
      .eq('source', sessionSource)
      .in('rfid_tag_id', parsed.data.tags);

    const alreadySet = new Set((alreadyScanned || []).map((row) => row.rfid_tag_id));

    const results: Array<{
      rfid_tag_id: string;
      result: 'added' | 'skipped' | 'error';
      code?: string;
      message?: string;
      item?: { category_name: string; status: string };
    }> = [];

    let addedCount = 0;
    for (const tag of parsed.data.tags) {
      if (alreadySet.has(tag)) {
        results.push({
          rfid_tag_id: tag,
          result: 'skipped',
          code: 'DUPLICATE',
          message: 'สแกนซ้ำในรอบนี้',
        });
        continue;
      }

      const { data: item } = await ctx.supabase
        .from('linen_items')
        .select('id, status, category_id, current_batch_id, linen_categories(name)')
        .eq('org_id', ctx.orgId)
        .eq('rfid_tag_id', tag)
        .maybeSingle();

      if (!item) {
        results.push({
          rfid_tag_id: tag,
          result: 'error',
          code: 'UNKNOWN_TAG',
          message: 'ไม่พบแท็กนี้ในระบบ',
        });
        continue;
      }

      const categoryRef = item.linen_categories as unknown;
      const categoryName = Array.isArray(categoryRef)
        ? (categoryRef[0] as { name?: string } | undefined)?.name || 'Category'
        : (categoryRef as { name?: string } | null)?.name || 'Category';

      if (parsed.data.scan_type === 'deliver') {
        if (item.current_batch_id !== outboundBatch?.id || item.status !== 'out') {
          results.push({
            rfid_tag_id: tag,
            result: 'error',
            code: 'NOT_IN_BATCH',
            message: 'ชิ้นนี้ไม่อยู่ในชุดส่งของจุดนี้',
            item: { category_name: categoryName, status: item.status },
          });
          continue;
        }

        const { error: insertError } = await ctx.supabase
          .from('scan_events')
          .insert({
            org_id: ctx.orgId,
            rfid_tag_id: tag,
            item_id: item.id,
            event_type: 'dispatch',
            client_id: stop.client_id,
            batch_id: outboundBatch?.id,
            order_id: stop.order_id,
            gate_id: 'driver_mobile',
            source: sessionSource,
            scanned_by: ctx.userId,
          });

        if (insertError) {
          results.push({
            rfid_tag_id: tag,
            result: 'error',
            code: 'INSERT_FAILED',
            message: 'บันทึกการสแกนไม่สำเร็จ',
          });
          continue;
        }
      } else {
        const { error: insertError } = await ctx.supabase
          .from('scan_events')
          .insert({
            org_id: ctx.orgId,
            rfid_tag_id: tag,
            item_id: item.id,
            event_type: 'checkin',
            client_id: stop.client_id,
            batch_id: outboundBatch?.id || null,
            order_id: stop.order_id,
            gate_id: 'driver_mobile',
            source: sessionSource,
            scanned_by: ctx.userId,
          });

        if (insertError) {
          results.push({
            rfid_tag_id: tag,
            result: 'error',
            code: 'INSERT_FAILED',
            message: 'บันทึกการสแกนไม่สำเร็จ',
          });
          continue;
        }

        await ctx.supabase
          .from('linen_items')
          .update({ status: 'dirty' })
          .eq('id', item.id)
          .eq('org_id', ctx.orgId);
      }

      addedCount += 1;
      results.push({
        rfid_tag_id: tag,
        result: 'added',
        item: { category_name: categoryName, status: item.status },
      });
    }

    const { count: sessionCount } = await ctx.supabase
      .from('scan_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', ctx.orgId)
      .eq('source', sessionSource);

    if (trip.status === 'pending') {
      await ctx.supabase
        .from('delivery_trips')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', trip.id)
        .eq('org_id', ctx.orgId);
    }

    await ctx.supabase
      .from('trip_stops')
      .update({ status: 'active' })
      .eq('id', stopId)
      .eq('org_id', ctx.orgId)
      .in('status', ['pending', 'active']);

    return NextResponse.json({
      results,
      running_totals: {
        session_count: Number(sessionCount || 0),
        delivered_count: parsed.data.scan_type === 'deliver'
          ? Number(stop.delivered_count || 0) + addedCount
          : Number(stop.delivered_count || 0),
        collected_count: parsed.data.scan_type === 'collect'
          ? Number(stop.collected_count || 0) + addedCount
          : Number(stop.collected_count || 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
