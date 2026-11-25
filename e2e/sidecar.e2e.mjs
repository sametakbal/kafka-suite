// Kafka Suite 2.x uçtan uca test: Java sidecar'ı Tauri'nin başlattığı gibi başlatır ve
// UI'ın kullandığı JSON-RPC çağrılarını (src/lib/rpc.ts) gerçek bir Kafka'ya karşı çalıştırır.
//
//   npm run kafka:up                 # localhost:9092'de Kafka
//   npm run sidecar -- --skip-runtime   # jar'ı derle (runtime yoksa sistem Java 21 kullanılır)
//   npm run test:e2e                 # KAFKA_BROKERS=host:port ile başka broker
//
// Sonuçlar e2e/last-result.json dosyasına da yazılır.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BROKERS = process.env.KAFKA_BROKERS || "localhost:9092";
const win = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── sidecar process ─────────────────────────────────────────
function findJar() {
  for (const p of [join(root, "src-tauri", "resources", "kafka-sidecar.jar"), join(root, "sidecar", "target", "kafka-sidecar.jar")]) {
    if (existsSync(p)) return p;
  }
  throw new Error("kafka-sidecar.jar bulunamadı. Önce: npm run sidecar -- --skip-runtime");
}
function findJava() {
  const bundled = join(root, "src-tauri", "resources", "runtime", "bin", win ? "java.exe" : "java");
  if (existsSync(bundled)) return bundled;
  if (process.env.JAVA_HOME) {
    const j = join(process.env.JAVA_HOME, "bin", win ? "java.exe" : "java");
    if (existsSync(j)) return j;
  }
  return "java";
}

class Sidecar {
  constructor(java, jar) {
    const env = { ...process.env };
    for (const k of ["JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS"]) delete env[k]; // Tauri da kaldırıyor
    this.proc = spawn(java, ["-Xss1m", "-XX:+UseSerialGC", "-Dfile.encoding=UTF-8", "-jar", jar], { env, stdio: ["pipe", "pipe", "pipe"] });
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.nonJson = [];
    this.stderr = "";
    this.proc.stderr.on("data", (d) => { this.stderr += d; });
    this.exited = new Promise((r) => this.proc.on("exit", (code, sig) => r({ code, sig })));
    this.ready = new Promise((resolveReady, rejectReady) => {
      this.proc.on("error", rejectReady);
      createInterface({ input: this.proc.stdout }).on("line", (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch { this.nonJson.push(line); return; }
        if (msg.ready) return resolveReady();
        if (msg.event) { this.events.push({ ...msg, at: Date.now() }); return; }
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); p(msg); }
      });
    });
  }
  send(raw) { this.proc.stdin.write(raw + "\n"); }
  /** Returns {result} or {error}; never throws on Kafka errors. */
  call(method, params = {}, timeoutMs = 60000) {
    const id = this.nextId++;
    const t0 = Date.now();
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method} ${timeoutMs}ms içinde cevap vermedi`)); }, timeoutMs);
      this.pending.set(id, (msg) => { clearTimeout(timer); res({ ...msg, ms: Date.now() - t0 }); });
      this.send(JSON.stringify({ id, method, params }));
    });
  }
  async ok(method, params, timeoutMs) {
    const r = await this.call(method, params, timeoutMs);
    if (r.error) throw new Error(`${method} hata döndü: ${r.error.name}: ${r.error.message}`);
    return r;
  }
}

// ── test runner ─────────────────────────────────────────────
const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, note });
    console.log(`  ✔ ${name} (${Date.now() - t0}ms)${note ? " — " + note : ""}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, note: e.message });
    console.log(`  ✘ ${name} — ${e.message}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
async function waitFor(pred, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (pred()) return; await sleep(100); }
  throw new Error("zaman aşımı: " + what);
}
function finish(sc) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} adım geçti`);
  try {
    writeFileSync(join(root, "e2e", "last-result.json"), JSON.stringify({
      at: new Date().toISOString(), brokers: BROKERS, passed: results.length - failed.length, total: results.length, results,
      sidecarStderrTail: sc ? sc.stderr.split("\n").slice(-40).join("\n") : undefined,
    }, null, 2));
  } catch {}
  process.exit(failed.length ? 1 : 0);
}

// ── scenario ────────────────────────────────────────────────
const conn = (id, bootstrap = BROKERS) => ({
  id, bootstrap, securityProtocol: "PLAINTEXT", saslMechanism: null, username: null, password: null,
  ssl: { truststore: null, keystore: null, verifyHostname: true, truststorePassword: null, keystorePassword: null },
});
const liveFor = (sc, tailId, from = 0) =>
  sc.events.slice(from).filter((e) => e.event === "kafka:live" && e.data.tailId === tailId).flatMap((e) => e.data.messages);

