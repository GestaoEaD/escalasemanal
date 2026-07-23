/**
 * Remove permissões seed sem e-mail Google.
 * Run: npx tsx scripts/revoke-seed-gestores.ts
 */
import { db, doc, getDoc, deleteDoc } from "../src/firebase";

const RES = ["104585-7", "970568-6", "127739-1", "102931-2", "966676-1"] as const;

async function main() {
  for (const re of RES) {
    const ref = doc(db, "usuarios", re);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.log(`OK (já ausente): usuarios/${re}`);
      continue;
    }
    const data = snap.data() as { nome?: string; email?: string; perfil?: string };
    await deleteDoc(ref);
    console.log(
      `Removido: usuarios/${re} (${data.nome || "?"} · ${data.perfil || "?"} · email=${data.email || "vazio"})`
    );
  }
  console.log("Concluído.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
