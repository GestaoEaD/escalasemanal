/**
 * Popula o catálogo base (apenas postos) de uma Divisão recém-criada.
 * As legendas agora são globais e são seedadas em outro fluxo.
 */
import {
  writeBatch,
  doc,
  collection,
  getDocs,
  query,
  where,
  db,
  Timestamp,
} from "../firebase";
import { OFFICIAL_POSTOS } from "./seedData";
import { tenantDocId } from "./tenantDocIds";
import { prepareFirestoreWrite } from "./firestoreSanitize";

/**
 * Se a Divisão ainda não tem postos, copia o catálogo oficial.
 * Idempotente: não sobrescreve catálogo já existente.
 */
export async function ensureCatalogoBaseDivisao(divisaoId: string): Promise<{
  postosCriados: number;
}> {
  const codigo = String(divisaoId || "").trim();
  if (!codigo) return { postosCriados: 0 };

  const postosSnap = await getDocs(query(collection(db, "postos"), where("divisaoId", "==", codigo)));

  const batch = writeBatch(db);
  let postosCriados = 0;
  const agora = Timestamp.now();

  if (postosSnap.empty) {
    for (const p of OFFICIAL_POSTOS) {
      const docId = tenantDocId(codigo, p.sigla);
      batch.set(
        doc(db, "postos", docId),
        prepareFirestoreWrite(`postos/${docId}`, {
          sigla: p.sigla,
          descricao: p.descricao,
          ordem: p.ordem,
          divisaoId: codigo,
          createdAt: agora,
        })
      );
      postosCriados++;
    }
  }

  if (postosCriados > 0) {
    await batch.commit();
  }

  return { postosCriados };
}
