/**
 * Deploy firestore.rules via Firebase Rules API (Application Default Credentials
 * ou GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_TOKEN).
 *
 * Uso:
 *   node scripts/deploy-firestore-rules.mjs
 *   npx firebase-tools deploy --only firestore:rules
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const projectId = "gen-lang-client-0610988869";
const databases = [
  "(default)",
  "ai-studio-27d48337-faf8-4a27-a402-a865ec6f3b72",
];

function tryFirebaseCli() {
  const env = { ...process.env };
  if (process.env.FIREBASE_TOKEN) {
    env.FIREBASE_TOKEN = process.env.FIREBASE_TOKEN;
  }
  const r = spawnSync(
    "npx",
    [
      "--yes",
      "firebase-tools@13",
      "deploy",
      "--only",
      "firestore:rules",
      "--project",
      projectId,
      "--non-interactive",
    ],
    { cwd: root, env, encoding: "utf8", shell: true }
  );
  console.log(r.stdout || "");
  console.error(r.stderr || "");
  return r.status === 0;
}

async function tryRestApi() {
  let GoogleAuth;
  try {
    ({ GoogleAuth } = await import("google-auth-library"));
  } catch {
    console.error("google-auth-library não disponível; use FIREBASE_TOKEN ou firebase login.");
    return false;
  }

  const auth = new GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/firebase",
    ],
  });
  let client;
  try {
    client = await auth.getClient();
  } catch (e) {
    console.error("Sem Application Default Credentials:", e.message || e);
    return false;
  }

  const rules = readFileSync(resolve(root, "firestore.rules"), "utf8");
  const tokenRes = await client.getAccessToken();
  const accessToken = tokenRes?.token;
  if (!accessToken) {
    console.error("Não foi possível obter access token.");
    return false;
  }

  // 1) Create ruleset
  const createRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: {
          files: [{ name: "firestore.rules", content: rules }],
        },
      }),
    }
  );
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error("Falha ao criar ruleset:", JSON.stringify(created, null, 2));
    return false;
  }
  const rulesetName = created.name;
  console.log("Ruleset criado:", rulesetName);

  // 2) Release for each database
  for (const database of databases) {
    const releaseId =
      database === "(default)"
        ? `cloud.firestore`
        : `cloud.firestore/${database}`;
    const releaseName = `projects/${projectId}/releases/${encodeURIComponent(releaseId)}`;
    // PUT release
    const relRes = await fetch(
      `https://firebaserules.googleapis.com/v1/${releaseName}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          release: {
            name: `projects/${projectId}/releases/${releaseId}`,
            rulesetName,
          },
        }),
      }
    );
    // Some APIs use update with create semantics via POST to releases
    if (!relRes.ok) {
      const postRes = await fetch(
        `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases?releaseId=${encodeURIComponent(releaseId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: `projects/${projectId}/releases/${releaseId}`,
            rulesetName,
          }),
        }
      );
      const postBody = await postRes.json();
      if (!postRes.ok) {
        // try updateRelease
        const upd = await fetch(
          `https://firebaserules.googleapis.com/v1/${releaseName}?updateMask=rulesetName`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ rulesetName }),
          }
        );
        const updBody = await upd.json();
        if (!upd.ok) {
          console.error(
            `Falha release ${database}:`,
            JSON.stringify({ rel: await relRes.json().catch(() => null), postBody, updBody }, null, 2)
          );
          return false;
        }
        console.log("Release atualizado:", database, updBody.name || releaseId);
      } else {
        console.log("Release criado:", database, postBody.name || releaseId);
      }
    } else {
      const body = await relRes.json();
      console.log("Release OK:", database, body.name || releaseId);
    }
  }
  return true;
}

async function main() {
  console.log("Tentando deploy via firebase-tools...");
  if (tryFirebaseCli()) {
    console.log("Deploy CLI OK.");
    process.exit(0);
  }
  console.log("CLI falhou; tentando REST + ADC...");
  const ok = await tryRestApi();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
