/**
 * Repository Firestore — Configurações Gerais (`configuracoes/gerais`).
 * Somente I/O; validações e permissões ficam na camada de services/validators.
 */
import { db, doc, getDoc, setDoc } from "../firebase";
import { prepareFirestoreWrite } from "../utils/firestoreSanitize";

const COLLECTION = "configuracoes";
const GERAIS_ID = "gerais";

export interface ConfiguracaoGerais {
  nomeOrganizacao: string;
  unidade: string;
  pdfExportHeader: string;
  excelExportHeader: string;
  tema: string;
  idioma: string;
  [key: string]: unknown;
}

export async function getGerais(): Promise<ConfiguracaoGerais | null> {
  const snap = await getDoc(doc(db, COLLECTION, GERAIS_ID));
  if (!snap.exists()) return null;
  return snap.data() as ConfiguracaoGerais;
}

export async function saveGerais(data: Record<string, unknown>): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, GERAIS_ID),
    prepareFirestoreWrite(`${COLLECTION}/${GERAIS_ID}`, data)
  );
}
