/**
 * Falha se um arquivo versionado contiver formatos comuns de credenciais.
 * Use também a proteção de push/secret scanning do provedor Git.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const patterns = [
  {
    name: "Google API key",
    regex: /AIza[0-9A-Za-z_-]{30,}/g,
    // Chave Web do Firebase é pública por design; permitir só no arquivo dedicado.
    allowFiles: new Set(["src/firebasePublicConfig.ts"]),
  },
  { name: "Google private key", regex: /-----BEGIN PRIVATE KEY-----/g },
  { name: "GitHub token", regex: /\b(?:ghp|github_pat)_[0-9A-Za-z_]{20,}/g },
  { name: "Service account private key", regex: /"private_key"\s*:\s*"[^"]+"/g },
];

const findings = [];
for (const file of tracked) {
  if (file === "scripts/check-secrets.mjs") continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.allowFiles?.has(file)) {
      pattern.regex.lastIndex = 0;
      continue;
    }
    if (pattern.regex.test(content)) {
      findings.push(`${file}: ${pattern.name}`);
    }
    pattern.regex.lastIndex = 0;
  }
}

if (findings.length) {
  console.error("Possíveis segredos em arquivos versionados:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret scan local OK (${tracked.length} arquivos versionados).`);
