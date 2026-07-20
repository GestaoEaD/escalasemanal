import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp 
} from "../firebase";
import { Colaborador, Usuario } from "../types";

export const TEST_USER: Usuario = {
  re: "124342-0",
  nome: "VENTURA",
  nomeCompleto: "Alex Herlemann Ventura",
  postoGrad: "CB PM",
  secao: "Seç Gest Educ",
  perfil: "Administrador",
  ativo: true
};

export const OFFICIAL_COLLABORATORS = [
  { ordem: 1, postoGrad: "MAJ PM", re: "104585-7", nome: "AUGUSTO", secao: "Seç Gest Educ", ativo: true },
  { ordem: 2, postoGrad: "CAP PM", re: "970568-6", nome: "FERREIRA", secao: "Seç Gest Educ", ativo: true },
  { ordem: 3, postoGrad: "CAP PM", re: "127739-1", nome: "FABBRI", secao: "Seç Gest Educ", ativo: true },
  { ordem: 4, postoGrad: "CAP PM", re: "102931-2", nome: "DAMACENO", secao: "Seç Gest Educ", ativo: true },
  { ordem: 5, postoGrad: "1º TEN PM", re: "966676-1", nome: "LEANDRO", secao: "Seç Gest Educ", ativo: true },
  { ordem: 6, postoGrad: "SUBTEN PM", re: "962596-8", nome: "HAMILTON", secao: "Seç Gest Educ", ativo: true },
  { ordem: 7, postoGrad: "SUBTEN PM", re: "982826-5", nome: "EDUARDO", secao: "Seç Gest Educ", ativo: true },
  { ordem: 8, postoGrad: "1º SGT PM", re: "128687-A", nome: "BIAZI", secao: "Seç Gest Educ", ativo: true },
  { ordem: 9, postoGrad: "2º SGT PM", re: "141486-A", nome: "VINNICIUS", secao: "Seç Gest Educ", ativo: true },
  { ordem: 10, postoGrad: "2º SGT PM", re: "967185-4", nome: "NÍVEA", secao: "Seç Gest Educ", ativo: true },
  { ordem: 11, postoGrad: "CB PM", re: "141464-0", nome: "JEHÁ", secao: "Seç Gest Educ", ativo: true },
  { ordem: 12, postoGrad: "CB PM", re: "124342-0", nome: "VENTURA", secao: "Seç Gest Educ", ativo: true },
  { ordem: 13, postoGrad: "CB PM", re: "144727-A", nome: "FREITAS", secao: "Seç Gest Educ", ativo: true },
  { ordem: 14, postoGrad: "CB PM", re: "149504-6", nome: "LYBIA", secao: "Seç Gest Educ", ativo: true },
  { ordem: 15, postoGrad: "CB PM", re: "151287-A", nome: "JOSUÉ", secao: "Seç Gest Educ", ativo: true },
  { ordem: 16, postoGrad: "CB PM", re: "150385-5", nome: "PÂMELA", secao: "Seç Gest Educ", ativo: true },
  { ordem: 17, postoGrad: "CB PM", re: "147817-6", nome: "PAGLIATO", secao: "Seç Gest Educ", ativo: true },
  { ordem: 18, postoGrad: "CB PM", re: "201331-2", nome: "GIOVANNA", secao: "Seç Gest Educ", ativo: true },
  { ordem: 19, postoGrad: "CB PM", re: "146570-8", nome: "KAREN", secao: "Seç Gest Educ", ativo: true },
  { ordem: 20, postoGrad: "CB PM", re: "147445-6", nome: "RODRIGUES", secao: "Seç Gest Educ", ativo: true },
];

export const OFFICIAL_POSTOS = [
  { sigla: "SD PM", descricao: "SOLDADO", ordem: 1 },
  { sigla: "CB PM", descricao: "CABO", ordem: 2 },
  { sigla: "3º SGT PM", descricao: "3º SARGENTO", ordem: 3 },
  { sigla: "2º SGT PM", descricao: "2º SARGENTO", ordem: 4 },
  { sigla: "1º SGT PM", descricao: "1º SARGENTO", ordem: 5 },
  { sigla: "SUBTEN PM", descricao: "SUBTENENTE", ordem: 6 },
  { sigla: "2º TEN PM", descricao: "2º TENENTE", ordem: 7 },
  { sigla: "1º TEN PM", descricao: "1º TENENTE", ordem: 8 },
  { sigla: "CAP PM", descricao: "CAPITÃO", ordem: 9 },
  { sigla: "MAJ PM", descricao: "MAJOR", ordem: 10 },
  { sigla: "TEN CEL PM", descricao: "TENENTE-CORONEL", ordem: 11 },
  { sigla: "CEL PM", descricao: "CORONEL", ordem: 12 },
];

