// api/blackcat-status.js

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const apiKey = process.env.BLACKCAT_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "BLACKCAT_API_KEY não configurada no servidor" });
    }

    const { transaction_id } = req.query;
    if (!transaction_id) {
      return res.status(400).json({ error: "transaction_id é obrigatório" });
    }

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
    let result;
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      result = { raw: text };
    }

    return res.status(response.status).json(result);
  } catch (error) {
    console.error("ERRO BLACKCAT (status):", error);
    return res.status(500).json({
      error: "Erro ao consultar status da venda",
      details: String(error?.message || error),
    });
  }
}