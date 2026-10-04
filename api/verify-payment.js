import crypto from "crypto";

function timingSafeHexEqual(a, b) {
  if (!a || !b) return false;
  const ab = Buffer.from(String(a), "hex");
  const bb = Buffer.from(String(b), "hex");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

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

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    } = req.body || {};

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing Razorpay verification fields" });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(500).json({ error: "Razorpay server credentials are not configured" });
    }

    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(String(razorpay_order_id) + "|" + String(razorpay_payment_id))
      .digest("hex");

    if (!timingSafeHexEqual(expected, razorpay_signature)) {
      return res.status(400).json({ success: false, error: "Payment signature mismatch" });
    }

    return res.status(200).json({
      success: true,
      verified: true,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id
    });
  } catch (err) {
    console.error("verify-payment failed", err);
    return res.status(500).json({ error: "Unable to verify payment" });
  }
}
