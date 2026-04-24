import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchOpenRouter } from '@/lib/openrouter';

export async function POST(req: Request) {
  try {
    const { messages, language = 'en' } = await req.json();
    const supabase = await createClient();

    const [
      { count: inStock },
      { count: out },
      { count: rewash }
    ] = await Promise.all([
      supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('status', 'clean'),
      supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('status', 'out'),
      supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('status', 'rewash'),
    ]);

    const context = language === 'th'
      ? `ข้อมูลปัจจุบัน: ในคลัง: ${inStock}, อยู่กับลูกค้า: ${out}, ซักซ้ำ: ${rewash}`
      : `Current inventory: In-stock: ${inStock}, Out with clients: ${out}, In rewash: ${rewash}`;

    const systemPrompt = language === 'th'
      ? `คุณคือ AI Assistant ประจำระบบ LaundryTrack ตอบภาษาไทย สุภาพ และให้ข้อมูลที่อิงจากข้อมูลจริงในระบบ
${context}
ตอบกระชับ ถ้าไม่รู้ข้อมูลที่แน่ชัดให้บอกตรงๆ หรือแนะนำให้ไปดูที่หน้า Report`
      : `You are an AI Assistant for LaundryTrack. Respond in English, politely and based on real system data.
${context}
Be concise. If you don't know specific data, say so directly or suggest checking the Report page.`;

    const openRouterMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetchOpenRouter(openRouterMessages, true);

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(decoder.decode(value));
          }
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('AI Chat Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
