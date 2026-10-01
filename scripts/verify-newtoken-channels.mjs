import http from "node:http";

function api(path) {
  return new Promise((resolve, reject) => {
    const req = http.request("http://127.0.0.1:8080" + path, {
      headers: {
        Cookie: "open_ai_canvas_session=test_admin_session.testtoken123456789012345678901234",
      },
    }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(b));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function verify() {
  const cRes = await api("/api/admin/channels?page=1&pageSize=100");
  const channels = (cRes.data?.channels || []).filter((c) => c.name.includes("NewToken"));
  console.log("======================================================");
  console.log(`Found NewToken Channels: ${channels.length}`);
  console.log("======================================================");

  let totalModels = 0;
  for (const c of channels) {
    console.log(`\n[Channel] ${c.id}: ${c.name}`);
    console.log(`  BaseUrl: ${c.baseUrl}`);
    console.log(`  Key: ${c.apiKey ? c.apiKey.slice(0, 8) + "..." + c.apiKey.slice(-4) : "NONE"}`);
    const mRes = await api(`/api/admin/channels/${c.id}/models`);
    const models = mRes.data?.models || [];
    console.log(`  Models Count: ${models.length}`);
    totalModels += models.length;

    for (const m of models) {
      const priceUnit = m.billingMode === "token" ? "/M tokens" : m.billingMode === "per_second" ? "/s" : "/req";
      console.log(`  - [${m.modelKey}]`);
      console.log(`      providerModel: ${m.providerModelKey}`);
      console.log(`      protocol:      ${m.protocol}`);
      console.log(`      billing:       ${m.billingMode}`);
      console.log(`      price:         ¥${(m.unitPriceMicrocredits / 1000000).toFixed(4)}${priceUnit}`);
      console.log(`      capability:    ${m.capability}`);
    }
  }

  console.log("\n======================================================");
  console.log(`Total NewToken Models: ${totalModels}`);
  console.log("======================================================");
}

verify().catch(console.error);
