package org.akbal.sidecar;

import org.apache.kafka.common.KafkaException;
import org.apache.kafka.common.errors.ApiException;

import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;

/** Converts anything thrown by an operation into the error shape the UI understands. */
public final class Errors {

    private Errors() {
    }

    /**
     * @param code    Kafka protocol error code for broker-side errors, 0 otherwise
     * @param name    exception class name, e.g. TopicExistsException, or a sidecar name such as NOT_CONNECTED
     * @param detail  root cause, when it differs from the message
     */
    public record KError(int code, String name, String message, String detail) {
    }

    /** Thrown by operations that report a problem of their own (bad request, not connected…). */
    public static final class OpException extends RuntimeException {
        final KError error;

        public OpException(KError error) {
            super(error.message());
            this.error = error;
        }
    }

    public static OpException invalid(String message) {
        return new OpException(new KError(0, "INVALID_REQUEST", message, null));
    }

    public static OpException named(String name, String message) {
        return new OpException(new KError(0, name, message, null));
    }

    public static KError toError(Throwable t) {
        t = unwrap(t);
        if (t instanceof OpException op) {
            return op.error;
        }
        // "Failed to construct kafka consumer" says little; the cause (bad config, missing keystore…) is the story.
        if (t instanceof KafkaException && t.getCause() != null && String.valueOf(t.getMessage()).startsWith("Failed to construct")) {
            Throwable c = t.getCause();
            return new KError(0, c.getClass().getSimpleName(), t.getMessage() + ": " + c.getMessage(), rootCause(c));
        }
        int code = 0;
        if (t instanceof ApiException api) {
            code = org.apache.kafka.common.protocol.Errors.forException(api).code();
        }
        return new KError(code, t.getClass().getSimpleName(), String.valueOf(t.getMessage()), rootCause(t));
    }

    /** Futures wrap the real error; take it out so the UI sees TopicExistsException, not ExecutionException. */
    static Throwable unwrap(Throwable t) {
        while ((t instanceof ExecutionException || t instanceof CompletionException) && t.getCause() != null) {
            t = t.getCause();
        }
        return t;
    }

    static String rootCause(Throwable t) {
        Throwable c = t.getCause();
        if (c == null) {
            return null;
        }
        while (c.getCause() != null && c.getCause() != c) {
            c = c.getCause();
        }
        return c.getClass().getName() + ": " + c.getMessage();
    }
}
