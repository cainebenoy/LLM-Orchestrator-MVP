import { NextResponse } from 'next/server';
import { decideMode } from '@/lib/models/router';
import { 
  callCompareWebhook, 
  callResearchWebhook, 
  synthesizeSummary,
  cleanErrorMessage,
  streamGeminiDirect,
  streamGroqDirect,
  streamSynthesizeSummary
} from '@/lib/models/gateway';
import { streamRedditSearch } from '@/lib/models/reddit';

// Default models to run in compare mode via Make.com (e.g. Claude + ChatGPT)
const DEFAULT_MAKE_MODELS = ['claude-3-5-sonnet', 'gpt-4o'];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, messages, isRedditMode } = body;

    // Separate active prompt from chat history context
    let activePrompt = '';
    let chatHistory: { role: string; content: string }[] = [];

    if (messages && Array.isArray(messages) && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      activePrompt = lastMsg.content;
      chatHistory = messages.slice(0, -1);
    } else {
      activePrompt = prompt || '';
      chatHistory = [];
    }

    if (!activePrompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        };

        const startTime = Date.now();

        // 1. Reddit Search Mode (Google Search Grounding)
        if (isRedditMode) {
          sendEvent('info', {
            mode: 'reddit',
            topic: activePrompt,
            reason: 'Reddit Search Mode manually enabled (using Google Search Grounding).'
          });

          try {
            await streamRedditSearch(
              activePrompt,
              (text) => sendEvent('token', { model: 'summary', text }), // reddit writes directly to summary box
              (summaryData) => {
                const finalResult = {
                  source: 'reddit',
                  label: 'Reddit Search & Sentiment',
                  text: summaryData.text,
                  citations: summaryData.citations,
                  latencyMs: Date.now() - startTime,
                  inputTokens: summaryData.inputTokens,
                  outputTokens: summaryData.outputTokens,
                  cost: summaryData.cost
                };
                sendEvent('completed', { model: 'reddit', result: finalResult });
                sendEvent('summary_completed', { summary: summaryData.text });
              },
              async (err) => {
                console.error('[API/Ask Stream] Reddit search failed, executing Make Webhook backup...', err);
                sendEvent('status', { status: 'falling_back_to_webhook' });

                try {
                  const webhookResponse = await callResearchWebhook(`Search Reddit and analyze community discussions about: ${activePrompt}`);
                  if (!webhookResponse.results || webhookResponse.results.length === 0) {
                    throw new Error('Fallback webhook returned empty results.');
                  }
                  
                  const val = webhookResponse.results[0];
                  const finalResult = {
                    source: 'reddit-fallback',
                    label: `${val.label || 'Claude/GPT'} (Reddit Fallback)`,
                    text: val.text,
                    citations: val.citations || [],
                    latencyMs: Date.now() - startTime,
                    inputTokens: val.inputTokens || 0,
                    outputTokens: val.outputTokens || 0,
                    cost: val.cost || 0
                  };

                  sendEvent('completed', { model: 'reddit-fallback', result: finalResult });
                  sendEvent('summary_completed', { summary: val.text });
                } catch (fallbackErr: any) {
                  console.error('[API/Ask Stream] Reddit fallback webhook also failed:', fallbackErr);
                  const cleanErr = cleanErrorMessage(fallbackErr, 'Make Webhook');
                  sendEvent('error', {
                    model: 'reddit',
                    error: `Reddit search limits reached: both Gemini and Webhook fallbacks failed. (${cleanErr})`
                  });
                }
              }
            );
          } catch (err: any) {
            sendEvent('error', { model: 'reddit', error: err.message || String(err) });
          }

          controller.close();
          return;
        }

        // 2. Default Intelligent Routing Paths
        const decision = decideMode(activePrompt);
        sendEvent('info', {
          mode: decision.mode,
          topic: decision.topic,
          reason: decision.reason,
          extractedUrl: decision.url
        });

        // --- Compare Mode ---
        if (decision.mode === 'compare') {
          const finalResults: any[] = [];

          // Trigger all calls concurrently (direct streams + Make webhook)
          const geminiPromise = streamGeminiDirect(
            decision.topic,
            chatHistory,
            (text) => sendEvent('token', { model: 'gemini-2.5-flash', text }),
            (res) => {
              sendEvent('completed', { model: 'gemini-2.5-flash', result: res });
              finalResults.push(res);
            },
            (err) => {
              const res = { source: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', text: '', error: err };
              sendEvent('completed', { model: 'gemini-2.5-flash', result: res });
              finalResults.push(res);
            }
          );

          const groqPromise = streamGroqDirect(
            decision.topic,
            chatHistory,
            (text) => sendEvent('token', { model: 'llama-3.3-70b-versatile', text }),
            (res) => {
              sendEvent('completed', { model: 'llama-3.3-70b-versatile', result: res });
              finalResults.push(res);
            },
            (err) => {
              const res = { source: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (via Groq)', text: '', error: err };
              sendEvent('completed', { model: 'llama-3.3-70b-versatile', result: res });
              finalResults.push(res);
            }
          );

          const webhookPromise = callCompareWebhook(decision.topic, DEFAULT_MAKE_MODELS, chatHistory)
            .then((val) => {
              val.results.forEach((res) => {
                sendEvent('completed', { model: res.source, result: res });
                finalResults.push(res);
              });
            })
            .catch((err) => {
              console.error('Make Webhook failed in Compare mode', err);
              const friendlyError = cleanErrorMessage(err, 'Webhook Service');
              const claudeErr = {
                source: 'claude-3-5-sonnet',
                label: 'Claude 3.5 Sonnet',
                text: '',
                error: `${friendlyError} (Claude via Webhook)`
              };
              const gptErr = {
                source: 'gpt-4o',
                label: 'ChatGPT 4o',
                text: '',
                error: `${friendlyError} (GPT via Webhook)`
              };
              sendEvent('completed', { model: 'claude-3-5-sonnet', result: claudeErr });
              sendEvent('completed', { model: 'gpt-4o', result: gptErr });
              finalResults.push(claudeErr, gptErr);
            });

          // Wait for all 3 operations to finish
          await Promise.all([geminiPromise, groqPromise, webhookPromise]);

          // Now Stream the Synthesized Summary
          sendEvent('status', { status: 'synthesizing' });

          await streamSynthesizeSummary(
            decision.topic,
            finalResults,
            (text) => sendEvent('token', { model: 'summary', text }),
            (summaryText) => sendEvent('summary_completed', { summary: summaryText }),
            (err) => {
              sendEvent('error', { model: 'summary', error: err });
              sendEvent('summary_completed', { summary: `Summary generation failed: ${err}` });
            }
          );

        } else {
          // --- Research Mode (Web scraping / Single Webhook) ---
          sendEvent('status', { status: 'researching' });
          try {
            const webhookResponse = await callResearchWebhook(decision.topic, decision.url || undefined);
            if (webhookResponse.results && webhookResponse.results.length > 0) {
              const res = webhookResponse.results[0];
              sendEvent('completed', { model: res.source, result: res });
              sendEvent('summary_completed', { summary: res.text });
            } else {
              throw new Error('Research Webhook returned empty results.');
            }
          } catch (err: any) {
            console.error('[API/Ask Stream] Research mode error:', err);
            const friendlyError = cleanErrorMessage(err, 'Research Webhook');
            sendEvent('error', { model: 'research', error: friendlyError });
            sendEvent('summary_completed', { summary: `Research failed: ${friendlyError}` });
          }
        }

        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Content-Encoding': 'none',
      },
    });

  } catch (error: any) {
    console.error('[API/Ask] Route stream setup failed:', error);
    return NextResponse.json({ error: 'Failed to establish stream connection.' }, { status: 500 });
  }
}
