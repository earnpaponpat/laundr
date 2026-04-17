import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchOpenRouter } from '@/lib/openrouter';
import { startOfDay } from 'date-fns';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const language: 'en' | 'th' = body.language === 'th' ? 'th' : 'en';

    const supabase = await createClient();
    const today = startOfDay(new Date()).toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: checkoutToday },
      { count: checkinToday },
      { data: clientBatches },
      { count: missingItems },
      { count: nearEolItems },
      { data: rewashReasons }
    ] = await Promise.all([
      supabase.from('scan_events').select('*', { count: 'exact', head: true }).eq('event_type', 'checkout').gte('created_at', today),
      supabase.from('scan_events').select('*', { count: 'exact', head: true }).eq('event_type', 'checkin').gte('created_at', today),
      supabase.from('delivery_batches').select('client_id, total_items, returned_items, clients(name)').order('created_at', { ascending: false }).limit(20),
      supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('status', 'out').lt('last_scan_at', threeDaysAgo),
      supabase.from('linen_items').select('*', { count: 'exact', head: true }).gte('wash_count', 180),
      supabase.from('rewash_records').select('reason').eq('resolved', false)
    ]);

    const clientPerformance: Record<string, { total: number; returned: number; name: string }> = {};
    clientBatches?.forEach((b: any) => {
      if (!clientPerformance[b.client_id]) {
        clientPerformance[b.client_id] = { total: 0, returned: 0, name: b.clients?.name || 'Unknown' };
      }
      clientPerformance[b.client_id].total += b.total_items || 0;
      clientPerformance[b.client_id].returned += b.returned_items || 0;
    });

    const worstClients = Object.values(clientPerformance)
      .map(c => ({ ...c, rate: c.total > 0 ? (c.returned / c.total) * 100 : 100 }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3);

    const reasons: Record<string, number> = {};
    rewashReasons?.forEach((r: any) => {
      reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    });

    const dashboardData = {
      ops_today: { checkout: checkoutToday, checkin: checkinToday },
      inventory_health: { missing_3dPlus: missingItems, near_eol: nearEolItems },
      rewash_reasons: reasons,
      worst_performing_clients: worstClients
    };

    const langInstruction = language === 'th'
      ? 'ตอบเป็นภาษาไทย'
      : 'Respond in English';

    const systemPrompt = language === 'th'
      ? `คุณคือ AI Assistant สำหรับระบบ LaundryTrack ระบบบริหารจัดการผ้าในโรงงานซักรีดอุตสาหกรรม
วิเคราะห์ข้อมูลที่ได้รับและ${langInstruction}
ตอบกระชับ ตรงประเด็น เน้น actionable insights
ตอบในรูปแบบ JSON เท่านั้น ไม่มี markdown ดังนี้:
{"summary":"สรุปสั้นๆ","warnings":[{"level":"critical"|"warning","message":"..."}],"recommendations":["ข้อแนะนำ"],"prediction":"คาดการณ์"}`
      : `You are an AI Assistant for LaundryTrack, an industrial laundry management system.
Analyze the provided data and ${langInstruction}.
Be concise and focus on actionable insights.
Respond in JSON only, no markdown:
{"summary":"brief summary","warnings":[{"level":"critical"|"warning","message":"..."}],"recommendations":["recommendation"],"prediction":"trend forecast"}`;

    const userPrompt = language === 'th'
      ? `นี่คือข้อมูลภาพรวมของระบบสำหรับวันนี้: ${JSON.stringify(dashboardData)}`
      : `Here is today's system overview data: ${JSON.stringify(dashboardData)}`;

    const response = await fetchOpenRouter([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const aiResult = await response.json();
    const content = aiResult.choices[0].message.content;

    try {
      const cleanJson = content.replace(/```json|```/g, '').trim();
      return NextResponse.json(JSON.parse(cleanJson));
    } catch {
      return NextResponse.json({
        summary: content,
        warnings: [],
        recommendations: [],
        prediction: language === 'th' ? 'ไม่สามารถสรุปการคาดการณ์ได้' : 'Unable to generate prediction'
      });
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('AI Insights Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
