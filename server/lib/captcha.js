const { config } = require("./config");

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verifyCaptcha(token, remoteIp) {
  if (config.captchaDevBypass) return true;
  if (typeof token !== "string" || token.length < 10 || token.length > 2048) return false;

  const body = new URLSearchParams({ secret: config.turnstileSecret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`Turnstile siteverify returned HTTP ${res.status}`);
      return false;
    }
    const data = await res.json();
    if (data.success !== true) {
      console.warn(`Turnstile rejected the response: ${(data["error-codes"] || []).join(", ") || "no error code"}`);
    }
    return data.success === true;
  } catch (err) {
    console.warn(`Turnstile siteverify failed: ${err.name === "TimeoutError" ? "timed out" : err.message}`);
    return false;
  }
}

module.exports = { verifyCaptcha };
