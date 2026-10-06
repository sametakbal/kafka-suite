package org.akbal.sidecar;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.Header;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

/** Consumer records in the shape the UI shows them. */
public final class Records {

    /** Larger values are cut here; the UI says so and the size is still the real one. */
    static final int MAX_VALUE_BYTES = 1024 * 1024;

    private Records() {
    }

    public record HeaderOut(String key, String value) {
    }

    /**
     * @param key        UTF-8 text, or null for a null key
     * @param keyBase64  set only when the key is not valid UTF-8
     * @param value      UTF-8 text, or null for a tombstone or a binary value
     * @param valueBase64 set only when the value is binary (not valid UTF-8)
     */
    public record Message(int partition, long offset, long timestamp, String timestampType,
                          String key, String keyBase64, String value, String valueBase64,
                          int size, boolean truncated, boolean tombstone, List<HeaderOut> headers) {
    }

    public static Message of(ConsumerRecord<byte[], byte[]> r) {
        byte[] k = r.key();
        String key = null;
        String keyB64 = null;
        if (k != null) {
            key = strict(k);
            if (key == null) {
                keyB64 = Base64.getEncoder().encodeToString(k);
            }
        }

        byte[] v = r.value();
        String value = null;
        String valueB64 = null;
        boolean truncated = false;
        if (v != null) {
            byte[] shown = v;
            if (v.length > MAX_VALUE_BYTES) {
                shown = Arrays.copyOf(v, MAX_VALUE_BYTES);
                truncated = true;
            }
            value = strict(shown);
            if (value == null && truncated && looksTextual(shown)) {
                value = lenient(shown);
            }
            if (value == null) {
                valueB64 = Base64.getEncoder().encodeToString(shown);
            }
        }

        List<HeaderOut> headers = new ArrayList<>();
        for (Header h : r.headers()) {
            headers.add(new HeaderOut(h.key(), h.value() == null ? null : lenient(h.value())));
        }
        return new Message(r.partition(), r.offset(), r.timestamp(), r.timestampType().name, key, keyB64, value, valueB64,
                v == null ? 0 : v.length, truncated, v == null, headers);
    }

    /** UTF-8 text, or null when the bytes are not valid UTF-8 (then the value is shown as hex). */
    static String strict(byte[] b) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(b)).toString();
        } catch (CharacterCodingException e) {
            return null;
        }
    }

    static String lenient(byte[] b) {
        return new String(b, StandardCharsets.UTF_8);
    }

    /** A cut can split a multi-byte character; text is still text when only the tail is broken. */
    private static boolean looksTextual(byte[] b) {
        return strict(Arrays.copyOf(b, Math.max(0, b.length - 4))) != null;
    }
}
