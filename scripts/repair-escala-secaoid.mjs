/**
 * Repara escalas/frequência que perderam `secaoId` ou `divisaoId`.
 * Os campos são reconstruídos a partir do ID `{divisaoId}__{secaoId}__{ano}__{semana}`.
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\service-account.json"
 *   node scripts/repair-escala-secaoid.mjs
 *   node scripts/repair-escala-secaoid.mjs --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const COLLECTIONS = ["escalas_semanais", "escalas_alteracao"];

function initDb() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS não definida.");
  const sa = JSON.parse(readFileSync(keyPath, "utf8"));
  if (!getApps().length) {
    initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }
  return getFirestore();
}

function parseEscalaId(id) {
  const parts = String(id || "").split("__");
  if (parts.length !== 4) return null;
  const [divisaoId, secaoId, ano, semana] = parts;
  if (!divisaoId || !secaoId) return null;
  return { divisaoId, secaoId, ano: Number(ano), semana: Number(semana) };
}

async function main() {
  const db = initDb();
  let broken = 0;
  let repaired = 0;
  let unresolved = 0;

  for (const collectionName of COLLECTIONS) {
    const snap = await db.collection(collectionName).get();
    console.log(`\n=== ${collectionName} (${snap.size} doc[s]) ===`);

    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      const missingSecao = !String(data.secaoId || "").trim();
      const missingDivisao = !String(data.divisaoId || "").trim();
      if (!missingSecao && !missingDivisao) continue;

      broken += 1;
      const parsed = parseEscalaId(docSnap.id);
      if (!parsed) {
        unresolved += 1;
        console.log(`- ${docSnap.id}: ID legado, não é possível derivar campos`);
        continue;
      }

      const patch = {};
      if (missingSecao) patch.secaoId = parsed.secaoId;
      if (missingDivisao) patch.divisaoId = parsed.divisaoId;

      console.log(`- ${docSnap.id}: ${JSON.stringify(patch)}`);
      if (APPLY) {
        await docSnap.ref.set(patch, { merge: true });
        repaired += 1;
      }
    }
  }

  console.log(`\nDocumentos inconsistentes: ${broken}`);
  console.log(`IDs legados sem correção automática: ${unresolved}`);
  console.log(
    APPLY
      ? `Documentos corrigidos: ${repaired}`
      : "Dry-run concluído. Reexecute com --apply para persistir."
  );
}

main().catch((error) => {
  console.error("Reparo falhou:", error);
  process.exit(1);
});
