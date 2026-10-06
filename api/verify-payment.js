import crypto from "crypto";

const COUPON_EXPIRES_AT = new Date("2026-10-11T10:40:00+05:30");

function priceForPost(post, discounted) {
  const p = String(post || "").trim();
  if (p === "Ward Panch") return discounted ? 499 : 999;
  if (p === "Panchayat Samiti Member") return discounted ? 999 : 9999;
  return discounted ? 999 : 4999;
}

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
    const user = await authCheck.json();

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing Razorpay verification fields" });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return res.status(500).json({ error: "Razorpay server credentials are not configured" });
    }

    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(String(razorpay_order_id) + "|" + String(razorpay_payment_id))
      .digest("hex");

    if (!timingSafeHexEqual(expected, razorpay_signature)) {
      return res.status(400).json({ success: false, error: "Payment signature mismatch" });
    }

    const basic = Buffer.from(keyId + ":" + keySecret).toString("base64");

    const orderRes = await fetch("https://api.razorpay.com/v1/orders/" + encodeURIComponent(razorpay_order_id), {
      headers: { Authorization: "Basic " + basic }
    });
    const paymentRes = await fetch("https://api.razorpay.com/v1/payments/" + encodeURIComponent(razorpay_payment_id), {
      headers: { Authorization: "Basic " + basic }
    });

    const order = await orderRes.json().catch(() => ({}));
    const payment = await paymentRes.json().catch(() => ({}));

    if (!orderRes.ok || !paymentRes.ok) {
      return res.status(502).json({ error: "Unable to confirm payment with Razorpay" });
    }

    if (String(order.notes?.user_id || "") !== String(user.id)) {
      return res.status(400).json({ error: "Order does not belong to this candidate" });
    }

    if (String(payment.order_id || "") !== String(razorpay_order_id)) {
      return res.status(400).json({ error: "Payment/order mismatch" });
    }

    if (String(payment.status || "") !== "captured") {
      return res.status(400).json({ error: "Payment is not captured yet", status: payment.status });
    }

    const profileRes = await fetch(
      supabaseUrl + "/rest/v1/candidate_profiles?select=election_post&user_id=eq." +
        encodeURIComponent(user.id) + "&limit=1",
      { headers: { Authorization: auth, apikey: supabaseKey, Accept: "application/json" } }
    );

    const profiles = await profileRes.json().catch(() => []);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile) return res.status(403).json({ error: "Candidate profile not found" });

    const discounted = String(order.notes?.coupon_applied || "") === "yes" && Date.now() < COUPON_EXPIRES_AT.getTime();
    const expectedRupees = priceForPost(profile.election_post, discounted);
    const expectedPaise = expectedRupees * 100;

    if (
      Number(order.amount) !== expectedPaise ||
      Number(payment.amount) !== expectedPaise ||
      String(order.currency) !== "INR" ||
      String(payment.currency) !== "INR"
    ) {
      return res.status(400).json({ error: "Paid amount does not match the selected package" });
    }

    return res.status(200).json({
      success: true,
      verified: true,
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      amount: expectedRupees,
      election_post: profile.election_post
    });
  } catch (err) {
    console.error("verify-payment failed", err);
    return res.status(500).json({ error: "Unable to verify payment" });
  }
}
