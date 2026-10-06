package org.akbal.sidecar;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.WakeupException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BiConsumer;

/**
 * Streams new records of one topic to the UI. Only one tail runs at a time: starting another stops
 * the previous one. Each poll's records go out as one "kafka:live" event tagged with the tail id,
 * so the UI can drop stragglers from a tail it already stopped.
 */
public final class LiveTail {

    public record Batch(long tailId, String connId, String topic, List<Records.Message> messages) {
    }

    public record Failure(long tailId, String connId, String topic, Errors.KError error) {
    }

    private record Running(long id, String connId, KafkaConsumer<byte[], byte[]> consumer, AtomicBoolean stop, Thread thread) {
    }

    private final ClientPool pool;
    private final BiConsumer<String, Object> emit;
    private final AtomicLong ids = new AtomicLong();
    private Running current;

    public LiveTail(ClientPool pool, BiConsumer<String, Object> emit) {
        this.pool = pool;
        this.emit = emit;
    }

    public synchronized Map<String, Object> start(String connId, String topic) {
        stop();
        KafkaConsumer<byte[], byte[]> consumer = pool.consumer(connId, "live-" + connId);
        try {
            List<TopicPartition> tps = KafkaOps.partitions(consumer, topic);
            consumer.assign(tps);
            consumer.seekToEnd(tps);
            // Resolve the end offsets now, so records produced right after "start" are not skipped.
            for (TopicPartition tp : tps) {
                consumer.position(tp, Duration.ofSeconds(10));
            }
        } catch (RuntimeException e) {
            consumer.close(Duration.ofSeconds(1));
            throw e;
        }

        long id = ids.incrementAndGet();
        AtomicBoolean stop = new AtomicBoolean();
        Thread thread = Thread.ofPlatform().daemon().name("live-tail-" + id).unstarted(() -> run(id, connId, topic, consumer, stop));
        current = new Running(id, connId, consumer, stop, thread);
        thread.start();
        return Map.of("tailId", id);
    }

    private void run(long id, String connId, String topic, KafkaConsumer<byte[], byte[]> consumer, AtomicBoolean stop) {
        try {
            while (!stop.get()) {
                ConsumerRecords<byte[], byte[]> records = consumer.poll(Duration.ofMillis(500));
                if (records.isEmpty()) {
                    continue;
                }
                List<Records.Message> batch = new ArrayList<>(records.count());
                for (ConsumerRecord<byte[], byte[]> r : records) {
                    batch.add(Records.of(r));
                }
                emit.accept("kafka:live", new Batch(id, connId, topic, batch));
            }
        } catch (WakeupException e) {
            // stop() woke the poll up
        } catch (Throwable t) {
            emit.accept("kafka:liveError", new Failure(id, connId, topic, Errors.toError(t)));
        } finally {
            consumer.close(Duration.ofSeconds(1));
        }
    }

    public synchronized Map<String, Object> stop() {
        Running r = current;
        current = null;
        if (r != null) {
            r.stop().set(true);
            r.consumer().wakeup();
            try {
                r.thread().join(3000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        return Map.of("stopped", r != null);
    }

    /** A tail on a cluster that is being disconnected goes with it. */
    public synchronized void stopFor(String connId) {
        if (current != null && current.connId().equals(connId)) {
            stop();
        }
    }
}
