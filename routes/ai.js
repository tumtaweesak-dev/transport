const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

module.exports = function createAiRouter() {
  const router = express.Router();

  router.get('/ai/status', (req, res) => {
    res.json({
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || 'gpt-5',
    });
  });

  router.post('/ai/chat', asyncHandler(async (req, res) => {
    const message = String(req.body?.message || '').trim();
    const context = String(req.body?.context || '').trim();

    if (!message) {
      return res.status(400).json({ error: 'Please enter a message for AI.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-5',
          instructions: [
            'You are an AI assistant inside a Thai transport management system.',
            'Answer in Thai by default. Be concise, practical, and focused on transport operations.',
            'Help with route planning, shipment notes, fleet questions, approvals, and summaries.',
          ].join(' '),
          input: context ? `${context}\n\nUser request:\n${message}` : message,
          max_output_tokens: 900,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = payload?.error?.message || 'AI request failed.';
        return res.status(response.status).json({ error: errorMessage });
      }

      res.json({
        answer: extractResponseText(payload) || 'AI did not return text.',
        model: payload.model || process.env.OPENAI_MODEL || 'gpt-5',
        id: payload.id || null,
      });
    } catch (error) {
      const message = error.name === 'AbortError'
        ? 'AI request timed out. Please try again.'
        : error.message;
      res.status(502).json({ error: message });
    } finally {
      clearTimeout(timeout);
    }
  }));

  return router;
};
