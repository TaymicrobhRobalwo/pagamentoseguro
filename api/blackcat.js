// api/blackcat.js

function onlyDigits(v) {
    return String(v || "").replace(/\D/g, "");
}

function hasTangibleItem(items) {
    if (!Array.isArray(items)) return false;
    return items.some((it) => it && it.tangible === true);
}

function mapToCreateSalePayload(frontPayload) {
    const p = frontPayload || {};

    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("amount inválido (deve ser inteiro em centavos)");
    }

    const paymentMethodRaw = String(p.paymentMethod || "PIX").trim();
    const paymentMethod =
        paymentMethodRaw.toLowerCase() === "pix" ? "PIX" : paymentMethodRaw.toUpperCase();

    const currency = p.currency || "BRL";

    const items = Array.isArray(p.items) ? p.items : [];
    if (!items.length) {
        throw new Error("items é obrigatório (mínimo 1 item)");
    }

    const customer = p.customer || {};
    const mappedCustomer = {
        name: customer.name || "Cliente",
        email: customer.email || "cliente@example.com",
        phone: onlyDigits(customer.phone || ""),
        ...(customer.document ? { document: customer.document } : {}),
    };

    const needsShipping = hasTangibleItem(items);
    const addr = customer?.address || null;

    let shipping;
    if (needsShipping) {
        if (!addr) {
            throw new Error("shipping é obrigatório quando há item tangible:true (faltou customer.address no payload)");
        }

        shipping = {
            street: addr.street || "",
            streetNumber: String(addr.streetNumber || ""),
            complement: addr.complement || "",
            zipCode: onlyDigits(addr.zipCode || ""),
            neighborhood: addr.neighborhood || "",
            city: addr.city || "",
            state: addr.state || "",
            country: addr.country || "BR",
        };
    }

    const out = {
        amount,
        currency,
        paymentMethod,
        items,
        customer: mappedCustomer,
        ...(p.pix ? { pix: p.pix } : {}),
        ...(needsShipping ? { shipping } : {}),
        ...(p.metadata ? { metadata: p.metadata } : {}),
        ...(p.postbackUrl ? { postbackUrl: p.postbackUrl } : {}),
        ...(p.externalRef ? { externalRef: p.externalRef } : {}),
        ...(p.utm_source ? { utm_source: p.utm_source } : {}),
        ...(p.utm_medium ? { utm_medium: p.utm_medium } : {}),
        ...(p.utm_campaign ? { utm_campaign: p.utm_campaign } : {}),
        ...(p.utm_content ? { utm_content: p.utm_content } : {}),
        ...(p.utm_term ? { utm_term: p.utm_term } : {}),
    };

    return out;
}

// Garante que o front receba sempre tx.id e tx.pix.qrcode
function normalizeForFrontend(apiResult) {
    const root = apiResult || {};
    const data = root.data || root;

    const transactionId =
        data.transactionId || data.id || root.transactionId || root.id || null;

    // Tentativas comuns para "copia e cola" Pix
    const pixObj = data.pix || root.pix || {};
    const qrcode =
        pixObj.qrcode ||
        pixObj.qrCode ||
        pixObj.copyPaste ||
        pixObj.code ||
        data.qrcode ||
        data.qrCode ||
        data.pixCode ||
        null;

    // Se a resposta vier sem pix, ainda devolvemos o corpo original, mas com campos normalizados quando possível
    const normalizedData = {
        ...data,
        id: data.id || transactionId,
        transactionId: transactionId || data.transactionId,
        pix: {
            ...(pixObj || {}),
            qrcode: pixObj.qrcode || qrcode,
        },
    };

    // Mantém o envelope original (success, message etc.) e substitui data
    if (root.data) {
        return { ...root, data: normalizedData };
    }
    return normalizedData;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método não permitido" });
    }

    try {
        const apiKey = process.env.BLACKCAT_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: "BLACKCAT_API_KEY não configurada no servidor",
            });
        }

        const payload = mapToCreateSalePayload(req.body);

        const url = "https://api.blackcatpagamentos.online/api/sales/create-sale";

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
            body: JSON.stringify(payload),
        });

        const text = await response.text();
        let result;
        try {
            result = text ? JSON.parse(text) : {};
        } catch {
            result = { raw: text };
        }

        // 🔥 Normaliza para o checkout não quebrar
        const normalized = normalizeForFrontend(result);

        return res.status(response.status).json(normalized);
    } catch (error) {
        console.error("ERRO BLACKCAT (create-sale):", error);
        return res.status(500).json({
            error: "Erro ao criar venda Pix",
            details: String(error?.message || error),
        });
    }
}