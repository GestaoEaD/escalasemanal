/**
 * Carrega o Código da OPM de uma seção pelo nome.
 */
import { db, collection, getDocs } from "../firebase";
import { KNOWN_SECAO_CODIGOS } from "./seedData";
import { normalizeCodigoOpm } from "./frequenciaHeader";

export async function loadCodigoOpmBySecaoNome(nomeSecao: string): Promise<string> {
  const nome = String(nomeSecao || "").trim();
  if (!nome) return "";

  try {
    const snap = await getDocs(collection(db, "secoes"));
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
