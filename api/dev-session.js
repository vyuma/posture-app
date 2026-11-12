import {
  getDeveloperAuthConfig,
  hasValidDeveloperSession,
  jsonResponse,
} from "../server/developerAuth.js";

export async function GET(request, env) {
  const config = getDeveloperAuthConfig(env);
  if (!config) {
    return jsonResponse({ authenticated: false, configured: false });
  }

  const authenticated = await hasValidDeveloperSession(
    request,
    config.sessionSecret,
  );
  return jsonResponse({ authenticated, configured: true });
}
