// netlify/functions/send-sms.js
// Phase 3 Implementation — Arkesel SMS Gateway (Server-Side)
//
// This Netlify Edge Function hides the ARKESEL_API_KEY from client-side code.
// The key is stored as a Netlify environment variable (ARKESEL_API_KEY).
//
// Expected request body: { message: string, recipients: string[], sender: string }
// Returns: Arkesel API response JSON
//
// PHASE 3 NOTE: Full implementation below — activate when ARKESEL_API_KEY
// is added to Netlify environment variables.

export default async (request, context) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ status: 'error', message: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({
      status: 'error',
      message: 'SMS gateway not configured. Add ARKESEL_API_KEY to Netlify environment variables.'
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ status: 'error', message: 'Invalid JSON body.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { message, recipients, sender } = body;

  if (!message || !recipients || recipients.length === 0) {
    return new Response(JSON.stringify({ status: 'error', message: 'message and recipients are required.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: sender || 'NAGSUENR',
        message,
        recipients
      })
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ status: 'error', message: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/netlify/functions/send-sms' };
