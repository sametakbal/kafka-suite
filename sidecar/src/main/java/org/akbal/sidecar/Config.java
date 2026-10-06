package org.akbal.sidecar;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.Arrays;
import java.util.Locale;
import java.util.Properties;
import java.util.stream.Collectors;

/** Connection settings as sent by the UI; secrets are filled in by the Tauri side from the OS keyring. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Config(String id, String bootstrap, String securityProtocol, String saslMechanism,
                     String username, String password, Ssl ssl) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Ssl(String truststore, String truststorePassword, String keystore, String keystorePassword,
                      boolean verifyHostname) {
    }

    public String protocol() {
        return securityProtocol == null || securityProtocol.isBlank() ? "PLAINTEXT" : securityProtocol;
    }

    public boolean usesSasl() {
        return protocol().startsWith("SASL_");
    }

    public boolean usesSsl() {
        return protocol().endsWith("SSL");
    }

    /** "host1:9092, host2:9092" → "host1:9092,host2:9092". */
    public String servers() {
        if (bootstrap == null || bootstrap.isBlank()) {
            throw Errors.invalid("No bootstrap servers given");
        }
        return Arrays.stream(bootstrap.split("[,\\s]+")).map(String::trim).filter(s -> !s.isEmpty())
                .collect(Collectors.joining(","));
    }

    /** Settings shared by the admin client, consumers and producers of this connection. */
    public Properties common(String clientId) {
        Properties p = new Properties();
        p.put("bootstrap.servers", servers());
        p.put("client.id", clientId);
        p.put("security.protocol", protocol());
        p.put("socket.connection.setup.timeout.ms", "5000");
        p.put("socket.connection.setup.timeout.max.ms", "10000");
        p.put("reconnect.backoff.max.ms", "2000");

        if (usesSasl()) {
            String mechanism = saslMechanism == null || saslMechanism.isBlank() ? "PLAIN" : saslMechanism.toUpperCase(Locale.ROOT);
            String module = mechanism.startsWith("SCRAM")
                    ? "org.apache.kafka.common.security.scram.ScramLoginModule"
                    : "org.apache.kafka.common.security.plain.PlainLoginModule";
            p.put("sasl.mechanism", mechanism);
            p.put("sasl.jaas.config", module + " required username=\"" + jaasEscape(username)
                    + "\" password=\"" + jaasEscape(password) + "\";");
        }

        if (usesSsl() && ssl != null) {
            if (notBlank(ssl.truststore())) {
                String type = storeType(ssl.truststore());
                p.put("ssl.truststore.location", ssl.truststore());
                p.put("ssl.truststore.type", type);
                // PEM files carry no store password; Kafka rejects one.
                if (!type.equals("PEM") && notBlank(ssl.truststorePassword())) {
                    p.put("ssl.truststore.password", ssl.truststorePassword());
                }
            }
            if (notBlank(ssl.keystore())) {
                String type = storeType(ssl.keystore());
                p.put("ssl.keystore.location", ssl.keystore());
                p.put("ssl.keystore.type", type);
                if (notBlank(ssl.keystorePassword())) {
                    if (!type.equals("PEM")) {
                        p.put("ssl.keystore.password", ssl.keystorePassword());
                    }
                    p.put("ssl.key.password", ssl.keystorePassword());
                }
            }
            if (!ssl.verifyHostname()) {
                p.put("ssl.endpoint.identification.algorithm", "");
            }
        }
        return p;
    }

    static String storeType(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".jks")) {
            return "JKS";
        }
        if (p.endsWith(".pem") || p.endsWith(".crt") || p.endsWith(".cer")) {
            return "PEM";
        }
        return "PKCS12";
    }

    static String jaasEscape(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
