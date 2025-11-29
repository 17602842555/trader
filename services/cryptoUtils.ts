/**
 * OKX API Signature Generation using Web Crypto API
 * Avoids external dependencies like crypto-js for a lightweight build
 */

export const generateSignature = async (
  timestamp: string,
  method: string,
  requestPath: string,
  body: string = '',
  secretKey: string
): Promise<string> => {
  try {
    if (!secretKey) return "";
    
    const message = timestamp + method + requestPath + body;
    const enc = new TextEncoder();
    
    const key = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await window.crypto.subtle.sign(
      "HMAC",
      key,
      enc.encode(message)
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  } catch (e) {
    console.error("Signing error:", e);
    return "";
  }
};