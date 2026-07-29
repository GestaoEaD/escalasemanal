/**
 * Compara as rules publicadas no Firestore com o firestore.rules local
 * e inspeciona auth_index (fonte de verdade do perfil dentro das rules).
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/check-rules-and-authindex.mjs
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";

const project = "escalaead";
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const sa = JSON.parse(readFileSync(saPath, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const gauth = new GoogleAuth({
  keyFile: saPath,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const client = await gauth.getClient();
const { token } = await client.getAccessToken();
const headers = { Authorization: `Bearer ${token}` };

const relRes = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${project}/releases`,
  { headers }
);
const rel = await relRes.json();
const release = (rel.releases || []).find((r) =>
  r.name.endsWith("cloud.firestore")
);
console.log("RELEASE", release?.name, "updateTime:", release?.updateTime);

let liveSource = "";
if (release?.rulesetName) {
  const rsRes = await fetch(
    `https://firebaserules.googleapis.com/v1/${release.rulesetName}`,
    { headers }
  );
  const rs = await rsRes.json();
  liveSource = (rs.source?.files || []).map((f) => f.content).join("\n");
  console.log("RULESET createTime:", rs.createTime);
}

const localSource = readFileSync("firestore.rules", "utf8");
const norm = (s) => s.replace(/\r\n/g, "\n").trim();
console.log("RULES_IGUAIS_AO_LOCAL:", norm(liveSource) === norm(localSource));
console.log("LIVE tem match /divisoes:", liveSource.includes("/divisoes/"));
console.log("LIVE tem isGerente:", liveSource.includes("isGerente"));

console.log("\n--- auth_index ---");
const idx = await db.collection("auth_index").get();
for (const d of idx.docs) {
  const v = d.data();
  console.log(
    `  ${d.id.replace(/^(.{3}).*(@.*)$/, "$1***$2")} | perfil=${v.perfil} | re=${v.re} | divisaoId=${v.divisaoId || "(vazio)"}`
  );
}

console.log("\n--- usuarios (perfil x auth_index) ---");
const us = await db.collection("usuarios").get();
for (const d of us.docs) {
  const u = d.data();
  const email = (u.email || "").trim().toLowerCase();
  const ai = email ? await db.collection("auth_index").doc(email).get() : null;
  console.log(
    `  ${d.id} | usuarios.perfil=${u.perfil} | auth_index=${
      ai && ai.exists ? ai.data().perfil : "AUSENTE"
    }`
  );
}
