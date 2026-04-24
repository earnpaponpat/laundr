import { NextResponse } from 'next/server';
import { processScanEventsBatch, scanBatchSchema } from '@/lib/rfid/scan-processor';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const normalizedBody =
      body && Array.isArray(body.events)
        ? body
        : {
            events: [
              {
                rfid_tag_id: body?.rfid_tag_id,
                gate_id: body?.gate_id,
                event_type: body?.event_type,
                batch_id: body?.batch_id ?? null,
                order_id: body?.order_id ?? null,
                weight_kg: body?.weight_kg ?? null,
              },
            ],
            org_id: body?.org_id,
            source: body?.source,
            session_id: body?.session_id,
          };
    const validation = scanBatchSchema.safeParse(normalizedBody);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'validation_error',
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    // NOTE: Supabase JS does not provide a true multi-statement transaction API from this route.
    // This processes the batch in one request and returns per-tag results in order.
    const results = await processScanEventsBatch(validation.data);
    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Scan events batch processor error:', message);
    return NextResponse.json(
      { success: false, error: 'internal_server_error' },
      { status: 500 }
    );
  }
}
