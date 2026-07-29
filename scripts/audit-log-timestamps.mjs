/**
 * Quantifica logs cujo campo timestamp foi gravado como mapa {_methodName}
 * em vez de Timestamp do servidor (efeito do sanitizador que destruía o sentinel).
 *
 * Uso:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\escalaead-firebase-adminsdk-*.json"
 *   node scripts/audit-log-timestamps.mjs [--fix]
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const FIX = process.argv.includes("--fix");

const snap = await db.collection("logs").get();
let ok = 0;
const quebrados = [];
for (const d of snap.docs) {
  const v = d.data();
  const t = v.timestamp;
  if (t instanceof Timestamp) ok++;
  else quebrados.push({ id: d.id, valor: JSON.stringify(t), dataHora: v.dataHora || v.data || null });
}

console.log(`logs total=${snap.size} | timestamp OK=${ok} | quebrados=${quebrados.length}`);
for (const q of quebrados.slice(0, 15)) {
  console.log(`  ${q.id} | timestamp=${q.valor} | dataHora=${q.dataHora}`);
}
if (quebrados.length > 15) console.log(`  …(+${quebrados.length - 15})`);

if (!FIX) {
  console.log("\n(dry-run — rode com --fix para reconstruir a partir de dataHora)");
  process.exit(0);
}

let corrigidos = 0;
let semFonte = 0;
for (const q of quebrados) {
  const doc = await db.collection("logs").doc(q.id).get();
  const v = doc.data();
  // dataHora no formato "DD/MM/AAAA HH:MM:SS"
  const m = /^(\d{2})\/(\d{2})\/(\d{4})[ ,]+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    String(v.dataHora || "").trim()
  );
  if (!m) {
    semFonte++;
    continue;
  }
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  // Horário local de São Paulo (UTC-3)
  const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss || "00"}-03:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    semFonte++;
    continue;
  }
  await db.collection("logs").doc(q.id).update({ timestamp: Timestamp.fromDate(date) });
  corrigidos++;
}
console.log(`\ncorrigidos=${corrigidos} | sem dataHora utilizavel=${semFonte}`);
