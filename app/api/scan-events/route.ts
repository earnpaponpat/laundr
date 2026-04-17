import { NextResponse } from 'next/server';
import { scanEventSchema, processScanEvent } from '@/lib/rfid/scan-processor';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Zod Validation
    const validationResult = scanEventSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation Error', 
          details: validationResult.error.format() 
        },
        { status: 400 }
      );
    }

    // Process the scan event via business logic
    const result = await processScanEvent(validationResult.data);
    
    // Status 200 is returned even for logical warnings like unknown_tag 
    // to prevent hardware clients from assuming network/server failure.
    return NextResponse.json(result, { status: 200 });

  } catch (err: any) {
    console.error('Scan Event Processor Error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
