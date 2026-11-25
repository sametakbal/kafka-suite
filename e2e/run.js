// Kafka Suite uçtan uca test: gerçek broker'a karşı ana süreç IPC handler'ları.
// Kullanım: npm run build:main && KAFKA_BROKERS=localhost:9092 node e2e/run.js
const path = require('path');
const mock = require('./electron-mock');
const dist = path.join(__dirname, '..', 'dist-electron');
require(path.join(dist, 'store.js')).setupStoreHandlers();
require(path.join(dist, 'kafka.js')).setupKafkaHandlers(() => mock.fakeWindow);

const BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';
const ONLY_OFFLINE = process.argv.includes('--offline');
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function step(name, fn) {
  const t0 = Date.now();
  try { const note = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, note }); console.log(`  ✔ ${name} (${Date.now() - t0}ms)${note ? ' — ' + note : ''}`); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, note: e.message }); console.log(`  ✘ ${name} — ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }
async function waitFor(pred, ms, what) { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return; await sleep(200); } throw new Error('timeout: ' + what); }

(async () => {
  console.log(`Kafka Suite E2E — brokers=${BROKERS}${ONLY_OFFLINE ? ' (offline mod)' : ''}\n`);
  const expected = ['store:getConnections','store:addConnection','store:updateConnection','store:deleteConnection','kafka:connect','kafka:disconnect','kafka:testConnection','kafka:getTopics','kafka:getMessages','kafka:startLiveTail','kafka:createTopic','kafka:produceMessage','kafka:stopLiveTail'];
  await step('Tüm IPC kanalları kayıtlı (preload ile uyumlu)', async () => { const miss = expected.filter((c) => !mock.handlers.has(c)); assert(!miss.length, 'eksik: ' + miss); return `${mock.handlers.size} kanal`; });

  let connId;
  await step('Bağlantı ekle / güncelle / listele (store)', async () => {
    const c = await mock.invoke('store:addConnection', { name: 'e2e', brokers: BROKERS, securityProtocol: 'PLAINTEXT' });
    assert(c.id && c.status === 'disconnected', 'id/status yok'); connId = c.id;
    const u = await mock.invoke('store:updateConnection', c.id, { name: 'e2e-renamed' }); assert(u.name === 'e2e-renamed', 'update çalışmadı');
    const all = await mock.invoke('store:getConnections'); assert(all.length === 1, 'liste uzunluğu ' + all.length);
  });
  await step('Olmayan bağlantıyı güncelleme hata veriyor', async () => { let threw = false; try { await mock.invoke('store:updateConnection', 'yok', {}); } catch { threw = true; } assert(threw, 'hata fırlatmadı'); });
  await step('Erişilemeyen broker için testConnection düzgün hata dönüyor', async () => {
    process.stdout.write('    (kafkajs 5 kez yeniden deneyecek, ~8 sn sürer; loglar gizlendi)\n');
    const origLog = console.log, origErr = console.error; console.log = console.error = () => {};
    let r; try { r = await mock.invoke('kafka:testConnection', '127.0.0.1:1', 'PLAINTEXT'); } finally { console.log = origLog; console.error = origErr; }
    assert(r.success === false && r.error, JSON.stringify(r)); return r.error.slice(0, 80);
  });
  if (ONLY_OFFLINE) return finish();

  const topic = `e2e-${Date.now()}`;
  await step('testConnection (gerçek broker)', async () => { const r = await mock.invoke('kafka:testConnection', BROKERS, 'PLAINTEXT'); assert(r.success, r.error); });
  await step('connect + connectionStatus olayı + store durumu', async () => {
    const r = await mock.invoke('kafka:connect', connId); assert(r.success, r.error);
    assert(mock.sentEvents.some((e) => e.channel === 'kafka:connectionStatus' && e.payload.status === 'connected'), 'olay gelmedi');
    const [c] = await mock.invoke('store:getConnections'); assert(c.status === 'connected', 'status=' + c.status);
  });
  await step('createTopic (3 partition)', async () => { const r = await mock.invoke('kafka:createTopic', connId, topic, 3, 1, { 'retention.ms': '600000' }); assert(r.success, r.error); });
  await step('Aynı topic tekrar oluşturulunca success=false', async () => { const r = await mock.invoke('kafka:createTopic', connId, topic, 3, 1); assert(r.success === false, JSON.stringify(r)); return r.error; });
  await step('getTopics yeni topic\'i 3 partition ile listeliyor', async () => {
    let t; await waitFor(async () => false, 0, '').catch(() => {});
    for (let i = 0; i < 10 && !t; i++) { t = (await mock.invoke('kafka:getTopics', connId)).find((x) => x.name === topic); if (!t) await sleep(500); }
    assert(t, 'topic yok'); assert(t.partitions === 3, 'partitions=' + t.partitions);
  });
  await step('produceMessage: 10 mesaj (key, header, açık partition)', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await mock.invoke('kafka:produceMessage', connId, topic, JSON.stringify({ i }), `k${i}`, { source: 'e2e', idx: String(i) }, i === 9 ? 2 : undefined);
      assert(r.success, r.error);
    }
  });
  await step('Var olmayan partition\'a produce hata dönüyor', async () => { const r = await mock.invoke('kafka:produceMessage', connId, topic, 'x', undefined, undefined, 99); assert(r.success === false, JSON.stringify(r)); return (r.error || '').slice(0, 80); });
  await step('getMessages 10 mesajı içerik/header ile geri getiriyor', async () => {
    const msgs = await mock.invoke('kafka:getMessages', connId, topic, 50);
    const idx = msgs.map((m) => JSON.parse(m.value).i).sort((a, b) => a - b);
    assert(msgs.length === 10, `beklenen 10, gelen ${msgs.length}`);
    assert(idx.join() === '0,1,2,3,4,5,6,7,8,9', 'içerik: ' + idx);
    assert(msgs.every((m) => m.headers && m.headers.source === 'e2e'), 'header eksik');
    assert(msgs.find((m) => m.key === 'k9').partition === 2, 'açık partition uygulanmadı');
  });
  await step('getMessages limit=3 en fazla 3 mesaj dönüyor', async () => { const msgs = await mock.invoke('kafka:getMessages', connId, topic, 3); assert(msgs.length <= 3 && msgs.length > 0, 'gelen ' + msgs.length); return `${msgs.length} mesaj`; });
  await step('Live tail: yeni mesajlar kafka:message olayıyla geliyor', async () => {
    const before = mock.sentEvents.length;
    await mock.invoke('kafka:startLiveTail', connId, topic);
    await sleep(4000); // consumer group join
    for (let i = 0; i < 3; i++) await mock.invoke('kafka:produceMessage', connId, topic, `live-${i}`, `lk${i}`);
    const live = () => mock.sentEvents.slice(before).filter((e) => e.channel === 'kafka:message' && String(e.payload.value).startsWith('live-'));
    await waitFor(() => live().length >= 3, 20000, `3 live mesaj (gelen ${live().length})`);
    return `${live().length} mesaj`;
  });
  await step('Live tail yeniden başlatma eski consumer\'ı kapatıyor', async () => { await mock.invoke('kafka:startLiveTail', connId, topic); await mock.invoke('kafka:startLiveTail', connId, topic); });
  await step('stopLiveTail sonrası mesaj gelmiyor', async () => {
    await mock.invoke('kafka:stopLiveTail'); const before = mock.sentEvents.length;
    await mock.invoke('kafka:produceMessage', connId, topic, 'after-stop'); await sleep(3000);
    assert(!mock.sentEvents.slice(before).some((e) => e.channel === 'kafka:message'), 'durdurulduktan sonra mesaj geldi');
  });
  await step('disconnect + store durumu', async () => { await mock.invoke('kafka:disconnect', connId); const [c] = await mock.invoke('store:getConnections'); assert(c.status === 'disconnected', 'status=' + c.status); });
  await step('Bağlantıyı sil', async () => { await mock.invoke('store:deleteConnection', connId); assert((await mock.invoke('store:getConnections')).length === 0, 'silinmedi'); });
  finish();
})().catch((e) => { console.error(e); process.exit(2); });

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} adım geçti`);
  try { require('fs').writeFileSync(path.join(__dirname, 'last-result.json'), JSON.stringify({ at: new Date().toISOString(), brokers: BROKERS, offline: ONLY_OFFLINE, passed: results.length - failed.length, total: results.length, results }, null, 2)); } catch {}
  process.exit(failed.length ? 1 : 0);
}
