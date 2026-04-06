// api/minimax.js
export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
  if (!MINIMAX_API_KEY) {
    console.error('MINIMAX_API_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error: missing API key' });
  }

  const requestBody = req.body;
  if (!requestBody || !requestBody.text) {
    return res.status(400).json({ error: 'Missing text in request body' });
  }

  try {
    const response = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    // 如果 MiniMax 返回错误，将错误信息返回给前端
    if (!response.ok || data?.base_resp?.status_code !== 0) {
      console.error('MiniMax error:', data);
      return res.status(400).json({
        error: 'MiniMax API error',
        details: data?.base_resp?.status_msg || data,
      });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
