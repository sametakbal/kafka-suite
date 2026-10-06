package org.akbal.sidecar;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.DescribeClusterResult;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.ListTopicsOptions;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.Node;
import org.apache.kafka.common.PartitionInfo;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.header.internals.RecordHeaders;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/** The operations behind each RPC method. */
public final class KafkaOps {

    /** How long reading the latest messages may take before returning what arrived. */
    static final Duration READ_DEADLINE = Duration.ofSeconds(8);
    static final int MAX_LIMIT = 5000;

    private final ClientPool pool;
    private final LiveTail live;

    public KafkaOps(ClientPool pool, LiveTail live) {
        this.pool = pool;
        this.live = live;
    }

    public Object dispatch(String method, JsonNode p) throws Exception {
        return switch (method) {
            case "ping" -> Map.of("pong", true);
            case "test" -> test(config(p));
            case "connect" -> connect(config(p));
            case "disconnect" -> disconnect(text(p, "connId"));
            case "clusterInfo" -> describe(pool.get(text(p, "connId")).admin, System.nanoTime());
            case "listTopics" -> listTopics(text(p, "connId"));
            case "createTopic" -> createTopic(p);
            case "getMessages" -> getMessages(text(p, "connId"), text(p, "topic"), p.path("limit").asInt(50));
            case "startLiveTail" -> live.start(text(p, "connId"), text(p, "topic"));
            case "stopLiveTail" -> live.stop();
            case "produce" -> produce(p);
            default -> throw Errors.invalid("Unknown method " + method);
        };
    }

    public void shutdown() {
        live.stop();
        pool.close();
    }

    // ── cluster ─────────────────────────────────────────────

    public record Broker(int id, String host, int port, String rack) {
    }

    public record ClusterInfo(String clusterId, Integer controller, List<Broker> brokers, int topics, long elapsedMs) {
    }

    ClusterInfo test(Config c) throws Exception {
        long t0 = System.nanoTime();
        try (Admin admin = Admin.create(ClientPool.adminProps(c, "kafka-suite-test"))) {
            return describe(admin, t0);
        }
    }

    ClusterInfo connect(Config c) throws Exception {
        long t0 = System.nanoTime();
        live.stopFor(c.id());
        ClientPool.Entry e = pool.open(c);
        try {
            return describe(e.admin, t0);
        } catch (Exception ex) {
            pool.close(c.id());
            throw ex;
        }
    }

    Map<String, Object> disconnect(String connId) {
        live.stopFor(connId);
        pool.close(connId);
        return Map.of("ok", true);
    }

    static ClusterInfo describe(Admin admin, long t0) throws Exception {
        DescribeClusterResult r = admin.describeCluster();
        String clusterId = r.clusterId().get(15, TimeUnit.SECONDS);
        Node controller = r.controller().get(15, TimeUnit.SECONDS);
        List<Broker> brokers = new ArrayList<>();
        for (Node n : r.nodes().get(15, TimeUnit.SECONDS)) {
            brokers.add(new Broker(n.id(), n.host(), n.port(), n.rack()));
        }
        brokers.sort(Comparator.comparingInt(Broker::id));
        int topics = admin.listTopics().names().get(15, TimeUnit.SECONDS).size();
        return new ClusterInfo(clusterId, controller == null || controller.isEmpty() ? null : controller.id(), brokers, topics,
                (System.nanoTime() - t0) / 1_000_000);
    }

    // ── topics ──────────────────────────────────────────────

    /** @param messages records currently retained (latest − earliest offset), null when offsets could not be read */
    public record TopicInfo(String name, int partitions, int replicationFactor, boolean internal, Long messages) {
    }

