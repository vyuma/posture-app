import {
  createExpiredDeveloperSessionCookie,
  jsonResponse,
} from "../server/developerAuth.js";

export function POST(request) {
  return jsonResponse(
    { authenticated: false },
    {
      headers: {
        "Set-Cookie": createExpiredDeveloperSessionCookie(request),
      },
    },
  );
}
