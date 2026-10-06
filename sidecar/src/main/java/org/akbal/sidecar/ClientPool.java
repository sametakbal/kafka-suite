package org.akbal.sidecar;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.ByteArraySerializer;

import java.time.Duration;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;

/**
 * One admin client per connected cluster, plus a producer created on the first send and kept.
 * Consumers are short-lived and never join a group, so browsing leaves nothing behind on the broker.
 */
public final class ClientPool implements AutoCloseable {

    static final class Entry {
        final Config config;
        final Admin admin;
        private KafkaProducer<byte[], byte[]> producer;

        Entry(Config config, Admin admin) {
            this.config = config;
            this.admin = admin;
        }

        synchronized KafkaProducer<byte[], byte[]> producer() {
            if (producer == null) {
                producer = new KafkaProducer<>(producerProps(config), new ByteArraySerializer(), new ByteArraySerializer());
            }
            return producer;
        }

        void close() {
            synchronized (this) {
                if (producer != null) {
                    producer.close(Duration.ofSeconds(2));
                    producer = null;
                }
            }
            admin.close(Duration.ofSeconds(2));
        }
    }

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();

    /** Opens (or reopens with new settings) the admin client for a connection. */
    public Entry open(Config c) {
        if (c.id() == null || c.id().isBlank()) {
            throw Errors.invalid("Connection has no id");
        }
        Entry fresh = new Entry(c, Admin.create(adminProps(c, "kafka-suite-" + c.id())));
        Entry old = entries.put(c.id(), fresh);
        if (old != null) {
            old.close();
        }
        return fresh;
    }

    public Entry get(String connId) {
        Entry e = connId == null ? null : entries.get(connId);
        if (e == null) {
            throw Errors.named("NOT_CONNECTED", "This cluster is not connected");
        }
        return e;
    }

    public void close(String connId) {
        Entry e = entries.remove(connId);
        if (e != null) {
            e.close();
        }
    }

    public KafkaConsumer<byte[], byte[]> consumer(String connId, String purpose) {
        Properties p = get(connId).config.common("kafka-suite-" + purpose);
        p.put("enable.auto.commit", "false");
        p.put("auto.offset.reset", "latest");
        // Looking at a topic must never create it, whatever the broker's auto.create setting.
        p.put("allow.auto.create.topics", "false");
        p.put("request.timeout.ms", "15000");
        p.put("default.api.timeout.ms", "15000");
        return new KafkaConsumer<>(p, new ByteArrayDeserializer(), new ByteArrayDeserializer());
    }

    static Properties adminProps(Config c, String clientId) {
        Properties p = c.common(clientId);
        p.put("request.timeout.ms", "10000");
        p.put("default.api.timeout.ms", "15000");
        return p;
    }

    static Properties producerProps(Config c) {
        Properties p = c.common("kafka-suite-producer-" + c.id());
        p.put("acks", "all");
        p.put("linger.ms", "0");
        // Idempotence needs the IdempotentWrite ACL on older clusters; a test message does not need it.
        p.put("enable.idempotence", "false");
        p.put("max.block.ms", "15000");
        p.put("request.timeout.ms", "15000");
        p.put("delivery.timeout.ms", "30000");
        return p;
    }

    @Override
    public void close() {
        for (String id : entries.keySet()) {
            close(id);
        }
    }
}
