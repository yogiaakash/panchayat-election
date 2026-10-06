const COUPON_CODE = "PANCHAYATX";
const COUPON_EXPIRES_AT = new Date("2026-10-11T10:40:00+05:30");

function priceForPost(post, discounted) {
  const p = String(post || "").trim();
  if (p === "Ward Panch") return discounted ? 199 : 999;
  if (p === "Panchayat Samiti Member") return discounted ? 999 : 9999;
  return discounted ? 999 : 4999;
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

    const profileRes = await fetch(
      supabaseUrl + "/rest/v1/candidate_profiles?select=election_post,panchayat_id,assigned_panchayat_ids&user_id=eq." +
        encodeURIComponent(user.id) + "&limit=1",
      { headers: { Authorization: auth, apikey: supabaseKey, Accept: "application/json" } }
    );

    const profiles = await profileRes.json().catch(() => []);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile) return res.status(403).json({ error: "Candidate profile not found" });

    const coupon = String(req.body?.coupon_code || "").trim().toUpperCase();
    const discounted = coupon === COUPON_CODE && Date.now() < COUPON_EXPIRES_AT.getTime();
    const rupees = priceForPost(profile.election_post, discounted);
    const amount = rupees * 100;

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
        currency: "INR",
        receipt: String("pxt_" + user.id.replace(/-/g, "").slice(0, 8) + "_" + Date.now()).slice(0, 40),
        notes: {
          source: "PanchayatX",
          user_id: user.id,
          election_post: String(profile.election_post || ""),
          coupon_applied: discounted ? "yes" : "no",
          primary_panchayat_id: String(profile.panchayat_id || "")
        }
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
      key_id: keyId,
      rupees,
      election_post: profile.election_post,
      discounted
    });
  } catch (err) {
    console.error("create-order failed", err);
    return res.status(500).json({ error: "Unable to create payment order" });
  }
}
