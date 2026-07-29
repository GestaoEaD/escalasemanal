import { GoogleAuth } from "google-auth-library";

const project = "escalaead";

async function main() {
  const auth = new GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  for (const svc of [
    "identitytoolkit.googleapis.com",
    "firebase.googleapis.com",
    "firestore.googleapis.com",
  ]) {
    const r = await fetch(
      `https://serviceusage.googleapis.com/v1/projects/${project}/services/${svc}:enable`,
      { method: "POST", headers, body: "{}" }
    );
    const j = await r.json();
    console.log("ENABLE", svc, r.status, j.name || j.error?.message || "");
  }

  await new Promise((r) => setTimeout(r, 8000));

  const patchBody = {
    signIn: {
      email: { enabled: true, passwordRequired: false },
      anonymous: { enabled: false },
    },
    authorizedDomains: [
      "localhost",
      "escalaead.firebaseapp.com",
      "escalaead.web.app",
      "escalasemanal.vercel.app",
    ],
  };

  const patch = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config?updateMask=signIn,authorizedDomains`,
    { method: "PATCH", headers, body: JSON.stringify(patchBody) }
  );
  const patchJson = await patch.json();
  console.log("PATCH_CONFIG", patch.status, JSON.stringify(patchJson).slice(0, 800));

  // Enable Google IdP if possible (may need OAuth client in console)
  const googleIdp = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs?idpId=google.com`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `projects/${project}/defaultSupportedIdpConfigs/google.com`,
        enabled: true,
      }),
    }
  );
  const googleJson = await googleIdp.json();
  console.log("GOOGLE_IDP", googleIdp.status, JSON.stringify(googleJson).slice(0, 600));

  const cfgRes = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`,
    { headers }
  );
  const cfg = await cfgRes.json();
  console.log(
    "FINAL_CFG",
    cfgRes.status,
    JSON.stringify(
      {
        authorizedDomains: cfg.authorizedDomains,
        signIn: cfg.signIn,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
