package org.akbal.sidecar;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.apache.kafka.common.record.TimestampType;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecordsTest {

    private static ConsumerRecord<byte[], byte[]> record(byte[] key, byte[] value) {
        RecordHeaders h = new RecordHeaders();
        h.add("trace", "abc".getBytes(StandardCharsets.UTF_8));
        h.add("empty", null);
        return new ConsumerRecord<>("t", 2, 41L, 1_700_000_000_000L, TimestampType.CREATE_TIME,
                key == null ? -1 : key.length, value == null ? -1 : value.length, key, value, h, Optional.empty());
    }

    @Test
    void textRecord() {
        Records.Message m = Records.of(record("k".getBytes(StandardCharsets.UTF_8), "{\"a\":\"ü\"}".getBytes(StandardCharsets.UTF_8)));
        assertEquals(2, m.partition());
        assertEquals(41L, m.offset());
        assertEquals("CreateTime", m.timestampType());
        assertEquals("k", m.key());
        assertEquals("{\"a\":\"ü\"}", m.value());
        assertNull(m.valueBase64());
        assertEquals(10, m.size());
        assertEquals(2, m.headers().size());
        assertEquals("abc", m.headers().get(0).value());
        assertNull(m.headers().get(1).value());
    }

    @Test
    void binaryValueGoesAsBase64() {
        Records.Message m = Records.of(record(null, new byte[]{(byte) 0xff, 0x00, (byte) 0xfe}));
        assertNull(m.key());
        assertNull(m.value());
        assertEquals("/wD+", m.valueBase64());
        assertFalse(m.tombstone());
    }

    @Test
    void nullValueIsATombstone() {
        Records.Message m = Records.of(record("k".getBytes(StandardCharsets.UTF_8), null));
        assertTrue(m.tombstone());
        assertEquals(0, m.size());
    }

    @Test
    void largeTextIsCutButStaysText() {
        byte[] big = new byte[Records.MAX_VALUE_BYTES + 10];
        Arrays.fill(big, (byte) 'x');
        // A two-byte character straddling the cut must not turn the value into hex.
        big[Records.MAX_VALUE_BYTES - 1] = (byte) 0xc3;
        big[Records.MAX_VALUE_BYTES] = (byte) 0xbc;
        Records.Message m = Records.of(record(null, big));
        assertTrue(m.truncated());
        assertNotNull(m.value());
        assertEquals(big.length, m.size());
    }
}
