/**
 * Banco de testes das regras do Firestore, executado no emulador local.
 *
 * Foco desta suíte (matriz final):
 * - isolamento por Divisão; Seção é particionamento, não ACL intra-Divisão
 * - Operador/Gestor/Admin acessam qualquer Seção da própria Divisão
 * - Admin não promove/edita/remove Gerente
 * - legendas/configuração escritas só pelo Gerente
 * - logs: Gerente global; Admin só a própria Divisão
 */
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

const DIV_A = "202002500";
const DIV_B = "202001800";

const PERFIS = {
  Gerente: {
    uid: "124342-0",
    email: "gerente@x.com",
    re: "124342-0",
    divisaoId: DIV_A,
  },
  Administrador: {
    uid: "962596-8",
    email: "admin@x.com",
    re: "962596-8",
    divisaoId: DIV_A,
  },
  Gestor: {
    uid: "111111-1",
    email: "gestor@x.com",
    re: "111111-1",
    divisaoId: DIV_A,
  },
  Operador: {
    uid: "222222-2",
    email: "op@x.com",
    re: "222222-2",
    divisaoId: DIV_A,
  },
} as const;

type PerfilNome = keyof typeof PERFIS;
const TODOS: PerfilNome[] = ["Gerente", "Administrador", "Gestor", "Operador"];

let env: RulesTestEnvironment;
let passou = 0;
const falhas: string[] = [];

let secaoA1 = "";
let secaoA2 = "";
let secaoB1 = "";

function dbDe(perfil: PerfilNome): Firestore {
  const p = PERFIS[perfil];
  return env.authenticatedContext(p.uid, {
    email: p.email,
    email_verified: true,
  }).firestore() as unknown as Firestore;
}

async function verifica(nome: string, esperado: "ALLOW" | "DENY", accao: () => Promise<unknown>) {
  try {
    if (esperado === "ALLOW") {
      await assertSucceeds(accao());
    } else {
      await assertFails(accao());
    }
    passou++;
    console.log(`PASS   ${nome}`);
  } catch {
    falhas.push(nome);
    console.log(`FALHA  ${nome}  (esperado ${esperado})`);
  }
}

