package org.akbal.sidecar;

import org.apache.kafka.common.KafkaException;
import org.apache.kafka.common.config.ConfigException;
import org.apache.kafka.common.errors.TopicExistsException;
import org.junit.jupiter.api.Test;

import java.util.concurrent.ExecutionException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ErrorsTest {

    @Test
    void futureWrappersAreRemoved() {
        Errors.KError e = Errors.toError(new ExecutionException(new TopicExistsException("Topic 'a' already exists.")));
        assertEquals("TopicExistsException", e.name());
        assertEquals(36, e.code());
        assertEquals("Topic 'a' already exists.", e.message());
    }

    @Test
    void constructionFailuresReportTheCause() {
        Errors.KError e = Errors.toError(new KafkaException("Failed to construct kafka consumer", new ConfigException("bad truststore")));
        assertEquals("ConfigException", e.name());
        assertTrue(e.message().contains("bad truststore"), e.message());
    }

    @Test
    void opExceptionsKeepTheirOwnError() {
        Errors.KError e = Errors.toError(Errors.named("NOT_CONNECTED", "not connected"));
        assertEquals("NOT_CONNECTED", e.name());
        assertNull(e.detail());
    }

    @Test
    void rootCauseIsTheInnermost() {
        Throwable t = new RuntimeException("outer", new IllegalStateException("mid", new java.io.IOException("disk")));
        assertEquals("java.io.IOException: disk", Errors.rootCause(t));
    }
}
