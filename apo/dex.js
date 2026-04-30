export const config = { runtime: "edge" };

// Configuration for the remote endpoint
const REMOTE_ORIGIN = (process.env.TARO_PATH || "").replace(/\/$/, "");

// Headers that should not be passed through the tunnel
const BLOCKED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function tunnel(request) {
  if (!REMOTE_ORIGIN) {
    return new Response("Configuration missing", { status: 500 });
  }

  try {
    // Determine the full destination address
    const fullUrl = request.url;
    const pathIndex = fullUrl.indexOf("/", 8);
    const destination = pathIndex === -1 
      ? REMOTE_ORIGIN + "/" 
      : REMOTE_ORIGIN + fullUrl.slice(pathIndex);

    // Prepare optimized header map
    const transportHeaders = {};
    
    // Identify the originator's IP address
    const sourceIp = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for");

    request.headers.forEach((val, key) => {
      // Filter out internal and hop-by-hop headers
      if (BLOCKED_HEADERS.has(key) || key.startsWith("x-vercel-")) return;
      
      // Skip IP-related headers to prevent duplication
      if (key === "x-real-ip" || key === "x-forwarded-for") return;

      transportHeaders[key] = val;
    });

    // Re-insert cleaned IP trace
    if (sourceIp) transportHeaders["x-forwarded-for"] = sourceIp;

    const opMode = request.method;
    const requestHasPayload = opMode !== "GET" && opMode !== "HEAD";

    // Transmit the request to the upstream origin
    return await fetch(destination, {
      method: opMode,
      headers: transportHeaders,
      body: requestHasPayload ? request.body : undefined,
      duplex: "half",
      redirect: "manual",
    });
  } catch (failure) {
    console.error("Tunnel error:", failure);
    return new Response("Communication Error", { status: 502 });
  }
}