async function semear() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;

    secaoA1 = doc(collection(db, "secoes")).id;
    secaoA2 = doc(collection(db, "secoes")).id;
    secaoB1 = doc(collection(db, "secoes")).id;

    await setDoc(doc(db, "divisoes", DIV_A), { codigo: DIV_A, nome: "Divisão EaD", ativo: true });
    await setDoc(doc(db, "divisoes", DIV_B), { codigo: DIV_B, nome: "Div Ens Pesq", ativo: true });

    await setDoc(doc(db, "secoes", secaoA1), { nome: "A1", divisaoId: DIV_A });
    await setDoc(doc(db, "secoes", secaoA2), { nome: "A2", divisaoId: DIV_A });
    await setDoc(doc(db, "secoes", secaoB1), { nome: "B1", divisaoId: DIV_B });

    const baseUsuario = (perfil: PerfilNome, secaoId: string) => ({
      re: PERFIS[perfil].re,
      nome: perfil,
      perfil,
      divisaoId: PERFIS[perfil].divisaoId,
      secaoId,
      email: PERFIS[perfil].email,
      ativo: true,
    });

    await setDoc(doc(db, "usuarios", PERFIS.Gerente.re), baseUsuario("Gerente", secaoA1));
    await setDoc(doc(db, "usuarios", PERFIS.Administrador.re), baseUsuario("Administrador", secaoA1));
    await setDoc(doc(db, "usuarios", PERFIS.Gestor.re), baseUsuario("Gestor", secaoA1));
    await setDoc(doc(db, "usuarios", PERFIS.Operador.re), baseUsuario("Operador", secaoA1));
    await setDoc(doc(db, "usuarios", "666666-6"), {
      re: "666666-6",
      nome: "Operador B",
      perfil: "Operador",
      divisaoId: DIV_B,
      secaoId: secaoB1,
      email: "op.div.b@x.com",
      ativo: true,
    });

    for (const perfil of TODOS) {
      await setDoc(doc(db, "auth_index", PERFIS[perfil].email), {
        re: PERFIS[perfil].re,
        perfil,
        divisaoId: PERFIS[perfil].divisaoId,
        secaoId: secaoA1,
        email: PERFIS[perfil].email,
      });
    }
    await setDoc(doc(db, "auth_index", "op.div.b@x.com"), {
      re: "666666-6",
      perfil: "Operador",
      divisaoId: DIV_B,
      secaoId: secaoB1,
      email: "op.div.b@x.com",
    });

    await setDoc(doc(db, "colaboradores", "col-a1"), { re: "1", nome: "A1", divisaoId: DIV_A, secaoId: secaoA1 });
    await setDoc(doc(db, "colaboradores", "col-a2"), { re: "2", nome: "A2", divisaoId: DIV_A, secaoId: secaoA2 });
    await setDoc(doc(db, "colaboradores", "col-b1"), { re: "3", nome: "B1", divisaoId: DIV_B, secaoId: secaoB1 });

    await setDoc(doc(db, "postos", "posto-a1"), { sigla: "CAP", divisaoId: DIV_A });
    await setDoc(doc(db, "legendas", "leg-a1"), { sigla: "F", descricao: "Falta" });
    await setDoc(doc(db, "legendas", "leg-glo"), { sigla: "G", descricao: "Global" });

    await setDoc(doc(db, "logs", "log-a"), {
      timestamp: new Date("2026-01-01"),
      divisaoId: DIV_A,
      tipo: "TESTE",
    });
    await setDoc(doc(db, "logs", "log-b"), {
      timestamp: new Date("2026-01-01"),
      divisaoId: DIV_B,
      tipo: "TESTE",
    });

    await setDoc(doc(db, "escalas_semanais", "esc-a1"), {
      divisaoId: DIV_A,
      ano: 2026,
      semana: 31,
      status: "aguardando_aprovacao",
      rows: [],
    });
    await setDoc(doc(db, "escalas_semanais", "esc-a2"), {
      divisaoId: DIV_A,
      ano: 2026,
      semana: 32,
      status: "aguardando_aprovacao",
      rows: [],
    });
    await setDoc(doc(db, "escalas_semanais", "esc-b1"), {
      divisaoId: DIV_B,
      ano: 2026,
      semana: 31,
      status: "aguardando_aprovacao",
      rows: [],
    });

    await setDoc(doc(db, "escalas_semanais", "esc-edit-a1"), {
      divisaoId: DIV_A,
      ano: 2026,
      semana: 33,
      status: "em_edicao",
      rows: [],
    });

    await setDoc(doc(db, "controle_frequencia", "freq-a1"), {
      divisaoId: DIV_A,
      secaoId: secaoA1,
      ano: 2026,
      mes: 7,
      status: "em_edicao",
    });
    await setDoc(doc(db, "controle_frequencia", "freq-a2"), {
      divisaoId: DIV_A,
      secaoId: secaoA2,
      ano: 2026,
      mes: 7,
      status: "em_edicao",
    });

    const baseSolicitacao = (id: string) => ({
      token: id,
      tipoDocumento: "ESCALA_SEMANAL",
      semana: 31,
      ano: 2026,
      escalaId: "esc-a1",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      versao: 1,
      status: "AGUARDANDO",
      criadoPor: { nome: "Operador", re: PERFIS.Operador.re, postoGrad: "" },
      criadoEm: new Date("2026-01-01"),
      expiraEm: new Date("2026-02-01"),
      utilizado: false,
      resultado: null,
      finalizadoPor: null,
    });
    await setDoc(doc(db, "solicitacoes_aprovacao", "sol-a"), baseSolicitacao("sol-a"));
    await setDoc(doc(db, "solicitacoes_aprovacao", "sol-b"), baseSolicitacao("sol-b"));
    await setDoc(doc(db, "solicitacoes_aprovacao", "sol-c"), baseSolicitacao("sol-c"));
    await setDoc(doc(db, "solicitacoes_aprovacao", "sol-d"), baseSolicitacao("sol-d"));

    await setDoc(doc(db, "presenca_online", "presenca-sem-divisao"), {
      re: "999",
      nome: "SemDivisao",
      lastSeen: new Date("2026-01-01"),
    });

    await setDoc(doc(db, "configuracoes", "gerais"), { nomeOrganizacao: "PMSP" });
    await setDoc(doc(db, "counters", "logs"), { next: 1 });
  });
}

