import {
  createDeveloperSessionCookie,
  credentialsMatch,
  getDeveloperAuthConfig,
  jsonResponse,
} from "../server/developerAuth.js";

export async function POST(request, env) {
  const config = getDeveloperAuthConfig(env);
  if (!config) {
    return jsonResponse(
      { error: "Developer login is not configured." },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request." }, { status: 400 });
  }

  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const authenticated = await credentialsMatch(
    config,
    username,
    password,
  );

  if (!authenticated) {
    return jsonResponse(
      { error: "Username or password is incorrect." },
      { status: 401 },
    );
  }

  return jsonResponse(
    { authenticated: true },
    {
      headers: {
        "Set-Cookie": await createDeveloperSessionCookie(
          request,
          config.sessionSecret,
        ),
      },
    },
  );
}
