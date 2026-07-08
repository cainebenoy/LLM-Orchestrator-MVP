import { NextResponse } from 'next/server';
import { callResearchWebhook } from '@/lib/models/gateway';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { topic, url } = body;

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const result = await callResearchWebhook(topic, url);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[API/Research] Route handler error:', error);
    
    let status = 500;
    let errorMessage = error instanceof Error ? error.message : String(error) || 'Research failed, please try again.';

    if (errorMessage.includes('timed out')) {
      status = 504;
      errorMessage = 'Make.com research request timed out. Please try again.';
    } else if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
      status = 429;
      errorMessage = 'Rate limit hit (429). Please try again in a moment.';
    }

    return NextResponse.json({ error: errorMessage }, { status });
  }
}
