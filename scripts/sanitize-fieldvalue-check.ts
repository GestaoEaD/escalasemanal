/**
 * Verifica que sentinels do Firestore sobrevivem ao prepareFirestoreWrite.
 * Regressão: serverTimestamp() virava mapa {_methodName} e reprovava a rule
 * `request.resource.data.timestamp == request.time` na coleção logs.
 *
 * Uso: npx tsx scripts/sanitize-fieldvalue-check.ts
 */
import { FieldValue, arrayUnion, increment, serverTimestamp, Timestamp } from "firebase/firestore";
import { prepareFirestoreWrite, sanitizeFirestoreData } from "../src/utils/firestoreSanitize";

let falhas = 0;
function check(nome: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FALHA"}  ${nome}`);
  if (!ok) falhas++;
}

const st = serverTimestamp();
const out = sanitizeFirestoreData({ timestamp: st, nested: { inc: increment(1) } }) as Record<
  string,
  unknown
>;

check("serverTimestamp continua FieldValue", out.timestamp instanceof FieldValue);
check("serverTimestamp e o mesmo objeto", out.timestamp === st);
check(
  "increment aninhado continua FieldValue",
  (out.nested as Record<string, unknown>).inc instanceof FieldValue
);
check("arrayUnion continua FieldValue", sanitizeFirestoreData(arrayUnion("a")) instanceof FieldValue);

const ts = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
check("Timestamp preservado", sanitizeFirestoreData(ts) === ts);

const d = new Date();
check("Date preservado", sanitizeFirestoreData(d) === d);

const prepared = prepareFirestoreWrite("logs/LOG-TESTE", {
  timestamp: serverTimestamp(),
  usuario: { re: "1", nome: "x", ignorar: undefined },
}) as Record<string, unknown>;
check("prepareFirestoreWrite preserva sentinel", prepared.timestamp instanceof FieldValue);
check(
  "prepareFirestoreWrite ainda remove undefined",
  !("ignorar" in (prepared.usuario as Record<string, unknown>))
);

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} TESTE(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
