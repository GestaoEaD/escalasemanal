/**
 * Carrega o Código da OPM de uma seção pelo nome (escopo da Divisão).
 */
import { db, collection, doc, getDoc, getDocs, query, where } from "../firebase";
import { DIVISAO_EAD_ID, Secao } from "../types";
import { KNOWN_SECAO_CODIGOS } from "./seedData";
import { normalizeCodigoOpm } from "./frequenciaHeader";

export async function loadCodigoOpmBySecaoNome(
  nomeSecao: string,
  divisaoId: string = DIVISAO_EAD_ID
): Promise<string> {
  const nome = String(nomeSecao || "").trim();
  if (!nome) return "";

  try {
    const snap = await getDocs(
      query(collection(db, "secoes"), where("divisaoId", "==", divisaoId))
    );
    for (const d of snap.docs) {
      const data = d.data();
      if (String(data.nome || "").trim() === nome) {
        const codigo = normalizeCodigoOpm(data.codigo);
        if (codigo) return codigo;
        break;
      }
    }
  } catch (err) {
    console.error("Falha ao carregar Código da OPM da seção:", err);
  }

  return KNOWN_SECAO_CODIGOS[nome] || "";
}

export async function loadSecaoById(
  secaoId: string,
  divisaoId: string = DIVISAO_EAD_ID
): Promise<Secao | null> {
  const id = String(secaoId || "").trim();
  if (!id) return null;

  try {
    const snap = await getDoc(doc(db, "secoes", id));
    if (!snap.exists()) return null;
    const data = snap.data() as Secao;
    if (String(data.divisaoId || "").trim() !== String(divisaoId || "").trim()) {
      return null;
    }
    return {
      ...data,
      id: snap.id,
      nome: String(data.nome || "").trim(),
      codigo: normalizeCodigoOpm(data.codigo),
      divisaoId: String(data.divisaoId || divisaoId),
    };
  } catch (err) {
    console.error("Falha ao carregar seção por ID:", err);
    return null;
  }
}
