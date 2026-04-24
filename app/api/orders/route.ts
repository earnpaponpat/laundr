import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const createOrderSchema = z.object({
  client_id: z.string().uuid(),
  scheduled_date: z.string().min(1),
  driver_id: z.string().uuid().nullable().optional(),
  vehicle_plate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        qty: z.number().int().min(1, 'qty must be at least 1').max(999, 'qty cannot exceed 999'),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_error', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId =
      orgData ||
      (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    if (!orgId) {
      return NextResponse.json({ error: 'org_not_found' }, { status: 400 });
    }

    const validItems = parsed.data.items;
    const categoryIds = validItems.map((i) => i.category_id);
    if (new Set(categoryIds).size !== categoryIds.length) {
      return NextResponse.json({ error: 'duplicate_category' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase
      .from('delivery_orders')
      .insert({
        org_id: orgId,
        // Fallback for environments where trigger is not yet installed.
        // If set_order_number trigger exists, it overrides this value.
        order_number: 'PENDING',
        client_id: parsed.data.client_id,
        driver_id: parsed.data.driver_id ?? null,
        vehicle_plate: parsed.data.vehicle_plate ?? null,
        notes: parsed.data.notes ?? null,
        scheduled_date: parsed.data.scheduled_date,
        status: 'draft',
      })
      .select('id, order_number')
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: orderError?.message ?? 'create_order_failed' },
        { status: 500 }
      );
    }

    const { error: itemError } = await supabase.from('delivery_order_items').insert(
      validItems.map((item) => ({
        order_id: order.id,
        category_id: item.category_id,
        requested_qty: item.qty,
        picked_qty: 0,
        returned_qty: 0,
      }))
    );

    if (itemError) {
      return NextResponse.json(
        { error: itemError.message, order_id: order.id },
        { status: 500 }
      );
    }

    return NextResponse.json({ order_id: order.id, order_number: order.order_number });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
