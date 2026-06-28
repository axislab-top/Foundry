const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:3002";
const EMAIL = process.env.TEST_EMAIL ?? "ok.xinx@gmail.com";
const PASSWORD = process.env.TEST_PASSWORD ?? "right123";

function unwrap(raw) {
  if (raw && typeof raw === "object" && "data" in raw && raw.data && typeof raw.data === "object") {
    return unwrap(raw.data);
  }
  return raw;
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`POST ${url} -> ${res.status}: ${text}`);
  }
  return unwrap(json);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status}: ${text}`);
  }
  return unwrap(json);
}

async function deleteCompany(companyId, token) {
  const res = await fetch(`${GATEWAY}/api/v1/companies/${encodeURIComponent(companyId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-company-id": companyId,
    },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: unwrap(json), raw: text };
}

async function main() {
  console.log("1) login...");
  const login = await postJson(`${GATEWAY}/api/auth/login`, { email: EMAIL, password: PASSWORD });
  const token = login?.accessToken;
  if (!token) throw new Error("login missing accessToken");
  console.log("   OK login");

  console.log("2) list companies...");
  const list = await getJson(`${GATEWAY}/api/v1/companies?page=1&pageSize=50`, {
    Authorization: `Bearer ${token}`,
  });
  const items = list?.items ?? [];
  console.log(`   found ${items.length} companies`);
  for (const item of items) {
    console.log(`   - ${item.id} | ${item.name ?? item.displayName ?? "(no name)"} | ${item.status ?? "?"}`);
  }

  if (items.length === 0) {
    console.log("3) create disposable test company...");
    const created = await postJson(
      `${GATEWAY}/api/v1/companies`,
      { name: `删除测试-${Date.now()}` },
      { Authorization: `Bearer ${token}` },
    );
    items.push(created);
    console.log(`   created ${created.id} (${created.name})`);
  }

  const target = items[items.length - 1];
  console.log(`3) delete company ${target.id} (${target.name ?? target.displayName})...`);
  const deleted = await deleteCompany(target.id, token);
  console.log(`   status=${deleted.status}`, deleted.body ?? deleted.raw);

  if (deleted.status !== 200) {
    process.exitCode = 1;
    return;
  }

  console.log("4) verify company removed from list...");
  const listAfter = await getJson(`${GATEWAY}/api/v1/companies?page=1&pageSize=50`, {
    Authorization: `Bearer ${token}`,
  });
  const stillThere = (listAfter?.items ?? []).some((item) => item.id === target.id);
  if (stillThere) {
    console.error("   FAIL: company still in list");
    process.exitCode = 1;
    return;
  }
  console.log("   OK company removed");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
