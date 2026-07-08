import { NextResponse } from 'next/server';
import { callCompareWebhook } from '@/lib/models/gateway';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, models } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!models || !Array.isArray(models) || models.length === 0) {
      return NextResponse.json({ error: 'At least one model must be selected' }, { status: 400 });
    }

    const result = await callCompareWebhook(prompt, models);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[API/Compare] Route handler error:', error);
    
    let status = 500;
    let errorMessage = error instanceof Error ? error.message : String(error) || 'Comparison failed, please try again.';

    if (errorMessage.includes('timed out')) {
      status = 504;
      errorMessage = 'Make.com comparison request timed out. Please try again.';
    } else if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
      status = 429;
      errorMessage = 'Rate limit hit (429). Please try again in a moment.';
    }

    return NextResponse.json({ error: errorMessage }, { status });
  }
}
