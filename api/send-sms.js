// api/send-sms.js
// Vercel Serverless Function — Arkesel SMS Gateway
//
// Stored variables required on Vercel:
//   ARKESEL_API_KEY = c0JSckpVS0ZiZGVDUlFURkNqdnE

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed.' });
  }

  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      status: 'error',
      message: 'SMS gateway not configured. Add ARKESEL_API_KEY to Vercel environment variables.'
    });
  }

  const { message, recipients, sender } = req.body || {};

  if (!message || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ status: 'error', message: 'message and recipients (array) are required.' });
  }

  try {
    const response = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: sender || 'NAGS GH',
        message,
        recipients
      })
    });

    const data = await response.json();
    return res.status(response.ok ? 200 : 502).json(data);

  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
