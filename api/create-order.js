export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const supabaseUrl = (process.env.SUPABASE_URL || "https://ieoltipygxawhsvlxnsj.supabase.co").replace(/\/$/, "");
    const supabaseKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "sb_publishable_AzM0AxHgmX2a6-9On5jgNg_7SuasTXH";

    const authCheck = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { Authorization: auth, apikey: supabaseKey }
    });

    if (!authCheck.ok) {
      return res.status(401).json({ error: "Invalid or expired login session" });
    }

    const amount = Number(req.body?.amount);
    const currency = String(req.body?.currency || "INR").toUpperCase();
    const receipt = String(req.body?.receipt || "panchayatx_" + Date.now()).slice(0, 40);

    if (!Number.isInteger(amount) || amount < 100) {
      return res.status(400).json({ error: "Amount must be at least 100 paise" });
    }

    if (currency !== "INR") {
      return res.status(400).json({ error: "Only INR is supported" });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(500).json({ error: "Razorpay server credentials are not configured" });
    }

    const basic = Buffer.from(keyId + ":" + keySecret).toString("base64");

    const rp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: "Basic " + basic,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount,
        currency,
        receipt,
        notes: { source: "PanchayatX" }
      })
    });

    const data = await rp.json().catch(() => ({}));

    if (!rp.ok) {
      console.error("Razorpay order error", data);
      return res.status(500).json({ error: "Unable to create Razorpay order" });
    }

    return res.status(200).json({
      order_id: data.id,
      amount: data.amount,
      currency: data.currency,
      key_id: keyId
    });
  } catch (err) {
    console.error("create-order failed", err);
    return res.status(500).json({ error: "Unable to create payment order" });
  }
}