    List<TopicInfo> listTopics(String connId) throws Exception {
        Admin admin = pool.get(connId).admin;
        var names = admin.listTopics(new ListTopicsOptions().listInternal(true)).names().get(30, TimeUnit.SECONDS);
        Map<String, TopicDescription> desc = admin.describeTopics(names).allTopicNames().get(30, TimeUnit.SECONDS);

        Map<TopicPartition, OffsetSpec> earliest = new HashMap<>();
        Map<TopicPartition, OffsetSpec> latest = new HashMap<>();
        for (TopicDescription d : desc.values()) {
            d.partitions().forEach(pi -> {
                TopicPartition tp = new TopicPartition(d.name(), pi.partition());
                earliest.put(tp, OffsetSpec.earliest());
                latest.put(tp, OffsetSpec.latest());
            });
        }
        Map<String, Long> counts = new HashMap<>();
        try {
            var begin = admin.listOffsets(earliest).all().get(30, TimeUnit.SECONDS);
            var end = admin.listOffsets(latest).all().get(30, TimeUnit.SECONDS);
            for (Map.Entry<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> e : end.entrySet()) {
                var b = begin.get(e.getKey());
                long n = Math.max(0, e.getValue().offset() - (b == null ? 0 : b.offset()));
                counts.merge(e.getKey().topic(), n, Long::sum);
            }
        } catch (Exception e) {
            // Offsets need Describe on every topic; without it the list still shows, without counts.
            System.err.println("listTopics: message counts unavailable: " + Errors.unwrap(e));
        }

        List<TopicInfo> out = new ArrayList<>();
        for (TopicDescription d : desc.values()) {
            int rf = d.partitions().isEmpty() ? 0 : d.partitions().get(0).replicas().size();
            out.add(new TopicInfo(d.name(), d.partitions().size(), rf, d.isInternal(), counts.get(d.name())));
        }
        out.sort(Comparator.comparing(TopicInfo::name));
        return out;
    }

    Map<String, Object> createTopic(JsonNode p) throws Exception {
        String name = text(p, "name").trim();
        int partitions = p.path("partitions").asInt(1);
        int rf = p.path("replicationFactor").asInt(1);
        if (partitions < 1 || rf < 1 || rf > Short.MAX_VALUE) {
            throw Errors.invalid("Partitions and replication factor must be at least 1");
        }
        Map<String, String> configs = new LinkedHashMap<>();
        p.path("configs").properties().forEach(e -> {
            String key = e.getKey().trim();
            if (!key.isEmpty()) {
                configs.put(key, e.getValue().asText());
            }
        });
        NewTopic topic = new NewTopic(name, Optional.of(partitions), Optional.of((short) rf)).configs(configs);
        pool.get(text(p, "connId")).admin.createTopics(List.of(topic)).all().get(30, TimeUnit.SECONDS);
        return Map.of("ok", true);
    }

    // ── consume ─────────────────────────────────────────────

    public record MessagesResult(String topic, int partitions, List<Records.Message> messages, boolean complete, long elapsedMs) {
    }

    /**
     * The latest {@code limit} records of the topic: up to {@code limit} from the end of each partition,
     * merged by timestamp, newest {@code limit} kept. Partitions are assigned directly (no consumer group),
     * so nothing is committed or left behind on the broker.
     */
    MessagesResult getMessages(String connId, String topic, int limit) {
        long t0 = System.nanoTime();
        int max = Math.max(1, Math.min(MAX_LIMIT, limit));
        try (KafkaConsumer<byte[], byte[]> consumer = pool.consumer(connId, "reader-" + connId)) {
            List<TopicPartition> tps = partitions(consumer, topic);
            Map<TopicPartition, Long> begin = consumer.beginningOffsets(tps, Duration.ofSeconds(15));
            Map<TopicPartition, Long> end = consumer.endOffsets(tps, Duration.ofSeconds(15));

            Map<TopicPartition, Long> pending = new HashMap<>();
            for (TopicPartition tp : tps) {
                long e = end.getOrDefault(tp, 0L);
                long start = Math.max(begin.getOrDefault(tp, 0L), e - max);
                if (start < e) {
                    pending.put(tp, e);
                }
            }
            List<Records.Message> out = new ArrayList<>();
            if (!pending.isEmpty()) {
                consumer.assign(pending.keySet());
                for (TopicPartition tp : pending.keySet()) {
                    consumer.seek(tp, Math.max(begin.getOrDefault(tp, 0L), pending.get(tp) - max));
                }
                long deadline = System.nanoTime() + READ_DEADLINE.toNanos();
                while (!pending.isEmpty() && System.nanoTime() < deadline) {
                    for (ConsumerRecord<byte[], byte[]> r : consumer.poll(Duration.ofMillis(250))) {
                        if (r.offset() < end.get(new TopicPartition(r.topic(), r.partition()))) {
                            out.add(Records.of(r));
                        }
                    }
                    // Compaction and transaction markers leave gaps, so go by position rather than by count.
                    pending.entrySet().removeIf(e -> consumer.position(e.getKey(), Duration.ofSeconds(2)) >= e.getValue());
                }
            }
            out.sort(Comparator.comparingLong(Records.Message::timestamp).thenComparingInt(Records.Message::partition)
                    .thenComparingLong(Records.Message::offset));
            List<Records.Message> latest = out.size() > max ? new ArrayList<>(out.subList(out.size() - max, out.size())) : out;
            return new MessagesResult(topic, tps.size(), latest, pending.isEmpty(), (System.nanoTime() - t0) / 1_000_000);
        }
    }

