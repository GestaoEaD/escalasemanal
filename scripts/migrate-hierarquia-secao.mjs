/**
 * Migration admin SDK for section hierarchy.
 *
 * Default: dry-run.
 * Use --apply to persist changes.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const DRY_RUN = !APPLY;
const MOTIVO_MIGRACAO = "migracao hierarquia";

function readServiceAccount() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  }
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

function initDb() {
  const sa = readServiceAccount();
  if (!getApps().length) {
    initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }
  return getFirestore();
}

function normalizeSecaoNome(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeTexto(value) {
  return String(value || "").trim();
}

function looksLikeAutoId(value) {
  return /^[A-Za-z0-9]{20}$/.test(String(value || "").trim());
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function isTimestampLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.toDate === "function" &&
      typeof value.toMillis === "function"
  );
}

function sanitizeFirestoreValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (isTimestampLike(value)) return value;
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const next = sanitizeFirestoreValue(item);
      if (next !== undefined) out.push(next);
    }
    return out;
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const next = sanitizeFirestoreValue(item);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

function cleanData(value) {
  return sanitizeFirestoreValue(value);
}

function formatParts(date = new Date()) {
  const data =
    String(date.getDate()).padStart(2, "0") +
    "/" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "/" +
    date.getFullYear();
  const hora = String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  return {
    timestamp: Timestamp.fromDate(date),
    data,
    hora,
  };
}

function buildEscalaDocId(divisaoId, secaoId, ano, semana) {
  return `${normalizeTexto(divisaoId)}__${normalizeTexto(secaoId)}__${ano}__${String(semana).padStart(2, "0")}`;
}

function buildControleFrequenciaId(divisaoId, ano, mes, secaoId) {
  return `${normalizeTexto(divisaoId)}_${ano}_${String(mes).padStart(2, "0")}_${normalizeTexto(secaoId)}`;
}

function buildColaboradorDocId(divisaoId, re) {
  return `${normalizeTexto(divisaoId)}__${normalizeTexto(re)}`;
}

function splitLegacyScaleId(id) {
  const raw = normalizeTexto(id);
  if (!raw) return null;
  const shortLegacy = raw.match(/^(\d{4})_(\d{1,2})$/);
  if (shortLegacy) {
    const ano = Number(shortLegacy[1]);
    const semana = Number(shortLegacy[2]);
    if (Number.isFinite(ano) && Number.isFinite(semana) && ano >= 2000 && ano <= 2100 && semana >= 1 && semana <= 53) {
      return { divisaoId: "", ano, semana, legacy: true };
    }
  }
  const parts = raw.split("_");
  if (parts.length < 3) return null;
  const semana = Number(parts[parts.length - 1]);
  const ano = Number(parts[parts.length - 2]);
  if (!Number.isFinite(ano) || !Number.isFinite(semana)) return null;
  if (ano < 2000 || ano > 2100 || semana < 1 || semana > 53) return null;
  const divisaoId = parts.slice(0, -2).join("_").trim();
  if (!divisaoId) return null;
  return { divisaoId, ano, semana, legacy: true };
}

function splitNewScaleId(id) {
  const raw = normalizeTexto(id);
  const parts = raw.split("__");
  if (parts.length !== 4) return null;
  const ano = Number(parts[2]);
  const semana = Number(parts[3]);
  if (!Number.isFinite(ano) || !Number.isFinite(semana)) return null;
  if (ano < 2000 || ano > 2100 || semana < 1 || semana > 53) return null;
  const divisaoId = normalizeTexto(parts[0]);
  const secaoId = normalizeTexto(parts[1]);
  if (!divisaoId || !secaoId) return null;
  return { divisaoId, secaoId, ano, semana, legacy: false };
}

function splitControleFrequenciaId(id) {
  const raw = normalizeTexto(id);
  const parts = raw.split("_");
  if (parts.length < 4) return null;
  const divisaoId = normalizeTexto(parts[0]);
  const ano = Number(parts[1]);
  const mes = Number(parts[2]);
  const secaoId = normalizeTexto(parts.slice(3).join("_"));
  if (!divisaoId || !Number.isFinite(ano) || !Number.isFinite(mes) || !secaoId) return null;
  return { divisaoId, ano, mes, secaoId, legacy: false };
}

function resolveLegacySecaoName(value) {
  return normalizeSecaoNome(value);
}

function createCounterBucket() {
  return { total: 0, kept: 0, migrated: 0, skipped: 0, created: 0, updated: 0, deleted: 0, orphans: 0, ambiguities: 0 };
}

function pushLimited(list, value, limit = 50) {
  if (list.length < limit) list.push(value);
}

async function writeDoc(ref, data) {
  if (DRY_RUN) return;
  await ref.set(cleanData(data));
}

async function mergeDoc(ref, data) {
  if (DRY_RUN) return;
  await ref.set(cleanData(data), { merge: true });
}

async function deleteDoc(ref) {
  if (DRY_RUN) return;
  await ref.delete();
}

function makeSecaoResolver(secaoEntriesByKey, secaoIdByDocId, secaoIdByCanonicalName, report) {
  return function resolve(divisaoId, secaoValue) {
    const raw = normalizeTexto(secaoValue);
    if (!raw) {
      return { ok: false, reason: "empty" };
    }

    if (secaoIdByDocId.has(raw)) {
      return { ok: true, secaoId: secaoIdByDocId.get(raw), matchedBy: "docId" };
    }

    const key = `${normalizeTexto(divisaoId)}||${resolveLegacySecaoName(raw)}`;
    const entries = secaoEntriesByKey.get(key) || [];
    if (entries.length === 1) {
      return {
        ok: true,
        secaoId: entries[0].secaoId,
        matchedBy: "nome",
        entry: entries[0],
      };
    }

    if (entries.length > 1) {
      const current = entries.filter((entry) => entry.isCurrent);
      if (current.length === 1) {
        const preferred = current[0];
        const others = entries.filter((entry) => entry !== preferred);
        report.ambiguities.push(
          `${normalizeTexto(divisaoId)}||${resolveLegacySecaoName(raw)}: duplicates exist, preferring current secaoId ${preferred.secaoId}`
        );
        return {
          ok: true,
          secaoId: preferred.secaoId,
          matchedBy: "nome",
          entry: preferred,
          duplicates: others,
        };
      }
      return {
        ok: false,
        reason: "ambiguous",
        entries,
      };
    }

    return { ok: false, reason: "not_found" };
  };
}

function buildSectionIndexes(secaoSnapshots) {
  const secaoEntries = [];
  const secaoEntriesByKey = new Map();
  const secaoIdByDocId = new Map();
  const secaoIdByCanonicalName = new Map();

  for (const doc of secaoSnapshots) {
    const data = cleanData(doc.data()) || {};
    const divisaoId = normalizeTexto(data.divisaoId);
    const nome = normalizeTexto(data.nome);
    const canonicalName = resolveLegacySecaoName(nome);
    const isCurrent = looksLikeAutoId(doc.id) && normalizeTexto(data.id) === doc.id;
    const secaoId = isCurrent ? doc.id : doc.ref.firestore.collection("secoes").doc().id;

    const entry = {
      docId: doc.id,
      secaoId,
      divisaoId,
      nome,
      canonicalName,
      data,
      isCurrent,
      shouldMigrate: !isCurrent,
    };

    secaoEntries.push(entry);
    secaoIdByDocId.set(doc.id, secaoId);
    if (normalizeTexto(data.id) && normalizeTexto(data.id) !== doc.id) {
      secaoIdByDocId.set(normalizeTexto(data.id), secaoId);
    }

    const key = `${divisaoId}||${canonicalName}`;
    if (!secaoEntriesByKey.has(key)) secaoEntriesByKey.set(key, []);
    secaoEntriesByKey.get(key).push(entry);
  }

  for (const [key, entries] of secaoEntriesByKey.entries()) {
    if (entries.length === 1) {
      secaoIdByCanonicalName.set(key, entries[0].secaoId);
      continue;
    }
    const current = entries.filter((entry) => entry.isCurrent);
    if (current.length === 1) {
      secaoIdByCanonicalName.set(key, current[0].secaoId);
      continue;
    }
  }

  return { secaoEntries, secaoEntriesByKey, secaoIdByDocId, secaoIdByCanonicalName };
}

function summarizeSectionConflicts(secaoEntriesByKey) {
  const conflicts = [];
  for (const [key, entries] of secaoEntriesByKey.entries()) {
    if (entries.length <= 1) continue;
    const current = entries.filter((entry) => entry.isCurrent);
    if (current.length === 1) continue;
    conflicts.push({ key, entries });
  }
  return conflicts;
}

async function migrateSecoes(db, state, report) {
  const bucket = report.secoes;
  bucket.total = state.secaoEntries.length;

  for (const entry of state.secaoEntries) {
    if (entry.isCurrent) {
      bucket.kept += 1;
      continue;
    }

    bucket.migrated += 1;
    const newRef = db.collection("secoes").doc(entry.secaoId);
    const next = {
      ...entry.data,
      id: entry.secaoId,
      divisaoId: entry.divisaoId,
    };

    report.secaoMoves.push({ from: entry.docId, to: entry.secaoId, divisaoId: entry.divisaoId, nome: entry.nome });

    if (APPLY) {
      await writeDoc(newRef, next);
      await deleteDoc(db.collection("secoes").doc(entry.docId));
      bucket.created += 1;
      bucket.deleted += 1;
    }
  }
}

async function migrateColaboradores(db, state, report, resolveSecao) {
  const snap = await db.collection("colaboradores").get();
  const bucket = report.colaboradores;
  bucket.total = snap.size;

  for (const doc of snap.docs) {
    const data = cleanData(doc.data()) || {};
    const divisaoId = normalizeTexto(data.divisaoId);
    const re = normalizeTexto(data.re || doc.id);
    const secaoValue = normalizeTexto(data.secao);
    const resolved = resolveSecao(divisaoId, secaoValue);

    if (!resolved.ok) {
      bucket.orphans += 1;
      if (resolved.reason === "ambiguous") {
        bucket.ambiguities += 1;
        pushLimited(report.ambiguities, `colaboradores/${doc.id}: secao "${secaoValue}" ambigua in divisao ${divisaoId}`);
      } else {
        pushLimited(report.orphans, `colaboradores/${doc.id}: secao "${secaoValue}" nao encontrada na divisao ${divisaoId}`);
      }
      continue;
    }

    const next = {
      ...data,
      re,
      secaoId: resolved.secaoId,
      divisaoId,
    };
    const targetId = buildColaboradorDocId(divisaoId, re);
    const targetRef = db.collection("colaboradores").doc(targetId);
    const sameTarget = doc.id === targetId;

    bucket.migrated += 1;
    if (sameTarget) {
      report.colaboradorMoves.push({ from: doc.id, to: targetId, secaoId: resolved.secaoId, divisaoId });
      if (APPLY) {
        await mergeDoc(targetRef, next);
      }
      continue;
    }

    report.colaboradorMoves.push({ from: doc.id, to: targetId, secaoId: resolved.secaoId, divisaoId });
    if (APPLY) {
      await writeDoc(targetRef, { ...next, id: targetId });
      await deleteDoc(doc.ref);
      bucket.created += 1;
      bucket.deleted += 1;
    }
  }
}

async function migrateUsuariosAndAuthIndex(db, state, report, resolveSecao) {
  const usuariosSnap = await db.collection("usuarios").get();
  const bucket = report.usuarios;
  bucket.total = usuariosSnap.size;

  for (const doc of usuariosSnap.docs) {
    const data = cleanData(doc.data()) || {};
    const divisaoId = normalizeTexto(data.divisaoId);
    const secaoValue = normalizeTexto(data.secao);
    const perfil = normalizeTexto(data.perfil);
    const resolved = resolveSecao(divisaoId, secaoValue);
    const next = { ...data, divisaoId };

    if (resolved.ok) {
      next.secaoId = resolved.secaoId;
      if (perfil === "Gestor" && (!Array.isArray(next.secoesResponsaveisIds) || next.secoesResponsaveisIds.length === 0)) {
        next.secoesResponsaveisIds = [resolved.secaoId];
      }
      bucket.migrated += 1;
      report.usuarioMoves.push({ id: doc.id, secaoId: resolved.secaoId, divisaoId });
    } else {
      bucket.orphans += 1;
      if (resolved.reason === "ambiguous") {
        bucket.ambiguities += 1;
        pushLimited(report.ambiguities, `usuarios/${doc.id}: secao "${secaoValue}" ambigua in divisao ${divisaoId}`);
      } else {
        pushLimited(report.orphans, `usuarios/${doc.id}: secao "${secaoValue}" nao encontrada na divisao ${divisaoId}`);
      }
    }

    if (APPLY) {
      await mergeDoc(doc.ref, next);
    }

    const email = normalizeTexto(data.email).toLowerCase();
    if (email) {
      const authNext = {
        email,
        re: normalizeTexto(data.re || doc.id),
        perfil: perfil || "Operador",
        ativo: data.ativo !== false,
        secao: secaoValue,
        secaoId: normalizeTexto(next.secaoId),
        secoesResponsaveisIds: Array.isArray(next.secoesResponsaveisIds)
          ? next.secoesResponsaveisIds.map((value) => normalizeTexto(value)).filter(Boolean)
          : [],
        divisaoId,
        updatedAt: new Date().toISOString(),
      };
      if (APPLY) {
        await mergeDoc(db.collection("auth_index").doc(email), authNext);
      }
      report.authIndexUpdates += 1;
    }
  }
}

function groupRowsBySecao(rows) {
  const grouped = new Map();
  const orphanRows = [];
  for (const row of rows || []) {
    const secaoValue = normalizeTexto(row?.secao);
    const key = resolveLegacySecaoName(secaoValue);
    if (!key) {
      orphanRows.push(row);
      continue;
    }
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return { grouped, orphanRows };
}

async function migrateEscalasCollection(db, collectionName, state, report, resolveSecao) {
  const snap = await db.collection(collectionName).get();
  const bucket = report[collectionName];
  bucket.total = snap.size;

  for (const doc of snap.docs) {
    const data = cleanData(doc.data()) || {};
    const parsedNew = splitNewScaleId(doc.id);
    const parsedLegacy = splitLegacyScaleId(doc.id);
    const divisaoId = normalizeTexto(data.divisaoId || parsedNew?.divisaoId || parsedLegacy?.divisaoId);
    const ano = Number(data.ano || parsedNew?.ano || parsedLegacy?.ano);
    const semana = Number(data.semana || parsedNew?.semana || parsedLegacy?.semana);
    const secaoIdField = normalizeTexto(data.secaoId);
    const isCurrent = Boolean(
      parsedNew &&
        secaoIdField &&
        parsedNew.divisaoId === divisaoId &&
        parsedNew.secaoId === secaoIdField &&
        parsedNew.ano === ano &&
        parsedNew.semana === semana &&
        normalizeTexto(data.id) === doc.id
    );

    if (isCurrent) {
      bucket.kept += 1;
      continue;
    }

    const rows = Array.isArray(data.rows) ? data.rows : [];
    const { grouped, orphanRows } = groupRowsBySecao(rows);
    if (orphanRows.length) {
      bucket.orphans += orphanRows.length;
      pushLimited(
        report.orphans,
        `${collectionName}/${doc.id}: ${orphanRows.length} row(s) sem secao valida`
      );
    }

    const docSecaoCandidates = [];
    if (secaoIdField) docSecaoCandidates.push(secaoIdField);
    if (normalizeTexto(data.secao)) docSecaoCandidates.push(normalizeTexto(data.secao));

    const targetGroups = new Map();
    for (const [secaoKey, secaoRows] of grouped.entries()) {
      const sampleRow = secaoRows[0] || {};
      const secaoValue = normalizeTexto(sampleRow.secao);
      const resolved = resolveSecao(divisaoId, secaoValue);
      if (!resolved.ok) {
        bucket.orphans += secaoRows.length;
        if (resolved.reason === "ambiguous") {
          bucket.ambiguities += 1;
          pushLimited(
            report.ambiguities,
            `${collectionName}/${doc.id}: rows da secao "${secaoValue}" ambguas na divisao ${divisaoId}`
          );
        } else {
          pushLimited(
            report.orphans,
            `${collectionName}/${doc.id}: secao "${secaoValue}" nao encontrada na divisao ${divisaoId}`
          );
        }
        continue;
      }
      targetGroups.set(resolved.secaoId, {
        secaoId: resolved.secaoId,
        secaoValue,
        rows: secaoRows,
      });
    }

    if (!targetGroups.size && docSecaoCandidates.length) {
      for (const candidate of docSecaoCandidates) {
        const resolved = resolveSecao(divisaoId, candidate);
        if (resolved.ok) {
          targetGroups.set(resolved.secaoId, {
            secaoId: resolved.secaoId,
            secaoValue: candidate,
            rows: rows,
          });
          break;
        }
      }
    }

    if (!targetGroups.size) {
      // Documentos vazios (sem rows e sem seção) são lixo legado seguro de remover.
      if (rows.length === 0) {
        bucket.deleted += 1;
        pushLimited(
          report.orphans,
          `${collectionName}/${doc.id}: documento vazio legado — será removido`
        );
        if (APPLY) {
          await deleteDoc(doc.ref);
        }
        continue;
      }
      bucket.orphans += 1;
      pushLimited(report.orphans, `${collectionName}/${doc.id}: nao foi possivel resolver secao destino`);
      continue;
    }

    for (const target of targetGroups.values()) {
      const targetId = buildEscalaDocId(divisaoId, target.secaoId, ano, semana);
      const targetRef = db.collection(collectionName).doc(targetId);
      const next = {
        ...data,
        id: targetId,
        divisaoId,
        secaoId: target.secaoId,
        ano,
        semana,
        rows: target.rows,
      };

      bucket.migrated += 1;
      report.scaleMoves.push({ collection: collectionName, from: doc.id, to: targetId, secaoId: target.secaoId, rows: target.rows.length });

      if (APPLY) {
        await writeDoc(targetRef, next);
      }
    }

    if (APPLY) {
      await deleteDoc(doc.ref);
      bucket.deleted += 1;
    }
  }
}

async function migrateControleFrequencia(db, state, report, resolveSecao) {
  const snap = await db.collection("controle_frequencia").get();
  const bucket = report.controle_frequencia;
  bucket.total = snap.size;

  for (const doc of snap.docs) {
    const data = cleanData(doc.data()) || {};
    const parsed = splitControleFrequenciaId(doc.id);
    const divisaoId = normalizeTexto(data.divisaoId || parsed?.divisaoId);
    const ano = Number(data.ano || parsed?.ano);
    const mes = Number(data.mes || parsed?.mes);
    const secaoName = normalizeTexto(data.secao || parsed?.secaoId);
    const secaoIdField = normalizeTexto(data.secaoId);
    const isCurrent = Boolean(
      parsed &&
        secaoIdField &&
        parsed.divisaoId === divisaoId &&
        parsed.ano === ano &&
        parsed.mes === mes &&
        parsed.secaoId === secaoIdField &&
        normalizeTexto(data.id) === doc.id
    );

    if (isCurrent) {
      bucket.kept += 1;
      continue;
    }

    const resolved = resolveSecao(divisaoId, secaoName || secaoIdField);
    if (!resolved.ok) {
      bucket.orphans += 1;
      if (resolved.reason === "ambiguous") {
        bucket.ambiguities += 1;
        pushLimited(report.ambiguities, `controle_frequencia/${doc.id}: secao "${secaoName}" ambigua in divisao ${divisaoId}`);
      } else {
        pushLimited(report.orphans, `controle_frequencia/${doc.id}: secao "${secaoName}" nao encontrada na divisao ${divisaoId}`);
      }
      continue;
    }

    const targetId = buildControleFrequenciaId(divisaoId, ano, mes, resolved.secaoId);
    const targetRef = db.collection("controle_frequencia").doc(targetId);
    const next = {
      ...data,
      id: targetId,
      divisaoId,
      secaoId: resolved.secaoId,
      ano,
      mes,
    };

    bucket.migrated += 1;
    report.cfMoves.push({ from: doc.id, to: targetId, secaoId: resolved.secaoId });

    if (APPLY) {
      await writeDoc(targetRef, next);
      await deleteDoc(doc.ref);
      bucket.deleted += 1;
      bucket.created += 1;
    }
  }
}

function parseSolicitacaoLegacyScaleId(escalaId) {
  const raw = normalizeTexto(escalaId);
  if (!raw) return null;
  const newParsed = splitNewScaleId(raw);
  if (newParsed) return { ...newParsed, legacy: false };
  const legacyParsed = splitLegacyScaleId(raw);
  if (legacyParsed) return legacyParsed;
  return null;
}

async function migrateSolicitacoes(db, state, report, resolveSecao) {
  const snap = await db.collection("solicitacoes_aprovacao").get();
  const bucket = report.solicitacoes_aprovacao;
  bucket.total = snap.size;

  for (const doc of snap.docs) {
    const data = cleanData(doc.data()) || {};
    const status = normalizeTexto(data.status);
    const resultado = normalizeTexto(data.resultado);
    const escalaId = normalizeTexto(data.escalaId);
    const secaoIdField = normalizeTexto(data.secaoId);
    const secaoFromData = normalizeTexto(data.secao || data.secaoNome || "");
    const parsedScale = parseSolicitacaoLegacyScaleId(escalaId);
    const resolved = resolveSecao(normalizeTexto(data.divisaoId), secaoIdField || secaoFromData || parsedScale?.secaoId || "");

    const next = { ...data };
    let changed = false;

    if (parsedScale && parsedScale.legacy) {
      bucket.legacy += 1;
      if (status === "AGUARDANDO") {
        next.status = "FINALIZADA";
        next.resultado = "CANCELADA";
        next.utilizado = true;
        next.motivo = MOTIVO_MIGRACAO;
        const { timestamp, data: dataFinalizacao, hora: horaFinalizacao } = formatParts();
        next.finalizadoEm = timestamp;
        next.dataFinalizacao = dataFinalizacao;
        next.horaFinalizacao = horaFinalizacao;
        changed = true;
        report.solicitacaoCancels.push({ id: doc.id, escalaId });
      } else {
        if (resolved.ok && !secaoIdField) {
          next.secaoId = resolved.secaoId;
          changed = true;
        }
        report.solicitacaoLegacyKeeps.push({ id: doc.id, escalaId });
      }
    } else {
      if (resolved.ok && !secaoIdField) {
        next.secaoId = resolved.secaoId;
        changed = true;
      }
    }

    if (status === "AGUARDANDO" && parsedScale && parsedScale.legacy && resultado !== "CANCELADA") {
      bucket.pendingLegacy += 1;
      pushLimited(report.pendingLegacySolicitacoes, `solicitacoes_aprovacao/${doc.id}: escalaId legacy ${escalaId}`);
    }

    if (changed) {
      bucket.migrated += 1;
      if (APPLY) {
        await mergeDoc(doc.ref, next);
      }
    } else {
      bucket.kept += 1;
    }
  }
}

function reportHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function printList(label, list) {
  if (!list.length) return;
  console.log(label);
  for (const item of list.slice(0, 40)) {
    console.log(`  - ${item}`);
  }
  if (list.length > 40) {
    console.log(`  ... and ${list.length - 40} more`);
  }
}

function printSummary(report) {
  reportHeader("Summary");
  console.log(`Mode: ${APPLY ? "apply" : "dry-run"}`);
  console.log(`Sections: ${report.secoes.migrated} to create, ${report.secoes.kept} already current`);
  console.log(`Colaborators: ${report.colaboradores.migrated} touched, ${report.colaboradores.orphans} orphans, ${report.colaboradores.ambiguities} ambiguities`);
  console.log(`Users: ${report.usuarios.migrated} touched, ${report.usuarios.orphans} orphans, ${report.usuarios.ambiguities} ambiguities`);
  console.log(`Auth index updates planned: ${report.authIndexUpdates}`);
  console.log(`Scales weekly: ${report.escalas_semanais.migrated} docs/groups, ${report.escalas_semanais.kept} already current, ${report.escalas_semanais.orphans} orphan rows/docs`);
  console.log(`Scales alteration: ${report.escalas_alteracao.migrated} docs/groups, ${report.escalas_alteracao.kept} already current, ${report.escalas_alteracao.orphans} orphan rows/docs`);
  console.log(`Controle frequencia: ${report.controle_frequencia.migrated} docs, ${report.controle_frequencia.kept} already current, ${report.controle_frequencia.orphans} issues`);
  console.log(`Solicitacoes: ${report.solicitacoes_aprovacao.migrated} updated, ${report.solicitacoes_aprovacao.kept} unchanged, ${report.solicitacoes_aprovacao.pendingLegacy} pending legacy`);
  console.log(`Section conflicts: ${report.conflicts.length}`);

  reportHeader("Section moves");
  if (report.secaoMoves.length) {
    for (const move of report.secaoMoves.slice(0, 60)) {
      console.log(`  - ${move.from} -> ${move.to} | divisao=${move.divisaoId} | nome=${move.nome}`);
    }
    if (report.secaoMoves.length > 60) console.log(`  ... and ${report.secaoMoves.length - 60} more`);
  } else {
    console.log("  none");
  }

  reportHeader("Collaborator moves");
  if (report.colaboradorMoves.length) {
    for (const move of report.colaboradorMoves.slice(0, 60)) {
      console.log(`  - ${move.from} -> ${move.to} | divisao=${move.divisaoId} | secaoId=${move.secaoId}`);
    }
    if (report.colaboradorMoves.length > 60) console.log(`  ... and ${report.colaboradorMoves.length - 60} more`);
  } else {
    console.log("  none");
  }

  reportHeader("User moves");
  if (report.usuarioMoves.length) {
    for (const move of report.usuarioMoves.slice(0, 60)) {
      console.log(`  - ${move.id} | divisao=${move.divisaoId} | secaoId=${move.secaoId}`);
    }
    if (report.usuarioMoves.length > 60) console.log(`  ... and ${report.usuarioMoves.length - 60} more`);
  } else {
    console.log("  none");
  }

  reportHeader("Scale moves");
  if (report.scaleMoves.length) {
    for (const move of report.scaleMoves.slice(0, 80)) {
      console.log(`  - ${move.collection}/${move.from} -> ${move.to} | secaoId=${move.secaoId} | rows=${move.rows}`);
    }
    if (report.scaleMoves.length > 80) console.log(`  ... and ${report.scaleMoves.length - 80} more`);
  } else {
    console.log("  none");
  }

  reportHeader("Controle de frequencia moves");
  if (report.cfMoves.length) {
    for (const move of report.cfMoves.slice(0, 80)) {
      console.log(`  - ${move.from} -> ${move.to} | secaoId=${move.secaoId}`);
    }
    if (report.cfMoves.length > 80) console.log(`  ... and ${report.cfMoves.length - 80} more`);
  } else {
    console.log("  none");
  }

  reportHeader("Pending solicitacoes")
  if (report.pendingLegacySolicitacoes.length) {
    for (const item of report.pendingLegacySolicitacoes.slice(0, 80)) {
      console.log(`  - ${item}`);
    }
    if (report.pendingLegacySolicitacoes.length > 80) console.log(`  ... and ${report.pendingLegacySolicitacoes.length - 80} more`);
  } else {
    console.log("  none");
  }

  reportHeader("Orphans");
  if (report.orphans.length) {
    for (const item of report.orphans.slice(0, 80)) {
      console.log(`  - ${item}`);
    }
    if (report.orphans.length > 80) console.log(`  ... and ${report.orphans.length - 80} more`);
  } else {
    console.log("  none");
  }

  reportHeader("Ambiguities");
  if (report.ambiguities.length) {
    for (const item of report.ambiguities.slice(0, 80)) {
      console.log(`  - ${item}`);
    }
    if (report.ambiguities.length > 80) console.log(`  ... and ${report.ambiguities.length - 80} more`);
  } else {
    console.log("  none");
  }

  if (report.conflicts.length) {
    reportHeader("Conflicts");
    for (const item of report.conflicts.slice(0, 80)) {
      console.log(`  - ${item}`);
    }
    if (report.conflicts.length > 80) console.log(`  ... and ${report.conflicts.length - 80} more`);
  }
}

async function main() {
  const db = initDb();

  const report = {
    secoes: createCounterBucket(),
    colaboradores: createCounterBucket(),
    usuarios: createCounterBucket(),
    escalas_semanais: createCounterBucket(),
    escalas_alteracao: createCounterBucket(),
    controle_frequencia: createCounterBucket(),
    solicitacoes_aprovacao: { ...createCounterBucket(), pendingLegacy: 0 },
    authIndexUpdates: 0,
    secaoMoves: [],
    colaboradorMoves: [],
    usuarioMoves: [],
    scaleMoves: [],
    cfMoves: [],
    solicitacaoCancels: [],
    solicitacaoLegacyKeeps: [],
    pendingLegacySolicitacoes: [],
    orphans: [],
    ambiguities: [],
    conflicts: [],
  };

  const secaoSnap = await db.collection("secoes").get();
  const state = buildSectionIndexes(secaoSnap.docs);
  const conflicts = summarizeSectionConflicts(state.secaoEntriesByKey);
  for (const conflict of conflicts) {
    report.conflicts.push(
      `${conflict.key}: ${conflict.entries.map((entry) => `${entry.docId}=>${entry.secaoId}`).join(", ")}`
    );
  }

  const resolveSecao = makeSecaoResolver(
    state.secaoEntriesByKey,
    state.secaoIdByDocId,
    state.secaoIdByCanonicalName,
    report
  );

  await migrateSecoes(db, state, report);
  await migrateColaboradores(db, state, report, resolveSecao);
  await migrateUsuariosAndAuthIndex(db, state, report, resolveSecao);
  await migrateEscalasCollection(db, "escalas_semanais", state, report, resolveSecao);
  await migrateEscalasCollection(db, "escalas_alteracao", state, report, resolveSecao);
  await migrateControleFrequencia(db, state, report, resolveSecao);
  await migrateSolicitacoes(db, state, report, resolveSecao);

  printSummary(report);

  if (DRY_RUN) {
    console.log("\nDry-run only. Re-run with --apply to persist changes.");
  } else {
    console.log("\nApply completed.");
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});


