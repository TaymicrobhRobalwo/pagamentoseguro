// /api/blackcat.js

function onlyDigits(v) {
    return String(v || "").replace(/\D/g, "");
}

function hasTangibleItem(items) {
    return Array.isArray(items) && items.some((it) => it && it.tangible === true);
}

function mapToCreateSalePayload(frontPayload) {
    const p = frontPayload || {};

    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount inválido (centavos)");

    const items = Array.isArray(p.items) ? p.items : [];
    if (!items.length) throw new Error("items é obrigatório (mínimo 1)");

    const customer = p.customer || {};

    // ✅ aqui é o ponto crítico: seu checkout manda document como objeto {type, number}
    const docFromFront =
        (customer.document && typeof customer.document === "object")
            ? customer.document.number
            : customer.document;

    const mappedCustomer = {
        name: customer.name || "",
        email: customer.email || "",
        phone: onlyDigits(customer.phone || ""),
        document: onlyDigits(docFromFront || ""), // ✅ garante CPF em string numérica
    };

    // Blackcat costuma rejeitar se campos básicos vierem vazios
    if (!mappedCustomer.name || !mappedCustomer.email || !mappedCustomer.phone || !mappedCustomer.document) {
        throw new Error("Campos do cliente incompletos (name/email/phone/document)");
    }

    const needsShipping = hasTangibleItem(items);
    const addr = customer?.address || null;

    let shipping;
    if (needsShipping) {
        if (!addr) throw new Error("shipping obrigatório (item tangible:true) e customer.address está vazio");

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

        // Evita envio de shipping vazio
        if (!shipping.street || !shipping.streetNumber || !shipping.zipCode || !shipping.city || !shipping.state) {
            throw new Error("Endereço incompleto (street/number/zip/city/state)");
        }
    }

    return {
        amount,
        currency: p.currency || "BRL",
        paymentMethod: "PIX", // ✅ força PIX como na doc/retorno
        items,
        customer: mappedCustomer,
        ...(needsShipping ? { shipping } : {}),
        ...(p.pix ? { pix: p.pix } : {}),
        ...(p.metadata ? { metadata: p.metadata } : {}),
        ...(p.postbackUrl ? { postbackUrl: p.postbackUrl } : {}),
        ...(p.externalRef ? { externalRef: p.externalRef } : {}),
        ...(p.utm_source ? { utm_source: p.utm_source } : {}),
        ...(p.utm_medium ? { utm_medium: p.utm_medium } : {}),
        ...(p.utm_campaign ? { utm_campaign: p.utm_campaign } : {}),
        ...(p.utm_content ? { utm_content: p.utm_content } : {}),
        ...(p.utm_term ? { utm_term: p.utm_term } : {}),
    };
}

function normalizeForFrontend(apiResult) {
    const root = apiResult || {};
    const data = root.data || root;

    const transactionId = data.transactionId || data.id || root.transactionId || root.id || null;

    const pixObj = data.pix || root.pix || {};
    const pixCode =
        pixObj.qrcode || pixObj.qrCode || pixObj.copyPaste || pixObj.code ||
        data.qrcode || data.qrCode || data.pixCode ||
        null;

    const normalizedData = {
        ...data,
        id: data.id || transactionId,
        transactionId: data.transactionId || transactionId,
        pix: { ...pixObj, qrcode: pixObj.qrcode || pixCode },
    };

    return root.data ? { ...root, data: normalizedData } : normalizedData;
}

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

    try {
        const apiKey = process.env.BLACKCAT_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "BLACKCAT_API_KEY não configurada" });

        const payload = mapToCreateSalePayload(req.body);

        const response = await fetch("https://api.blackcatpagamentos.online/api/sales/create-sale", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey,
            },
            body: JSON.stringify(payload),
        });

        const text = await response.text();
        const result = text ? JSON.parse(text) : {};

        const normalized = normalizeForFrontend(result);
        return res.status(response.status).json(normalized);
    } catch (e) {
        return res.status(500).json({ error: "Erro ao criar venda Pix", details: String(e?.message || e) });
    }
}