import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const all = await db.collection("controle_frequencia").get();
for (const d of all.docs) {
  const data = d.data();
  const secao = String(data.secao || "");
  if (!secao.toLowerCase().includes("gest")) continue;
  if (!String(d.id).includes("2026_07") && data.mes !== 7) continue;
  console.log("DOC", d.id, "secao=", secao, "status=", data.status, "sync=", data.syncMeta);
  const row = (data.rows || []).find((r) => r.re === "127739-1");
  if (!row) {
    console.log("  (sem FABBRI)");
    continue;
  }
  for (let i = 27; i <= 31; i++) {
    const k = String(i).padStart(2, "0");
    const c = row.dias?.[k];
    console.log(
      `  ${k}: valor="${c?.valor ?? ""}" origem=${c?.origem ?? "-"} escala=${c?.valorEscalaOriginal ?? ""}`
    );
  }
}
