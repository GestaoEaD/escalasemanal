import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getWeeksForYear } from "../src/utils/dateUtils.ts";
import {
  buildLegendaLookup,
  convertEscalaValorToFrequencia,
} from "../src/utils/frequenciaCalculo.ts";
import { syncFrequenciaRows } from "../src/utils/frequenciaSync.ts";
import { normalizeLegenda } from "../src/utils/legendaModel.ts";
import { buildEscalaDocId } from "../src/utils/divisaoIds.ts";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const DIV = "202002500";
const weeks = getWeeksForYear(2026);
for (const n of [30, 31, 32]) {
  const w = weeks.find((x) => x.numero === n);
  console.log(
    `Semana ${n}: ${w.startDate.toDateString()} → ${w.endDate.toDateString()} id=${w.id}`
  );
}

const enSnap = await db.collection("legendas").doc("EN").get();
const legendas = (await db.collection("legendas").get()).docs.map((d) =>
  normalizeLegenda(d.data())
);
const lookup = buildLegendaLookup(legendas);
console.log("EN convert:", convertEscalaValorToFrequencia("EN", lookup));
console.log("EN doc:", enSnap.data()?.representacoes);

// Load real scale for week 30 and sync August
const id30 = buildEscalaDocId(DIV, 2026, 30);
const sem30 = (await db.collection("escalas_semanais").doc(id30).get()).data();
console.log("scale30 id", id30, "rows", sem30?.rows?.length);

const scaleDocs = {};
for (const n of [30, 31, 32, 33, 34, 35]) {
  const id = buildEscalaDocId(DIV, 2026, n);
  const snap = await db.collection("escalas_semanais").doc(id).get();
  const weekId = `2026_${String(n).padStart(2, "0")}`;
  scaleDocs[weekId] = {
    semanal: snap.exists ? snap.data() : null,
    alteracao: null,
  };
  console.log(weekId, "exists=", snap.exists);
}

const cols = [
  {
    re: "127739-1",
    postoGrad: "CAP PM",
    nome: "FABBRI",
    secao: "Seção Gest Educ",
    ativo: true,
    ordem: 1,
  },
];

const { rows } = syncFrequenciaRows({
  ano: 2026,
  mes: 8,
  secao: "Seção Gest Educ",
  colaboradores: cols,
  legendas,
  scaleDocs,
});

const dias = rows[0].dias;
for (let d = 1; d <= 10; d++) {
  const k = String(d).padStart(2, "0");
  const c = dias[k];
  console.log(
    `ago ${k}: valor="${c?.valor}" origem=${c?.origem} origEscala=${c?.valorEscalaOriginal || ""}`
  );
}

const { rows: jul } = syncFrequenciaRows({
  ano: 2026,
  mes: 7,
  secao: "Seção Gest Educ",
  colaboradores: cols,
  legendas,
  scaleDocs: {
    ...scaleDocs,
    "2026_29": { semanal: null, alteracao: null },
  },
});
for (let d = 27; d <= 31; d++) {
  const k = String(d).padStart(2, "0");
  const c = jul[0].dias[k];
  console.log(
    `jul ${k}: valor="${c?.valor}" origem=${c?.origem} origEscala=${c?.valorEscalaOriginal || ""}`
  );
}