export const OFFICIAL_LEGENDAS = [
  { ordem: 1, sigla: "EN", descricao: "EXPEDIENTE NORMAL", cor: "verde", ativo: true },
  { ordem: 2, sigla: "F", descricao: "FOLGA", cor: "amarelo", ativo: true },
  { ordem: 3, sigla: "FC", descricao: "FOLGA COMPENSAÇÃO", cor: "laranja", ativo: true },
  { ordem: 4, sigla: "M", descricao: "FOLGA MANHÃ", cor: "azul-claro", ativo: true },
  { ordem: 5, sigla: "T", descricao: "FOLGA TARDE", cor: "azul-medio", ativo: true },
  { ordem: 6, sigla: "MC", descricao: "MANHÃ COMPENSAÇÃO", cor: "roxo-claro", ativo: true },
  { ordem: 7, sigla: "TC", descricao: "TARDE COMPENSAÇÃO", cor: "roxo-escuro", ativo: true },
  { ordem: 8, sigla: "FÉRIAS", descricao: "FÉRIAS", cor: "verde-escuro", ativo: true },
  { ordem: 9, sigla: "LP", descricao: "LICENÇA-PRÊMIO", cor: "cinza", ativo: true },
  { ordem: 10, sigla: "DS", descricao: "DISPENSA", cor: "vermelho-claro", ativo: true },
  { ordem: 11, sigla: "LT", descricao: "LICENÇA PARA TRATAMENTO", cor: "vermelho", ativo: true },
  { ordem: 12, sigla: "CONVAL", descricao: "CONVALESCENÇA", cor: "bordo", ativo: true },
  { ordem: 13, sigla: "EX", descricao: "ESCALA EXTRA", cor: "azul-escuro", ativo: true },
  { ordem: 14, sigla: "OBS", descricao: "OBSERVAÇÃO", cor: "cinza-escuro", ativo: true },
];

export const OFFICIAL_SECOES = [
  { nome: "Seç Gest Educ", ativo: true, ordem: 1 },
  { nome: "Comando", ativo: true, ordem: 2 },
  { nome: "Seção de Pessoal", ativo: true, ordem: 3 },
  { nome: "Seção de Operações", ativo: true, ordem: 4 }
];

/**
 * Seed initial official data into Firestore
 */
