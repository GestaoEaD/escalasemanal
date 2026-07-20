/**
 * Utilitários para evitar "Unsupported field value: undefined" no Firestore.
 */

function isFirestoreTimestamp(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  );
}

function isFirestoreDocumentReference(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { path?: unknown }).path === "string" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { withConverter?: unknown }).withConverter === "function"
  );
}

function isFirestoreBytes(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { toUint8Array?: unknown }).toUint8Array === "function"
  );
}

/** Tipos especiais do Firestore/JS que não devem ser "abertos" como mapa. */
function isFirestoreSpecialType(value: unknown): boolean {
  if (value instanceof Date) return true;
  if (isFirestoreTimestamp(value)) return true;
  if (isFirestoreDocumentReference(value)) return true;
  if (isFirestoreBytes(value)) return true;
  return false;
}

/**
 * Qualquer objeto "mapa" (inclui objetos vindos do Firestore SDK) deve ser
 * percorrido — a versão anterior falhava ao ignorar não-plain objects.
 */
function isSanitizableMap(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (isFirestoreSpecialType(value)) return false;
  return true;
}

/** Percorre o valor e retorna caminhos com `undefined`. */
export function findUndefinedPaths(value: unknown, path = ""): string[] {
  const paths: string[] = [];

  if (value === undefined) {
    paths.push(path || "(root)");
    return paths;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const next = path ? `${path}[${index}]` : `[${index}]`;
      if (item === undefined) {
        paths.push(next);
      } else {
        paths.push(...findUndefinedPaths(item, next));
      }
    });
    return paths;
  }

  if (isSanitizableMap(value)) {
    for (const key of Object.keys(value)) {
      const child = value[key];
      const next = path ? `${path}.${key}` : key;
      if (child === undefined) {
        paths.push(next);
      } else {
        paths.push(...findUndefinedPaths(child, next));
      }
    }
  }

  return paths;
}

/**
 * Remove propriedades `undefined` (objetos) e troca itens `undefined` de arrays por `null`.
 * Preserva Timestamp, Date, DocumentReference e demais tipos suportados pelo Firestore.
 */
export function sanitizeFirestoreData<T>(value: T): T {
  if (value === undefined) {
    return null as unknown as T;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (isFirestoreSpecialType(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : sanitizeFirestoreData(item)
    ) as unknown as T;
  }

  if (isSanitizableMap(value)) {
    const cleaned: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (child === undefined) continue;
      cleaned[key] = sanitizeFirestoreData(child);
    }
    return cleaned as T;
  }

  return value;
}

/** Lança erro legível se ainda restar undefined após sanitização. */
export function assertNoUndefined(label: string, data: unknown): void {
  const paths = findUndefinedPaths(data);
  if (paths.length > 0) {
    console.error(`[Firestore] undefined restante em "${label}":`, paths);
    console.error(`[Firestore] objeto:`, data);
    throw new Error(
      `Dados inválidos para Firestore (${label}). Campos undefined: ${paths.join(", ")}`
    );
  }
}

/**
 * Loga caminhos undefined (origem), sanitiza e garante que nada undefined vá ao setDoc.
 */
export function prepareFirestoreWrite<T extends Record<string, unknown>>(
  label: string,
  data: T
): T {
  console.log(`Escala antes do Firestore (${label}):`, data);

  const undefinedPaths = findUndefinedPaths(data);
  if (undefinedPaths.length > 0) {
    console.warn(
      `[Firestore] Campos undefined detectados em "${label}" (serão removidos):`,
      undefinedPaths
    );
    undefinedPaths.forEach((p) => console.warn(`  → ${p} = undefined`));
  }

  const cleaned = sanitizeFirestoreData(data);
  assertNoUndefined(label, cleaned);
  return cleaned;
}
