package org.akbal.sidecar;

import org.junit.jupiter.api.Test;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConfigTest {

    private static Config conn(String protocol, String mechanism, Config.Ssl ssl) {
        return new Config("c1", " broker1:9092 , broker2:9092 ", protocol, mechanism, "alice", "p\"w", ssl);
    }

    @Test
    void plaintextHasNoSecuritySettings() {
        Properties p = conn("PLAINTEXT", null, null).common("cid");
        assertEquals("broker1:9092,broker2:9092", p.get("bootstrap.servers"));
        assertEquals("PLAINTEXT", p.get("security.protocol"));
        assertFalse(p.containsKey("sasl.jaas.config"));
        assertFalse(p.containsKey("ssl.truststore.location"));
    }

    @Test
    void missingProtocolMeansPlaintext() {
        assertEquals("PLAINTEXT", new Config("c", "b:1", null, null, null, null, null).common("x").get("security.protocol"));
    }

    @Test
    void scramUsesTheScramLoginModuleAndEscapesQuotes() {
        Properties p = conn("SASL_SSL", "scram-sha-512", null).common("cid");
        assertEquals("SCRAM-SHA-512", p.get("sasl.mechanism"));
        String jaas = (String) p.get("sasl.jaas.config");
        assertTrue(jaas.startsWith("org.apache.kafka.common.security.scram.ScramLoginModule required"), jaas);
        assertTrue(jaas.contains("password=\"p\\\"w\""), jaas);
    }

    @Test
    void plainIsTheDefaultMechanism() {
        Properties p = conn("SASL_PLAINTEXT", "", null).common("cid");
        assertEquals("PLAIN", p.get("sasl.mechanism"));
        assertTrue(((String) p.get("sasl.jaas.config")).startsWith("org.apache.kafka.common.security.plain.PlainLoginModule"));
    }

    @Test
    void sslStoresAndHostnameVerification() {
        Config.Ssl ssl = new Config.Ssl("/certs/ca.pem", "ignored", "/certs/client.p12", "secret", false);
        Properties p = conn("SSL", null, ssl).common("cid");
        assertEquals("PEM", p.get("ssl.truststore.type"));
        assertFalse(p.containsKey("ssl.truststore.password"), "PEM truststores take no password");
        assertEquals("PKCS12", p.get("ssl.keystore.type"));
        assertEquals("secret", p.get("ssl.keystore.password"));
        assertEquals("secret", p.get("ssl.key.password"));
        assertEquals("", p.get("ssl.endpoint.identification.algorithm"));
    }

    @Test
    void sslSettingsAreIgnoredWithoutSsl() {
        Config.Ssl ssl = new Config.Ssl("/certs/trust.jks", "pw", null, null, true);
        assertFalse(conn("SASL_PLAINTEXT", "PLAIN", ssl).common("cid").containsKey("ssl.truststore.location"));
        Properties p = conn("SASL_SSL", "PLAIN", ssl).common("cid");
        assertEquals("JKS", p.get("ssl.truststore.type"));
        assertEquals("pw", p.get("ssl.truststore.password"));
        assertFalse(p.containsKey("ssl.endpoint.identification.algorithm"));
    }

    @Test
    void blankBootstrapIsRejected() {
        assertThrows(Errors.OpException.class, () -> new Config("c", " ", null, null, null, null, null).common("x"));
    }
}
