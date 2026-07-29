/**
 * Deploy firestore.rules no projeto escalaead via Rules API.
 * Requer GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON do Admin SDK.
 *
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-....json"
 *   npm run deploy:rules
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleAuth } from "google-auth-library";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const projectId = "escalaead";
const releaseId = "cloud.firestore";

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("Defina GOOGLE_APPLICATION_CREDENTIALS com o caminho do JSON Admin SDK.");
    process.exit(1);
  }

  const auth = new GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/firebase",
    ],
  });
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const accessToken = tokenRes?.token;
  if (!accessToken) throw new Error("Sem access token");

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const rules = readFileSync(resolve(root, "firestore.rules"), "utf8");
  const createRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: { files: [{ name: "firestore.rules", content: rules }] },
      }),
    }
  );
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error("Falha ao criar ruleset:", JSON.stringify(created, null, 2));
    process.exit(1);
  }
  console.log("Ruleset:", created.name);

  const releaseName = `projects/${projectId}/releases/${releaseId}`;
  const upd = await fetch(
    `https://firebaserules.googleapis.com/v1/${releaseName}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        release: { name: releaseName, rulesetName: created.name },
      }),
    }
  );
  const body = await upd.json();
  if (!upd.ok) {
    console.error("Falha no release:", JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log("Release OK:", body.name, "→", body.rulesetName);
  console.log("updateTime:", body.updateTime);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
