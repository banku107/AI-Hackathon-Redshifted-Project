import { getFamilyAlerts } from "@/lib/investigate/familyAlert";
import { browserRequestUrl, isLocalNetworkHost } from "@/lib/investigate/localNetwork";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

function isAllowedLocalRequest(request: Request): boolean {
  try {
    const requestUrl = browserRequestUrl(request);
    if (
      !isLocalNetworkHost(requestUrl.hostname)
      || (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:")
    ) {
      return false;
    }

    const origin = request.headers.get("origin");
    return !origin || new URL(origin).origin === requestUrl.origin;
  } catch {
    return false;
  }
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: RESPONSE_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  if (!isAllowedLocalRequest(request)) {
    return errorResponse("Family alerts are available only from the local app.", 403);
  }

  try {
    const alerts = await getFamilyAlerts();
    return Response.json(alerts, { headers: RESPONSE_HEADERS });
  } catch {
    return errorResponse("Family alerts could not be retrieved.", 500);
  }
}
