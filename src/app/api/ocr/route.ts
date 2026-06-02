import { NextRequest, NextResponse } from 'next/server';
import { ocrScreenshot } from '@/lib/ocr';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await ocrScreenshot(buffer);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'OCR processing failed';
    console.error('OCR error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}