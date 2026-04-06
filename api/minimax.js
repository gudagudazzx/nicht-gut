// api/minimax.js
export default async function handler(req, res) {
  // 1. 设置 CORS 头（允许前端调用）
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 2. 处理预检请求 (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 3. 仅允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 4. 从环境变量中获取 MiniMax API Key（安全！）
  const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
  if (!MINIMAX_API_KEY) {
    return res.status(500).json({ error: 'MiniMax API Key is not configured on server.' });
  }

  // 5. 获取前端发来的请求体
  const requestBody = req.body;

  // 6. 向真实的 MiniMax API 发起请求
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

    // 7. 将 MiniMax API 的响应原样返回给前端
    res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}