const main = async () => {
  console.log(`Kafka Suite sidecar E2E — brokers=${BROKERS}\n`);
  let jar, java;
  try { jar = findJar(); java = findJava(); } catch (e) { results.push({ name: "Sidecar jar'ı bulundu", ok: false, ms: 0, note: e.message }); console.log("  ✘ " + e.message); return finish(); }
  const v = spawnSync(java, ["-version"], { encoding: "utf8" });
  console.log(`  java: ${java} (${(v.stderr || "").split("\n")[0] || "?"})\n  jar:  ${jar}\n`);

  const sc = new Sidecar(java, jar);
  const ID = "e2e-conn";
  const topic = `e2e-${Date.now()}`;
  const empty = `${topic}-empty`;

  await step("Sidecar başlıyor ve {ready:true} yazıyor", async () => {
    await Promise.race([sc.ready, sleep(30000).then(() => { throw new Error("30 sn içinde ready gelmedi. stderr: " + sc.stderr.slice(-500)); })]);
  });
  if (!results[0].ok) { sc.proc.kill(); return finish(sc); }

  await step("ping", async () => { const r = await sc.ok("ping"); assert(r.result.pong === true, JSON.stringify(r)); });
  await step("Bilinmeyen method → INVALID_REQUEST", async () => {
    const r = await sc.call("nope"); assert(r.error?.name === "INVALID_REQUEST", JSON.stringify(r)); });
  await step("Bozuk JSON satırı sidecar'ı düşürmüyor", async () => {
    sc.send("{bu json değil"); const r = await sc.ok("ping"); assert(r.result.pong, "ping cevap vermedi"); });
  await step("Erişilemeyen broker için test hata dönüyor", async () => {
    const r = await sc.call("test", { conn: conn("bad", "127.0.0.1:1") }, 90000);
    assert(r.error, "hata dönmedi: " + JSON.stringify(r.result));
    return `${r.ms}ms — ${r.error.name}: ${String(r.error.message).slice(0, 70)}`;
  });
  await step("Bağlanmadan listTopics anlamlı hata veriyor", async () => {
    const r = await sc.call("listTopics", { connId: "olmayan" }); assert(r.error, "hata dönmedi"); return `${r.error.name}: ${r.error.message}`; });

  await step("test (gerçek broker) cluster bilgisini dönüyor", async () => {
    const r = await sc.ok("test", { conn: conn("probe") });
    assert(r.result.clusterId && r.result.brokers.length >= 1, JSON.stringify(r.result));
    return `${r.result.brokers.length} broker, ${r.ms}ms`;
  });
  await step("Protokolü seçilmemiş (NONE) bağlantı: test + connect + listTopics", async () => {
    const none = { ...conn("e2e-none"), securityProtocol: "NONE" };
    const t = await sc.ok("test", { conn: none });
    assert(t.result.brokers.length >= 1, JSON.stringify(t.result));
    await sc.ok("connect", { conn: none });
    const topics = await sc.ok("listTopics", { connId: "e2e-none" });
    assert(Array.isArray(topics.result), JSON.stringify(topics.result));
    await sc.ok("disconnect", { connId: "e2e-none" });
  });
  await step("connect + clusterInfo", async () => {
    await sc.ok("connect", { conn: conn(ID) });
    const r = await sc.ok("clusterInfo", { connId: ID });
    assert(r.result.brokers.length >= 1 && typeof r.result.topics === "number", JSON.stringify(r.result));
  });

  await step("createTopic (3 partition, config ile)", async () => {
    await sc.ok("createTopic", { connId: ID, name: topic, partitions: 3, replicationFactor: 1, configs: { "retention.ms": "600000", "": "x" } });
    await sc.ok("createTopic", { connId: ID, name: empty, partitions: 2, replicationFactor: 1, configs: {} });
  });
  await step("Aynı topic tekrar → TopicExistsException", async () => {
    const r = await sc.call("createTopic", { connId: ID, name: topic, partitions: 3, replicationFactor: 1, configs: {} });
    assert(r.error?.name === "TopicExistsException", JSON.stringify(r.error || r.result)); });
  await step("Geçersiz partition sayısı → INVALID_REQUEST", async () => {
    const r = await sc.call("createTopic", { connId: ID, name: topic + "-x", partitions: 0, replicationFactor: 1, configs: {} });
    assert(r.error?.name === "INVALID_REQUEST", JSON.stringify(r.error || r.result)); });
  await step("listTopics yeni topic'i 3 partition / RF 1 / 0 mesaj gösteriyor", async () => {
    let t;
    for (let i = 0; i < 20 && !t; i++) { t = (await sc.ok("listTopics", { connId: ID })).result.find((x) => x.name === topic); if (!t) await sleep(300); }
    assert(t, "topic listede yok");
    assert(t.partitions === 3 && t.replicationFactor === 1 && t.messages === 0, JSON.stringify(t));
  });

  // 10 JSON mesaj + 1 açık partition + count=5 kopya + binary + tombstone = 18 kayıt
  await step("produce: key, header, açık partition, count, binary, tombstone", async () => {
    for (let i = 0; i < 10; i++) {
      await sc.ok("produce", { connId: ID, topic, key: `k${i}`, value: JSON.stringify({ i }), headers: [{ key: "source", value: "e2e" }, { key: "idx", value: String(i) }, { key: "", value: "boş" }], partition: null, count: 1 });
    }
    const p2 = await sc.ok("produce", { connId: ID, topic, key: "pinned", value: "to-p2", headers: [], partition: 2, count: 1 });
    assert(p2.result.partition === 2, "partition 2'ye gitmedi: " + JSON.stringify(p2.result));
    const many = await sc.ok("produce", { connId: ID, topic, key: "copy", value: "copy", headers: [], partition: 0, count: 5 });
    assert(many.result.count === 5, JSON.stringify(many.result));
    await sc.ok("produce", { connId: ID, topic, key: "bin", valueBase64: Buffer.from([0xff, 0x00, 0xfe, 0x01]).toString("base64"), headers: [], partition: 1, count: 1 });
    await sc.ok("produce", { connId: ID, topic, key: "tomb", headers: [], partition: 1, count: 1 });
    return `5 kopya ${many.ms}ms`;
  });
  await step("Var olmayan partition'a produce hata dönüyor", async () => {
    const r = await sc.call("produce", { connId: ID, topic, key: null, value: "x", headers: [], partition: 99, count: 1 }, 60000);
    assert(r.error, "başarılı döndü: " + JSON.stringify(r.result));
    assert(r.error.name === "PARTITION_NOT_FOUND", `${r.error.name}: ${r.error.message}`);
    assert(r.ms < 3000, `${r.ms}ms sürdü`);
    return `${r.ms}ms — ${r.error.message}`;
  });
  await step("listTopics mesaj sayısı 18", async () => {
    const t = (await sc.ok("listTopics", { connId: ID })).result.find((x) => x.name === topic);
    assert(t.messages === 18, "messages=" + t.messages);
  });

  await step("getMessages tüm kayıtları doğru şekilde getiriyor", async () => {
    const r = await sc.ok("getMessages", { connId: ID, topic, limit: 50 });
    const { messages, complete, partitions } = r.result;
    assert(partitions === 3 && complete === true, `partitions=${partitions} complete=${complete}`);
    assert(messages.length === 18, `beklenen 18, gelen ${messages.length}`);
    const json = messages.filter((m) => m.key?.startsWith("k")).map((m) => JSON.parse(m.value).i).sort((a, b) => a - b);
    assert(json.join() === "0,1,2,3,4,5,6,7,8,9", "JSON mesajlar: " + json);
    const k3 = messages.find((m) => m.key === "k3");
    assert(k3.headers.length === 2 && k3.headers.some((h) => h.key === "source" && h.value === "e2e"), "header: " + JSON.stringify(k3.headers));
    const bin = messages.find((m) => m.key === "bin");
    assert(bin.value === null && bin.valueBase64 === "/wD+AQ==" && bin.size === 4, "binary: " + JSON.stringify(bin));
    const tomb = messages.find((m) => m.key === "tomb");
    assert(tomb.tombstone === true && tomb.value === null, "tombstone: " + JSON.stringify(tomb));
    for (let i = 1; i < messages.length; i++) assert(messages[i - 1].timestamp <= messages[i].timestamp, "zaman sırası bozuk");
    return `${r.ms}ms`;
  });
  await step("getMessages limit=3 en yeni 3 kaydı dönüyor", async () => {
    const all = (await sc.ok("getMessages", { connId: ID, topic, limit: 50 })).result.messages;
    const r = await sc.ok("getMessages", { connId: ID, topic, limit: 3 });
    const got = r.result.messages.map((m) => `${m.partition}:${m.offset}`).join();
    const exp = all.slice(-3).map((m) => `${m.partition}:${m.offset}`).join();
    assert(got === exp, `beklenen ${exp}, gelen ${got}`);
    return `${r.ms}ms`;
  });
  await step("getMessages boş topic'te hemen boş dönüyor", async () => {
    const r = await sc.ok("getMessages", { connId: ID, topic: empty, limit: 50 });
    assert(r.result.messages.length === 0 && r.result.complete, JSON.stringify(r.result));
    assert(r.ms < 3000, `${r.ms}ms sürdü`);
    return `${r.ms}ms`;
  });
  await step("getMessages olmayan topic → UnknownTopicOrPartitionException", async () => {
    const r = await sc.call("getMessages", { connId: ID, topic: topic + "-yok", limit: 10 });
    assert(r.error?.name === "UnknownTopicOrPartitionException", JSON.stringify(r.error || r.result));
    return `${r.ms}ms`;
  });

  let tail1;
  await step("Live tail: başlatılınca yeni mesajlar kafka:live ile geliyor", async () => {
    const s = await sc.ok("startLiveTail", { connId: ID, topic });
    tail1 = s.result.tailId;
    const from = sc.events.length; // start'tan hemen sonra gönderilenler kaçmamalı (seekToEnd çözüldü)
    const t0 = Date.now();
    for (let i = 0; i < 3; i++) await sc.ok("produce", { connId: ID, topic, key: `live${i}`, value: `live-${i}`, headers: [], partition: null, count: 1 });
    await waitFor(() => liveFor(sc, tail1, from).length >= 3, 15000, `3 live mesaj (gelen ${liveFor(sc, tail1, from).length})`);
    const vals = liveFor(sc, tail1, from).map((m) => m.value).sort().join();
    assert(vals === "live-0,live-1,live-2", vals);
    return `başlatma ${s.ms}ms, ilk teslim ${Date.now() - t0}ms`;
  });
  await step("Live tail ardışık yeniden başlatma: hızlı ve çift mesaj yok", async () => {
    const t0 = Date.now();
    const a = await sc.ok("startLiveTail", { connId: ID, topic });
    const b = await sc.ok("startLiveTail", { connId: ID, topic });
    const restartMs = Date.now() - t0;
    assert(b.result.tailId > a.result.tailId && a.result.tailId > tail1, "tailId artmıyor");
    const from = sc.events.length;
    await sc.ok("produce", { connId: ID, topic, key: "ar", value: "after-restart", headers: [], partition: null, count: 1 });
    const all = () => sc.events.slice(from).filter((e) => e.event === "kafka:live").flatMap((e) => e.data.messages.map((m) => ({ ...m, tailId: e.data.tailId }))).filter((m) => m.value === "after-restart");
    await waitFor(() => all().length >= 1, 15000, "yeniden başlatma sonrası mesaj");
    await sleep(1500);
    assert(all().length === 1 && all()[0].tailId === b.result.tailId, "teslimler: " + JSON.stringify(all().map((m) => m.tailId)));
    return `2 yeniden başlatma ${restartMs}ms`;
  });
  await step("stopLiveTail sonrası olay gelmiyor", async () => {
    const r = await sc.ok("stopLiveTail");
    assert(r.result.stopped === true, JSON.stringify(r.result));
    const from = sc.events.length;
    await sc.ok("produce", { connId: ID, topic, key: "s", value: "after-stop", headers: [], partition: null, count: 1 });
    await sleep(2500);
    assert(!sc.events.slice(from).some((e) => e.event === "kafka:live"), "durdurulduktan sonra olay geldi");
    const again = await sc.ok("stopLiveTail");
    assert(again.result.stopped === false, "ikinci stop true döndü");
    return `stop ${r.ms}ms`;
  });
  await step("disconnect live tail'i de kapatıyor ve bağlantıyı bırakıyor", async () => {
    await sc.ok("startLiveTail", { connId: ID, topic });
    await sc.ok("disconnect", { connId: ID });
    const stop = await sc.ok("stopLiveTail");
    assert(stop.result.stopped === false, "disconnect live tail'i kapatmadı");
    const r = await sc.call("listTopics", { connId: ID });
    assert(r.error, "disconnect sonrası listTopics çalıştı");
  });
  await step("stdin kapanınca sidecar temiz çıkıyor", async () => {
    sc.proc.stdin.end();
    const r = await Promise.race([sc.exited, sleep(15000).then(() => null)]);
    if (!r) { sc.proc.kill("SIGKILL"); throw new Error("15 sn içinde çıkmadı"); }
    assert(r.code === 0, `çıkış kodu ${r.code} / ${r.sig}`);
  });
  await step("stdout'a JSON dışında bir şey yazılmadı", async () => {
    assert(sc.nonJson.length === 0, "JSON olmayan satırlar: " + sc.nonJson.slice(0, 3).join(" | "));
  });
  finish(sc);
};

main().catch((e) => { console.error(e); results.push({ name: "beklenmeyen hata", ok: false, ms: 0, note: String(e?.stack || e) }); finish(); });