async function main() {
  env = await initializeTestEnvironment({
    projectId: "escalaead-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await env.clearFirestore();
  await semear();

  console.log("\n=== Documento inexistente ===");
  for (const perfil of TODOS) {
    const db = dbDe(perfil);
    await verifica(`[${perfil}] ler escala inexistente`, "ALLOW", () =>
      getDoc(doc(db, "escalas_semanais", "nao-existe"))
    );
    await verifica(`[${perfil}] ler colaborador inexistente`, "ALLOW", () =>
      getDoc(doc(db, "colaboradores", "nao-existe"))
    );
    await verifica(`[${perfil}] ler seção inexistente`, "ALLOW", () =>
      getDoc(doc(db, "secoes", "nao-existe"))
    );
    await verifica(`[${perfil}] ler divisão inexistente`, "ALLOW", () =>
      getDoc(doc(db, "divisoes", "nao-existe"))
    );
  }

  console.log("\n=== Isolamento por Divisão (escalas) ===");
  await verifica("[Operador] ler escala da própria Divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Operador"), "escalas_semanais", "esc-a1"))
  );
  await verifica("[Operador] ler outra escala da mesma Divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Operador"), "escalas_semanais", "esc-a2"))
  );
  await verifica("[Administrador] ler escala da própria Divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Administrador"), "escalas_semanais", "esc-a2"))
  );
  await verifica("[Administrador] NÃO ler outra Divisão", "DENY", () =>
    getDoc(doc(dbDe("Administrador"), "escalas_semanais", "esc-b1"))
  );
  await verifica("[Gestor] ler escala da própria Divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Gestor"), "escalas_semanais", "esc-a2"))
  );
  await verifica("[Gestor] ler qualquer escala da própria Divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Gestor"), "escalas_semanais", "esc-a1"))
  );
  await verifica("[Gestor] NÃO ler escala de outra Divisão", "DENY", () =>
    getDoc(doc(dbDe("Gestor"), "escalas_semanais", "esc-b1"))
  );
  await verifica("[Gerente] ler cruzando Divisões", "ALLOW", () =>
    getDoc(doc(dbDe("Gerente"), "escalas_semanais", "esc-b1"))
  );

  console.log("\n=== Divisões ===");
  await verifica("[Administrador] ler própria divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Administrador"), "divisoes", DIV_A))
  );
  await verifica("[Administrador] NÃO ler outra divisão", "DENY", () =>
    getDoc(doc(dbDe("Administrador"), "divisoes", DIV_B))
  );
  await verifica("[Gerente] ler qualquer divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Gerente"), "divisoes", DIV_B))
  );
  await verifica("[Gestor] NÃO criar divisão", "DENY", () =>
    setDoc(doc(dbDe("Gestor"), "divisoes", "202003000"), { codigo: "202003000", nome: "Nova", ativo: true })
  );

  console.log("\n=== Workflow por Divisão (escalas sem secaoId) ===");
  await verifica("[Operador] criar escala sem secaoId", "ALLOW", () =>
    setDoc(doc(dbDe("Operador"), "escalas_semanais", "esc-op"), {
      divisaoId: DIV_A,
      ano: 2026,
      semana: 40,
      status: "em_edicao",
      rows: [],
    })
  );
  await verifica("[Operador] NÃO criar escala com secaoId", "DENY", () =>
    setDoc(doc(dbDe("Operador"), "escalas_semanais", "esc-op-com-secao"), {
      divisaoId: DIV_A,
      secaoId: secaoA1,
      ano: 2026,
      semana: 41,
      status: "em_edicao",
      rows: [],
    })
  );
  await verifica("[Gestor] NÃO criar escala", "DENY", () =>
    setDoc(doc(dbDe("Gestor"), "escalas_semanais", "esc-gestor"), {
      divisaoId: DIV_A,
      ano: 2026,
      semana: 42,
      status: "em_edicao",
      rows: [],
    })
  );
  // Salvar na UI reescreve o documento inteiro (setDoc sem merge):
  // o payload precisa reenviar divisaoId e NÃO deve incluir secaoId.
  await verifica("[Operador] salvar escala reescrevendo sem secaoId", "ALLOW", () =>
    setDoc(doc(dbDe("Operador"), "escalas_semanais", "esc-edit-a1"), {
      id: "esc-edit-a1",
      divisaoId: DIV_A,
      ano: 2026,
      semana: 33,
      status: "em_edicao",
      rows: [],
    })
  );
  await verifica("[Operador] NÃO salvar escala reescrevendo com secaoId", "DENY", () =>
    setDoc(doc(dbDe("Operador"), "escalas_semanais", "esc-edit-a1"), {
      id: "esc-edit-a1",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      ano: 2026,
      semana: 33,
      status: "em_edicao",
      rows: [],
    })
  );
  await verifica("[Gerente] salvar escala sem secaoId", "ALLOW", () =>
    setDoc(doc(dbDe("Gerente"), "escalas_semanais", "esc-edit-a1"), {
      id: "esc-edit-a1",
      divisaoId: DIV_A,
      ano: 2026,
      semana: 33,
      status: "em_edicao",
      rows: [],
    })
  );
  await verifica("[Gerente] NÃO mover escala para outra Divisão", "DENY", () =>
    setDoc(doc(dbDe("Gerente"), "escalas_semanais", "esc-edit-a1"), {
      id: "esc-edit-a1",
      divisaoId: DIV_B,
      ano: 2026,
      semana: 33,
      status: "em_edicao",
      rows: [],
    })
  );
  await verifica("[Operador] submeter escala da própria Divisão", "ALLOW", () =>
    updateDoc(doc(dbDe("Operador"), "escalas_semanais", "esc-edit-a1"), {
      status: "aguardando_aprovacao",
    })
  );
  await verifica("[Gestor] aprovar escala da própria Divisão", "ALLOW", () =>
    updateDoc(doc(dbDe("Gestor"), "escalas_semanais", "esc-a1"), {
      status: "aprovada",
    })
  );
  await verifica("[Gestor] aprovar outra escala da própria Divisão", "ALLOW", () =>
    updateDoc(doc(dbDe("Gestor"), "escalas_semanais", "esc-a2"), {
      status: "aprovada",
    })
  );
  await verifica("[Gestor] NÃO aprovar outra divisão", "DENY", () =>
    updateDoc(doc(dbDe("Gestor"), "escalas_semanais", "esc-b1"), {
      status: "aprovada",
    })
  );
  await verifica("[Administrador] editar doc em_edicao da própria seção", "ALLOW", () =>
    updateDoc(doc(dbDe("Administrador"), "controle_frequencia", "freq-a1"), {
      mes: 8,
    })
  );

  console.log("\n=== Colaboradores e usuarios ===");
  await verifica("[Operador] NÃO criar colaborador na própria seção", "DENY", () =>
    setDoc(doc(dbDe("Operador"), "colaboradores", "novo-op"), {
      re: "9",
      nome: "Novo",
      divisaoId: DIV_A,
      secaoId: secaoA1,
    })
  );
  await verifica("[Administrador] criar colaborador na própria seção", "ALLOW", () =>
    setDoc(doc(dbDe("Administrador"), "colaboradores", "novo-admin"), {
      re: "10",
      nome: "Novo Admin",
      divisaoId: DIV_A,
      secaoId: secaoA2,
    })
  );
  await verifica("[Operador] NÃO criar colaborador sem secaoId", "DENY", () =>
    setDoc(doc(dbDe("Operador"), "colaboradores", "novo-op-sem-secao"), {
      re: "9",
      nome: "Novo",
      divisaoId: DIV_A,
    })
  );
  await verifica("[Gestor] ler colaborador de outra seção da própria Divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Gestor"), "colaboradores", "col-a2"))
  );
  await verifica("[Gestor] NÃO ler colaborador de outra Divisão", "DENY", () =>
    getDoc(doc(dbDe("Gestor"), "colaboradores", "col-b1"))
  );
  await verifica("[Administrador] ler colaborador de outra seção da mesma divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Administrador"), "colaboradores", "col-a2"))
  );
  await verifica("[Operador] ler colaborador de outra seção da própria Divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Operador"), "colaboradores", "col-a2"))
  );
  await verifica("[Gerente] criar usuário em outra divisão com secaoId", "ALLOW", () =>
    setDoc(doc(dbDe("Gerente"), "usuarios", "333333-3"), {
      re: "333333-3",
      nome: "Novo",
      perfil: "Operador",
      divisaoId: DIV_B,
      secaoId: secaoB1,
      email: "novo@x.com",
      ativo: true,
    })
  );

  console.log("\n=== Legendas e configuração ===");
  await verifica("[Operador] ler legenda global", "ALLOW", () =>
    getDoc(doc(dbDe("Operador"), "legendas", "leg-glo"))
  );
  await verifica("[Administrador] NÃO alterar legenda", "DENY", () =>
    updateDoc(doc(dbDe("Administrador"), "legendas", "leg-a1"), {
      descricao: "Bloqueado",
    })
  );
  await verifica("[Administrador] NÃO alterar configurações", "DENY", () =>
    updateDoc(doc(dbDe("Administrador"), "configuracoes", "gerais"), {
      nomeOrganizacao: "Outro",
    })
  );
  await verifica("[Gerente] alterar legenda", "ALLOW", () =>
    updateDoc(doc(dbDe("Gerente"), "legendas", "leg-a1"), {
      descricao: "Gerente pode editar",
    })
  );
  await verifica("[Gerente] alterar configurações", "ALLOW", () =>
    updateDoc(doc(dbDe("Gerente"), "configuracoes", "gerais"), {
      nomeOrganizacao: "Nova Org",
    })
  );

  console.log("\n=== auth_index e autoatualização ===");
  await verifica("[Operador] espelhar auth_index com secaoId", "ALLOW", () =>
    setDoc(doc(dbDe("Operador"), "auth_index", PERFIS.Operador.email), {
      re: PERFIS.Operador.re,
      perfil: "Operador",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      email: PERFIS.Operador.email,
    })
  );
  await verifica("[Operador] NÃO forjar auth_index", "DENY", () =>
    setDoc(doc(dbDe("Operador"), "auth_index", PERFIS.Operador.email), {
      re: PERFIS.Operador.re,
      perfil: "Gerente",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      email: PERFIS.Operador.email,
    })
  );
  await verifica("[Operador] NÃO se promover a Gerente", "DENY", () =>
    updateDoc(doc(dbDe("Operador"), "usuarios", PERFIS.Operador.re), {
      perfil: "Gerente",
    })
  );
  await verifica("[Administrador] NÃO criar usuário Gerente", "DENY", () =>
    setDoc(doc(dbDe("Administrador"), "usuarios", "444444-4"), {
      re: "444444-4",
      nome: "NovoGerente",
      perfil: "Gerente",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      email: "novo.gerente@x.com",
      ativo: true,
    })
  );
  await verifica("[Administrador] NÃO promover Operador a Gerente", "DENY", () =>
    updateDoc(doc(dbDe("Administrador"), "usuarios", PERFIS.Operador.re), {
      perfil: "Gerente",
    })
  );
  await verifica("[Administrador] NÃO editar usuário Gerente", "DENY", () =>
    updateDoc(doc(dbDe("Administrador"), "usuarios", PERFIS.Gerente.re), {
      nome: "Hack",
    })
  );
  await verifica("[Administrador] NÃO gravar auth_index Gerente", "DENY", () =>
    setDoc(doc(dbDe("Administrador"), "auth_index", "forge.gerente@x.com"), {
      re: "444444-4",
      perfil: "Gerente",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      email: "forge.gerente@x.com",
    })
  );
  await verifica("[Administrador] criar Operador na própria Divisão", "ALLOW", () =>
    setDoc(doc(dbDe("Administrador"), "usuarios", "555555-5"), {
      re: "555555-5",
      nome: "NovoOp",
      perfil: "Operador",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      email: "novo.op@x.com",
      ativo: true,
    })
  );
  await verifica("[Administrador] NÃO forjar perfil no auth_index", "DENY", () =>
    setDoc(doc(dbDe("Administrador"), "auth_index", "novo.op@x.com"), {
      re: "555555-5",
      perfil: "Administrador",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      email: "novo.op@x.com",
    })
  );
  await verifica("[Administrador] criar auth_index espelhando usuário", "ALLOW", () =>
    setDoc(doc(dbDe("Administrador"), "auth_index", "novo.op@x.com"), {
      re: "555555-5",
      perfil: "Operador",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      email: "novo.op@x.com",
    })
  );
  await verifica("[Administrador] NÃO sobrescrever auth_index de outra Divisão", "DENY", () =>
    setDoc(doc(dbDe("Administrador"), "auth_index", "op.div.b@x.com"), {
      re: "666666-6",
      perfil: "Operador",
      divisaoId: DIV_A,
      secaoId: secaoA1,
      email: "op.div.b@x.com",
    })
  );
  await verifica("[Administrador] NÃO excluir auth_index de outra Divisão", "DENY", () =>
    deleteDoc(doc(dbDe("Administrador"), "auth_index", "op.div.b@x.com"))
  );
  await verifica("[Administrador] excluir auth_index da própria Divisão", "ALLOW", () =>
    deleteDoc(doc(dbDe("Administrador"), "auth_index", "novo.op@x.com"))
  );

  console.log("\n=== Logs, contadores e presença ===");
  await verifica("[Gerente] ler log de qualquer Divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Gerente"), "logs", "log-b"))
  );
  await verifica("[Administrador] ler log da própria Divisão", "ALLOW", () =>
    getDoc(doc(dbDe("Administrador"), "logs", "log-a"))
  );
  await verifica("[Administrador] NÃO ler log de outra Divisão", "DENY", () =>
    getDoc(doc(dbDe("Administrador"), "logs", "log-b"))
  );
  await verifica("[Operador] NÃO ler logs", "DENY", () =>
    getDoc(doc(dbDe("Operador"), "logs", "log-a"))
  );
  await verifica("[Gestor] NÃO ler logs", "DENY", () =>
    getDoc(doc(dbDe("Gestor"), "logs", "log-a"))
  );
  await verifica("[Gerente] escrever contador", "ALLOW", () =>
    setDoc(doc(dbDe("Gerente"), "counters", "logs"), { next: 2 }, { merge: true })
  );
  for (const perfil of TODOS) {
    await verifica(`[${perfil}] criar log com timestamp`, "ALLOW", () =>
      setDoc(doc(dbDe(perfil), "logs", `LOG-${perfil}`), {
        timestamp: serverTimestamp(),
        divisaoId: PERFIS[perfil].divisaoId,
        secaoId: secaoA1,
        tipo: "ALTERAR_CONFIGURACAO",
      })
    );
  }
  await verifica("[Gerente] NÃO forjar timestamp de log", "DENY", () =>
    setDoc(doc(dbDe("Gerente"), "logs", "LOG-FORJADO"), {
      timestamp: new Date("2020-01-01"),
      divisaoId: DIV_A,
      secaoId: secaoA1,
      tipo: "X",
    })
  );
  for (const perfil of TODOS) {
    await verifica(`[${perfil}] registrar presença própria`, "ALLOW", () =>
      setDoc(doc(dbDe(perfil), "presenca_online", PERFIS[perfil].re), {
        re: PERFIS[perfil].re,
        nome: perfil,
        divisaoId: DIV_A,
        secaoId: secaoA1,
        lastSeen: serverTimestamp(),
      })
    );
  }
  await verifica("[Operador] NÃO registrar presença de outro RE", "DENY", () =>
    setDoc(doc(dbDe("Operador"), "presenca_online", "999"), {
      re: "999",
      lastSeen: serverTimestamp(),
    })
  );

  console.log("\n=== controle_frequencia — Operador restrito à própria Seção ===");
  await verifica("[Operador] NÃO ler frequência de outra seção", "DENY", () =>
    getDoc(doc(dbDe("Operador"), "controle_frequencia", "freq-a2"))
  );
  await verifica("[Administrador] ler frequência de outra seção (mesma Divisão)", "ALLOW", () =>
    getDoc(doc(dbDe("Administrador"), "controle_frequencia", "freq-a2"))
  );
  await verifica("[Gestor] ler frequência de outra seção (mesma Divisão)", "ALLOW", () =>
    getDoc(doc(dbDe("Gestor"), "controle_frequencia", "freq-a2"))
  );
  await verifica("[Operador] NÃO editar frequência de outra seção", "DENY", () =>
    updateDoc(doc(dbDe("Operador"), "controle_frequencia", "freq-a2"), { mes: 9 })
  );
  await verifica("[Operador] editar frequência da própria seção", "ALLOW", () =>
    updateDoc(doc(dbDe("Operador"), "controle_frequencia", "freq-a1"), { mes: 9 })
  );
  await verifica("[Operador] NÃO criar frequência em outra seção", "DENY", () =>
    setDoc(doc(dbDe("Operador"), "controle_frequencia", "freq-op-outra-secao"), {
      divisaoId: DIV_A,
      secaoId: secaoA2,
      ano: 2026,
      mes: 10,
      status: "em_edicao",
    })
  );
  await verifica("[Operador] criar frequência na própria seção", "ALLOW", () =>
    setDoc(doc(dbDe("Operador"), "controle_frequencia", "freq-op-propria-secao"), {
      divisaoId: DIV_A,
      secaoId: secaoA1,
      ano: 2026,
      mes: 10,
      status: "em_edicao",
    })
  );

  console.log("\n=== solicitacoes_aprovacao — transições restritas por papel ===");
  await verifica("[Operador] NÃO aprovar solicitação (papel não autorizado)", "DENY", () =>
    updateDoc(doc(dbDe("Operador"), "solicitacoes_aprovacao", "sol-a"), {
      status: "FINALIZADA",
      resultado: "APROVADA",
      utilizado: true,
    })
  );
  await verifica("[Gestor] aprovar solicitação (AGUARDANDO → FINALIZADA)", "ALLOW", () =>
    updateDoc(doc(dbDe("Gestor"), "solicitacoes_aprovacao", "sol-a"), {
      status: "FINALIZADA",
      resultado: "APROVADA",
      utilizado: true,
    })
  );
  await verifica("[Gestor] NÃO cancelar solicitação (papel não autorizado)", "DENY", () =>
    updateDoc(doc(dbDe("Gestor"), "solicitacoes_aprovacao", "sol-b"), {
      status: "FINALIZADA",
      resultado: "CANCELADA",
      utilizado: true,
    })
  );
  await verifica("[Operador] cancelar a própria solicitação", "ALLOW", () =>
    updateDoc(doc(dbDe("Operador"), "solicitacoes_aprovacao", "sol-b"), {
      status: "FINALIZADA",
      resultado: "CANCELADA",
      utilizado: true,
    })
  );
  await verifica("[Operador] NÃO alterar secaoId da solicitação", "DENY", () =>
    updateDoc(doc(dbDe("Operador"), "solicitacoes_aprovacao", "sol-c"), {
      secaoId: secaoA2,
    })
  );
  await verifica("[Operador] NÃO update solicitação alheia livremente (sem transição válida)", "DENY", () =>
    updateDoc(doc(dbDe("Operador"), "solicitacoes_aprovacao", "sol-d"), {
      versao: 5,
    })
  );

  console.log("\n=== Gaps de segurança adicionais (logs e presença) ===");
  await verifica("[Administrador] NÃO criar log sem divisaoId", "DENY", () =>
    setDoc(doc(dbDe("Administrador"), "logs", "LOG-ADMIN-SEM-DIVISAO"), {
      timestamp: serverTimestamp(),
      tipo: "X",
    })
  );
  await verifica("[Gerente] criar log sem divisaoId", "ALLOW", () =>
    setDoc(doc(dbDe("Gerente"), "logs", "LOG-GERENTE-SEM-DIVISAO"), {
      timestamp: serverTimestamp(),
      tipo: "X",
    })
  );
  await verifica("[Administrador] NÃO ler presença sem divisaoId (outro tenant)", "DENY", () =>
    getDoc(doc(dbDe("Administrador"), "presenca_online", "presenca-sem-divisao"))
  );
  await verifica("[Gerente] ler presença sem divisaoId", "ALLOW", () =>
    getDoc(doc(dbDe("Gerente"), "presenca_online", "presenca-sem-divisao"))
  );
  await verifica("[Operador] NÃO registrar presença própria sem divisaoId", "DENY", () =>
    setDoc(doc(dbDe("Operador"), "presenca_online", "presenca-op-sem-divisao"), {
      re: PERFIS.Operador.re,
      lastSeen: serverTimestamp(),
    })
  );

  await env.cleanup();

  const total = passou + falhas.length;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passou}/${total} testes passaram`);
  if (falhas.length) {
    console.log(`\n${falhas.length} FALHA(S):`);
    for (const f of falhas) {
      console.log(`  - ${f}`);
    }
  }
  process.exit(falhas.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
