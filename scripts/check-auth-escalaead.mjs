/**
 * Diagnóstico do Firebase Authentication do projeto escalaead.
 * - Sonda pública (API key do client) para detectar Identity Toolkit não provisionado.
 * - Consulta admin (service account) dos provedores, domínios autorizados e estado do serviço.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/check-auth-escalaead.mjs
 */
import { GoogleAuth } from "google-auth-library";

const project = "escalaead";
const apiKey = "AIzaSyAuAZO0L8ifpGDFqybvIlsuzNxMclW79o0";

async function publicProbe() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "probe@example.com",
        continueUri: "https://escalasemanal.vercel.app",
      }),
    }
  );
  const json = await res.json().catch(() => ({}));
  console.log("PUBLIC_PROBE", res.status, JSON.stringify(json).slice(0, 500));
}

async function adminCheck() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log("ADMIN_CHECK skipped (sem GOOGLE_APPLICATION_CREDENTIALS)");
    return;
  }
  const auth = new GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };

  const cfgRes = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
    { headers }
  );
  const cfg = await cfgRes.json().catch(() => ({}));
  console.log(
    "CONFIG",
    cfgRes.status,
    JSON.stringify(
      {
        authorizedDomains: cfg.authorizedDomains,
        signInProviders: Object.keys(cfg.signIn || {}).filter((k) => k !== "hashConfig"),
        error: cfg.error?.message || cfg.error,
      },
      null,
      2
    )
  );

  const idpRes = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs`,
    { headers }
  );
  const idp = await idpRes.json().catch(() => ({}));
  const safeIdp = (idp.defaultSupportedIdpConfigs || []).map((c) => ({
    idp: String(c.name || "").split("/").pop(),
    enabled: c.enabled,
    clientId: c.clientId ? `${String(c.clientId).slice(0, 12)}…` : null,
    clientSecret: c.clientSecret ? "[definido]" : null,
  }));
  console.log(
    "IDP_CONFIGS",
    idpRes.status,
    JSON.stringify(safeIdp.length ? safeIdp : idp.error || idp, null, 2).slice(0, 900)
  );
}

await publicProbe();
await adminCheck();
