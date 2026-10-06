package org.akbal.sidecar;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Line-delimited JSON-RPC over stdin/stdout.
 * <pre>
 * request:  {"id": 1, "method": "getMessages", "params": {...}}
 * response: {"id": 1, "result": ...} | {"id": 1, "error": {...}}
 * event:    {"event": "kafka:live", "data": {...}}   (no id; pushed by the live tail)
 * </pre>
 * stdout is reserved for these lines; anything else the Kafka client prints goes to stderr.
 */
public final class Main {

    static final ObjectMapper JSON = new ObjectMapper();

    private static PrintStream out;

    private Main() {
    }

    public static void main(String[] args) throws Exception {
        // Before the first logger is created: the Kafka client logs through slf4j-simple to stderr.
        System.setProperty("org.slf4j.simpleLogger.logFile", "System.err");
        System.setProperty("org.slf4j.simpleLogger.defaultLogLevel", "warn");
        System.setProperty("org.slf4j.simpleLogger.showDateTime", "true");
        // Retries against an unreachable broker would otherwise log a line every backoff.
        System.setProperty("org.slf4j.simpleLogger.log.org.apache.kafka.clients.NetworkClient", "error");

        out = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
        System.setOut(System.err);

        ClientPool pool = new ClientPool();
        KafkaOps ops = new KafkaOps(pool, new LiveTail(pool, Main::emit));
        ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));

        write("{\"ready\":true}");

        String line;
        while ((line = in.readLine()) != null) {
            if (line.isBlank()) {
                continue;
            }
            JsonNode req;
            try {
                req = JSON.readTree(line);
            } catch (Exception e) {
                System.err.println("sidecar: invalid request: " + e.getMessage());
                continue;
            }
            executor.submit(() -> {
                ObjectNode res = JSON.createObjectNode();
                res.set("id", req.get("id"));
                try {
                    Object result = ops.dispatch(req.path("method").asText(), req.path("params"));
                    res.set("result", JSON.valueToTree(result));
                } catch (Throwable t) {
                    res.set("error", JSON.valueToTree(Errors.toError(t)));
                }
                String text;
                try {
                    text = JSON.writeValueAsString(res);
                } catch (Exception e) {
                    text = "{\"id\":" + req.get("id") + ",\"error\":{\"code\":0,\"name\":\"SERIALIZATION\",\"message\":\"Response could not be serialized\"}}";
                }
                write(text);
            });
        }

        executor.shutdown();
        ops.shutdown();
    }

    /** Pushes an event the Tauri side forwards to the UI. */
    static void emit(String event, Object data) {
        ObjectNode msg = JSON.createObjectNode();
        msg.put("event", event);
        msg.set("data", JSON.valueToTree(data));
        try {
            write(JSON.writeValueAsString(msg));
        } catch (Exception e) {
            System.err.println("sidecar: event could not be serialized: " + e.getMessage());
        }
    }

    private static void write(String text) {
        synchronized (out) {
            out.println(text);
        }
    }
}
