import assert from "node:assert/strict";

// Pass an already-analyzed UUID: this verifier must never trigger a new model call.
async function main() {
  const base = process.argv[2] ?? "http://localhost:3000";
  const id = process.argv[3];
  assert.ok(id && /^[0-9a-f-]{36}$/i.test(id), "Supply an already-analyzed article UUID");
  assert.ok(process.env.BIASLY_ADMIN_SECRET, "Admin secret must be configured");
  const headers = { "Content-Type": "application/json", "x-biasly-admin-secret": process.env.BIASLY_ADMIN_SECRET };
  // Confirm publication before submitting a selection to the action endpoint.
  const home = await fetch(base, { signal: AbortSignal.timeout(30_000) });
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes(id), "Selected article must already appear on the homepage");
  console.log("PASS: published story rendered on homepage");
  const cases: { method: string; body?: string; headers?: Record<string, string>; expected: number }[] = [
    { method: "GET", expected: 405 },
    { method: "POST", body: "{}", expected: 401 },
    { method: "POST", body: JSON.stringify({ limit: 0 }), headers, expected: 400 },
    { method: "POST", body: JSON.stringify({ articleIds: [id] }), headers, expected: 200 },
  ];
  for (const entry of cases) {
    const response = await fetch(`${base}/api/analyze`, { method: entry.method, body: entry.body, headers: entry.headers, signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, entry.expected);
    console.log(`${entry.method} /api/analyze: ${response.status}`);
    if (entry.expected === 200) {
      assert.equal((await response.json()).attempted, 0);
      console.log("PASS: authenticated repeat request skipped stored analysis");
    }
  }
}
main().catch(() => { console.error("FAIL: HTTP verification; check server availability, authorization and the published article selection."); process.exitCode = 1; });
