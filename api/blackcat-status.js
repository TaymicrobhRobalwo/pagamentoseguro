// /api/blackcat-status.js

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Método não permitido" });

  try {
    const apiKey = process.env.BLACKCAT_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "BLACKCAT_API_KEY não configurada" });

    const { transaction_id } = req.query;
    if (!transaction_id) return res.status(400).json({ error: "transaction_id é obrigatório" });

    const url = `https://api.blackcatpagamentos.online/api/sales/${encodeURIComponent(
      String(transaction_id)
    )}/status`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
    });

    const text = await response.text();
    const result = text ? JSON.parse(text) : {};
    return res.status(response.status).json(result);
  } catch (e) {
    return res.status(500).json({ error: "Erro ao consultar status", details: String(e?.message || e) });
  }
}