    static List<TopicPartition> partitions(KafkaConsumer<byte[], byte[]> consumer, String topic) {
        List<PartitionInfo> parts = consumer.partitionsFor(topic, Duration.ofSeconds(15));
        if (parts == null || parts.isEmpty()) {
            throw Errors.named("UnknownTopicOrPartitionException", "Topic " + topic + " does not exist on this cluster");
        }
        List<TopicPartition> tps = new ArrayList<>();
        for (PartitionInfo pi : parts) {
            tps.add(new TopicPartition(topic, pi.partition()));
        }
        tps.sort(Comparator.comparingInt(TopicPartition::partition));
        return tps;
    }

    // ── produce ─────────────────────────────────────────────

    public record ProduceResult(int count, int partition, long offset, long timestamp, long elapsedMs) {
    }

    ProduceResult produce(JsonNode p) throws Exception {
        long t0 = System.nanoTime();
        String topic = text(p, "topic").trim();
        Integer partition = p.hasNonNull("partition") ? p.get("partition").asInt() : null;
        byte[] key = p.hasNonNull("key") ? p.get("key").asText().getBytes(StandardCharsets.UTF_8) : null;
        byte[] value;
        if (p.hasNonNull("valueBase64")) {
            value = Base64.getDecoder().decode(p.get("valueBase64").asText());
        } else if (p.hasNonNull("value")) {
            value = p.get("value").asText().getBytes(StandardCharsets.UTF_8);
        } else {
            value = null;
        }
        RecordHeaders headers = new RecordHeaders();
        for (JsonNode h : p.path("headers")) {
            String k = h.path("key").asText("").trim();
            if (!k.isEmpty()) {
                headers.add(k, h.hasNonNull("value") ? h.get("value").asText().getBytes(StandardCharsets.UTF_8) : null);
            }
        }
        int count = Math.max(1, Math.min(10_000, p.path("count").asInt(1)));

        KafkaProducer<byte[], byte[]> producer = pool.get(text(p, "connId")).producer();
        RecordMetadata last = null;
        for (int i = 0; i < count; i++) {
            var record = new ProducerRecord<>(topic, partition, key, value, headers);
            last = producer.send(record).get(30, TimeUnit.SECONDS);
        }
        return new ProduceResult(count, last.partition(), last.offset(), last.timestamp(), (System.nanoTime() - t0) / 1_000_000);
    }

    // ── params ──────────────────────────────────────────────

    private static Config config(JsonNode p) throws Exception {
        JsonNode conn = p.path("conn");
        if (conn.isMissingNode() || conn.isNull()) {
            throw Errors.invalid("Missing connection settings");
        }
        return Main.JSON.treeToValue(conn, Config.class);
    }

    private static String text(JsonNode p, String field) {
        JsonNode n = p.get(field);
        if (n == null || n.isNull() || n.asText().isEmpty()) {
            throw Errors.invalid("Missing " + field);
        }
        return n.asText();
    }
}
