/**
 * Garante que os domínios de produção estejam em Authentication → Authorized domains
 * do projeto escalaead. Idempotente: preserva os domínios já existentes.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/add-authorized-domain.mjs
 */
import { GoogleAuth } from "google-auth-library";

const project = "escalaead";
const REQUIRED_DOMAINS = ["escalasemanal.vercel.app"];

const auth = new GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const cfgRes = await fetch(
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
  { headers }
);
const cfg = await cfgRes.json();
const current = cfg.authorizedDomains || [];
console.log("ANTES", current);

const missing = REQUIRED_DOMAINS.filter((d) => !current.includes(d));
if (missing.length === 0) {
  console.log("OK — nada a fazer, domínios já autorizados.");
  process.exit(0);
}

const patch = await fetch(
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config?updateMask=authorizedDomains`,
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({ authorizedDomains: [...current, ...missing] }),
  }
);
const patchJson = await patch.json().catch(() => ({}));
console.log("PATCH", patch.status, patchJson.error?.message || "ok");
console.log("DEPOIS", patchJson.authorizedDomains || "(ver erro acima)");