export async function seedDatabaseIfEmpty() {
  try {
    console.log("Iniciando verificação e semeadura oficial do banco de dados...");

    // Check status document
    const statusDocRef = doc(db, "configuracoes", "status");
    const statusSnap = await getDoc(statusDocRef);
    const statusData = statusSnap.exists() ? statusSnap.data() : null;

    const needsSeeding = !statusData || !statusData.official_seeded;

    // 1. Seed/Update Test User in usuarios
    const userDocRef = doc(db, "usuarios", TEST_USER.re);
    await setDoc(userDocRef, TEST_USER);
    console.log("Usuário de teste 'VENTURA' configurado com sucesso.");

    if (needsSeeding) {
      console.log("Semeadura oficial necessária. Iniciando limpeza e cadastro de dados oficiais...");

      // A. Delete existing collaborators first
      const colCollectionRef = collection(db, "colaboradores");
      const colSnap = await getDocs(colCollectionRef);
      if (!colSnap.empty) {
        console.log(`Limpando ${colSnap.docs.length} colaboradores fictícios antigos...`);
        const deleteBatch = writeBatch(db);
        colSnap.docs.forEach((doc) => {
          deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
      }

      // B. Insert official collaborators
      console.log("Inserindo 20 colaboradores oficiais...");
      const colBatch = writeBatch(db);
      OFFICIAL_COLLABORATORS.forEach((col) => {
        const colDocRef = doc(db, "colaboradores", col.re);
        colBatch.set(colDocRef, {
          ...col,
          observacao: col.re === "124342-0" ? "Usuário do sistema" : "",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
      });
      await colBatch.commit();

      // C. Insert official postos
      console.log("Inserindo postos oficiais...");
      const postosBatch = writeBatch(db);
      OFFICIAL_POSTOS.forEach((p) => {
        // Document ID can be normalized sigla
        const docId = p.sigla.replace(/\s+/g, "_").replace(/[ºª]/g, "");
        const postoDocRef = doc(db, "postos", docId);
        postosBatch.set(postoDocRef, {
          sigla: p.sigla,
          descricao: p.descricao,
          ordem: p.ordem,
          createdAt: Timestamp.now()
        });
      });
      await postosBatch.commit();

      // D. Insert official legendas
      console.log("Inserindo legendas oficiais...");
      const legendasBatch = writeBatch(db);
      OFFICIAL_LEGENDAS.forEach((l) => {
        const docId = l.sigla.replace(/\s+/g, "_").replace(/[ºª]/g, "");
        const legendaDocRef = doc(db, "legendas", docId);
        legendasBatch.set(legendaDocRef, {
          sigla: l.sigla,
          descricao: l.descricao,
          cor: l.cor,
          ativo: l.ativo,
          ordem: l.ordem,
          createdAt: Timestamp.now()
        });
      });
      await legendasBatch.commit();

      // E. Insert official secoes
      console.log("Inserindo seções oficiais...");
      const secoesBatch = writeBatch(db);
      OFFICIAL_SECOES.forEach((s) => {
        const docId = s.nome.replace(/\s+/g, "_").replace(/[ºª]/g, "");
        const secaoDocRef = doc(db, "secoes", docId);
        secoesBatch.set(secaoDocRef, {
          nome: s.nome,
          ativo: s.ativo,
          ordem: s.ordem,
          createdAt: Timestamp.now()
        });
      });
      await secoesBatch.commit();

      // F. Create test weekly scale if missing
      const weeklyDocRef = doc(db, "escalas_semanais", "test_escala_semanal");
      const weeklySnap = await getDoc(weeklyDocRef);
      if (!weeklySnap.exists()) {
        await setDoc(weeklyDocRef, {
          id: "test_escala_semanal",
          ano: 2026,
          semana: 1,
          periodo: "05/01/2026 a 11/01/2026",
          rows: [],
          lastSaved: null
        });
      }

      // G. Create test alteration scale if missing
      const alterationDocRef = doc(db, "escalas_alteracao", "test_escala_alteracao");
      const alterationSnap = await getDoc(alterationDocRef);
      if (!alterationSnap.exists()) {
        await setDoc(alterationDocRef, {
          id: "test_escala_alteracao",
          ano: 2026,
          semana: 1,
          periodo: "05/01/2026 a 11/01/2026",
          rows: [],
          lastSaved: null
        });
      }

      // H. Create initial logs if missing
      const logDocRef = doc(db, "logs", "test_init_log");
      const logSnap = await getDoc(logDocRef);
      if (!logSnap.exists()) {
        await setDoc(logDocRef, {
          timestamp: Timestamp.now(),
          data: "08/07/2026",
          hora: "06:46:00",
          usuario: "Sistema",
          re: "000000",
          painel: "Sistema",
          colaborador: "N/A",
          campoAlterado: "Integração",
          valorAnterior: "Nenhum",
          novoValor: "Conectado",
          anoSemana: "N/A"
        });
      }

      // Complete Seeding
      await setDoc(statusDocRef, {
        conectado: true,
        official_seeded: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      console.log("Semeadura oficial concluída com sucesso!");
    } else {
      console.log("Banco de dados já contém os dados oficiais cadastrados.");
    }

    // 2. Perform test CRUD check
    console.log("Verificando conectividade e permissões com teste CRUD...");
    const testCrudRef = doc(db, "configuracoes", "test_crud_verification");

    // Write
    await setDoc(testCrudRef, {
      status: "testing_write",
      timestamp: Timestamp.now()
    });
    console.log("-> Teste de Gravação: OK");

    // Read
    let testSnap = await getDoc(testCrudRef);
    let readRetries = 5;
    while (readRetries > 0 && (!testSnap.exists() || testSnap.data()?.status !== "testing_write")) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      testSnap = await getDoc(testCrudRef);
      readRetries--;
    }
    if (!testSnap.exists() || testSnap.data()?.status !== "testing_write") {
      throw new Error(`Erro de verificação: Gravação/Leitura falhou. Exists: ${testSnap.exists()}, Data: ${JSON.stringify(testSnap.data() || null)}`);
    }
    console.log("-> Teste de Leitura: OK");

    // Update
    await updateDoc(testCrudRef, {
      status: "testing_update",
      updatedAt: Timestamp.now()
    });
    let updatedSnap = await getDoc(testCrudRef);
    let updateRetries = 5;
    while (updateRetries > 0 && (!updatedSnap.exists() || updatedSnap.data()?.status !== "testing_update")) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      updatedSnap = await getDoc(testCrudRef);
      updateRetries--;
    }
    console.log("-> updatedSnap data:", updatedSnap.exists() ? updatedSnap.data() : null);
    if (!updatedSnap.exists() || updatedSnap.data().status !== "testing_update") {
      throw new Error("Erro de verificação: Atualização falhou.");
    }
    console.log("-> Teste de Atualização: OK");

    // Delete
    await deleteDoc(testCrudRef);
    let deletedSnap = await getDoc(testCrudRef);
    let deleteRetries = 5;
    while (deleteRetries > 0 && deletedSnap.exists()) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      deletedSnap = await getDoc(testCrudRef);
      deleteRetries--;
    }
    if (deletedSnap.exists()) {
      throw new Error("Erro de verificação: Exclusão falhou.");
    }
    console.log("-> Teste de Exclusão: OK");

    console.log("Operações CRUD executadas com sucesso sem erros de permissão!");
  } catch (error) {
    console.error("Erro durante verificação/semeadura do banco de dados:", error);
  }
}
