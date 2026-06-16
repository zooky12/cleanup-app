const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@cleanup.app";
const CRON_INTERVAL = parseInt(Deno.env.get("CRON_INTERVAL") || "30");

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables are required");
  Deno.exit(1);
}

function b64UrlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64UrlDecode(s: string): Uint8Array {
  const r = s.replace(/-/g, "+").replace(/_/g, "/");
  const p = r.length % 4 ? "=".repeat(4 - r.length % 4) : "";
  return Uint8Array.from(atob(r + p), (c) => c.charCodeAt(0));
}

async function getVapidSigningKey(): Promise<CryptoKey> {
  const pubRaw = b64UrlDecode(VAPID_PUBLIC_KEY);
  const privRaw = b64UrlDecode(VAPID_PRIVATE_KEY);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: b64UrlEncode(pubRaw.slice(1, 33)),
    y: b64UrlEncode(pubRaw.slice(33)),
    d: b64UrlEncode(privRaw),
  };
  return await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function createVapidJWT(audience: string, key: CryptoKey): Promise<string> {
  const enc = (o: unknown) => b64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const header = enc({ typ: "JWT", alg: "ES256" });
  const now = Math.floor(Date.now() / 1000);
  const payload = enc({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT });
  const data = header + "." + payload;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(data),
  );
  return data + "." + b64UrlEncode(sig);
}

async function sendPush(sub: { endpoint: string }, vapidKey: CryptoKey): Promise<boolean> {
  try {
    const audience = new URL(sub.endpoint).origin;
    const jwt = await createVapidJWT(audience, vapidKey);
    const pubB64 = b64UrlEncode(b64UrlDecode(VAPID_PUBLIC_KEY));
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${pubB64}`,
        TTL: "86400",
      },
    });
    if (res.status === 410 || res.status === 404) return false;
    if (!res.ok) console.error("Push HTTP error", res.status, await res.text());
    return true;
  } catch (e) {
    console.error("Push network error", e);
    return true;
  }
}

const kv = await Deno.openKv();
const vapidKey = await getVapidSigningKey();

const cronExp = CRON_INTERVAL >= 60 ? "0 * * * *" : `*/${Math.max(1, CRON_INTERVAL)} * * * *`;

Deno.cron("push-check", { cron: cronExp, timezone: "Europe/Madrid" }, async () => {
  console.log("Cron: sending pushes");
  let sent = 0;
  for await (const entry of kv.list({ prefix: ["sub"] })) {
    const sub = entry.value as { endpoint: string };
    const ok = await sendPush(sub, vapidKey);
    if (!ok) {
      console.log("Removing expired sub:", sub.endpoint.slice(0, 60));
      await kv.delete(entry.key);
    } else sent++;
  }
  console.log(`Cron: sent to ${sent} subs`);
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/subscribe") {
    try {
      const sub = await req.json();
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return new Response("Invalid subscription", { status: 400, headers: corsHeaders() });
      }
      await kv.set(["sub", sub.endpoint], sub);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    } catch {
      return new Response("Bad request", { status: 400, headers: corsHeaders() });
    }
  }

  if (req.method === "POST" && url.pathname === "/unsubscribe") {
    try {
      const { endpoint } = await req.json();
      if (endpoint) await kv.delete(["sub", endpoint]);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    } catch {
      return new Response("Bad request", { status: 400, headers: corsHeaders() });
    }
  }

  return new Response("Not found", { status: 404, headers: corsHeaders() });
});
