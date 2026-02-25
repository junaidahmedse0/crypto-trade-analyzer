export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const geminiKey = process.env.GEMINI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const qwenKey = process.env.QWEN_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!geminiKey && !deepseekKey && !qwenKey && !anthropicKey) {
    return res.status(500).json({ error: 'No API key. Add GEMINI_API_KEY (free), DEEPSEEK_API_KEY, QWEN_API_KEY, or ANTHROPIC_API_KEY in Vercel env' });
  }

  const errors = [];

  // 1. GEMINI (FREE — try Flash first, then Flash-Lite for higher quota)
  if (geminiKey) {
    const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    for (const model of geminiModels) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
          }),
        });
        const data = await r.json();
        if (data.error?.code === 429) {
          errors.push('gemini-' + model + ': quota exhausted, trying next');
          continue; // Try next model
        }
        if (!data.error && data.candidates?.[0]?.content?.parts) {
          let text = '';
          for (const part of data.candidates[0].content.parts) {
            if (part.text) text += part.text;
          }
          if (text) return res.status(200).json({ success: true, text, provider: 'gemini-' + model });
        }
        errors.push('gemini-' + model + ': ' + (data.error?.message || 'no text'));
      } catch (e) { errors.push('gemini-' + model + ': ' + e.message); }
    }
  }

  // 2. DEEPSEEK (VERY CHEAP)
  if (deepseekKey) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + deepseekKey },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a crypto market analyst. Always respond with valid JSON only. No markdown. Be decisive.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 3000, temperature: 0.7,
        }),
      });
      const data = await r.json();
      if (data.choices?.[0]?.message?.content) {
        return res.status(200).json({ success: true, text: data.choices[0].message.content, provider: 'deepseek' });
      }
      errors.push('deepseek: ' + (data.error?.message || 'no content'));
    } catch (e) { errors.push('deepseek: ' + e.message); }
  }

  // 3. QWEN (CHEAP)
  if (qwenKey) {
    try {
      const r = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + qwenKey },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [
            { role: 'system', content: 'You are a crypto market analyst. Always respond with valid JSON only. No markdown. Be decisive.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 3000, temperature: 0.7,
        }),
      });
      const data = await r.json();
      if (data.choices?.[0]?.message?.content) {
        return res.status(200).json({ success: true, text: data.choices[0].message.content, provider: 'qwen' });
      }
      errors.push('qwen: ' + (data.error?.message || 'no content'));
    } catch (e) { errors.push('qwen: ' + e.message); }
  }

  // 4. ANTHROPIC (BEST — Paid)
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 2500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await r.json();
      let text = '';
      if (data.content) for (const b of data.content) if (b.type === 'text') text += b.text;
      if (text) return res.status(200).json({ success: true, text, provider: 'anthropic' });
      errors.push('anthropic: no text');
    } catch (e) { errors.push('anthropic: ' + e.message); }
  }

  return res.status(500).json({ success: false, error: 'All AI providers failed', details: errors });
}
