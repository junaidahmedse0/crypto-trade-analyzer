export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  // Try Gemini first (FREE), fallback to Anthropic (paid)
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!geminiKey && !anthropicKey) {
    return res.status(500).json({ error: 'No API key set. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in Vercel env vars' });
  }

  // ═══ TRY GEMINI FIRST (FREE) ═══
  if (geminiKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
          }),
        }
      );

      const data = await r.json();

      if (data.error) {
        // Gemini error — fall through to Anthropic
        console.log('Gemini error:', data.error.message);
      } else {
        // Extract text from Gemini response
        let text = '';
        if (data.candidates && data.candidates[0]?.content?.parts) {
          for (const part of data.candidates[0].content.parts) {
            if (part.text) text += part.text;
          }
        }

        if (text) {
          return res.status(200).json({ success: true, text, provider: 'gemini' });
        }
      }
    } catch (e) {
      console.log('Gemini fetch error:', e.message);
    }
  }

  // ═══ FALLBACK: ANTHROPIC (PAID) ═══
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await r.json();
      let text = '';
      if (data.content) {
        for (const block of data.content) {
          if (block.type === 'text') text += block.text;
        }
      }

      if (text) {
        return res.status(200).json({ success: true, text, provider: 'anthropic' });
      }

      return res.status(500).json({ success: false, error: 'Anthropic returned no text', raw: data });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Anthropic error: ' + e.message });
    }
  }

  return res.status(500).json({ success: false, error: 'All AI providers failed' });
}
