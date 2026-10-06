// Human explanations for the Kafka client errors people actually hit. Unknown ones fall back to
// the sidecar's message.
import type { KError } from "./types";

export interface Explained {
  icon: string;
  title: string;
  desc: string;
  causes: string[];
  /** Wording for the second button: fix credentials, fix TLS, or just edit. */
  edit: "credentials" | "tls" | "connection";
}

const CATALOG: Record<string, Explained> = {
  TimeoutException: {
    icon: "ph-link-break", title: "Cluster not reachable", edit: "connection",
    desc: "No broker answered in time. The bootstrap servers could not be reached, or they returned addresses this machine cannot reach.",
    causes: [
      "A bootstrap server's host name or port is wrong",
      "The brokers are down, or a firewall / VPN blocks the ports",
      "advertised.listeners points to an address that only works inside the cluster's network (e.g. a Docker host name)",
      "The cluster requires SSL or SASL but the connection uses PLAINTEXT (or the other way round)",
    ],
  },
  NetworkException: {
    icon: "ph-link-break", title: "Connection lost", edit: "connection",
    desc: "The connection to a broker was closed while a request was in flight.",
    causes: ["The broker restarted or is overloaded", "The security protocol does not match the listener", "A network device closed the connection"],
  },
  SaslAuthenticationException: {
    icon: "ph-lock-key", title: "Authentication failed", edit: "credentials",
    desc: "The cluster rejected the SASL login.",
    causes: [
      "The username or saved password is wrong",
      "The SASL mechanism does not match the broker (PLAIN vs SCRAM-SHA-256 vs SCRAM-SHA-512)",
      "The SCRAM credentials were not created for this user on the cluster",
    ],
  },
  IllegalSaslStateException: {
    icon: "ph-lock-key", title: "SASL handshake failed", edit: "credentials",
    desc: "The broker did not expect a SASL handshake on this listener.",
    causes: ["The listener is PLAINTEXT or SSL, not SASL_*", "The security protocol in this connection does not match the port"],
  },
  UnsupportedSaslMechanismException: {
    icon: "ph-lock-key", title: "SASL mechanism not enabled", edit: "credentials",
    desc: "The broker does not accept the chosen SASL mechanism.",
    causes: ["Pick the mechanism listed in the broker's sasl.enabled.mechanisms"],
  },
  SslAuthenticationException: {
    icon: "ph-shield-warning", title: "TLS handshake failed", edit: "tls",
    desc: "The secure connection could not be set up.",
    causes: [
      "The broker's CA is missing from the truststore",
      "The certificate's host name does not match the bootstrap address (turn off host name verification only for testing)",
      "The broker requires a client certificate (ssl.client.auth) and none was given",
      "The listener is not SSL",
    ],
  },
  ConfigException: {
    icon: "ph-gear-six", title: "Invalid connection settings", edit: "tls",
    desc: "The Kafka client rejected the settings before connecting.",
    causes: ["A keystore or truststore path does not exist or is not readable", "A store password is wrong", "A bootstrap address is malformed"],
  },
  KafkaException: {
    icon: "ph-warning-octagon", title: "Kafka client error", edit: "connection",
    desc: "The Kafka client could not complete the request.",
    causes: [],
  },
  TopicAuthorizationException: {
    icon: "ph-lock-key", title: "Not authorized for this topic", edit: "credentials",
    desc: "The ACLs of this cluster do not allow the operation on the topic.",
    causes: ["Reading needs Describe + Read on the topic", "Producing needs Write on the topic", "Creating needs Create on the cluster or topic"],
  },
  ClusterAuthorizationException: {
    icon: "ph-lock-key", title: "Not authorized on the cluster", edit: "credentials",
    desc: "The ACLs of this cluster do not allow this operation.",
    causes: ["Creating topics needs Create on the cluster", "Describing the cluster needs Describe on the cluster"],
  },
  GroupAuthorizationException: {
    icon: "ph-lock-key", title: "Not authorized for the consumer group", edit: "credentials",
    desc: "The cluster's ACLs block the consumer group.", causes: [],
  },
  UnknownTopicOrPartitionException: {
    icon: "ph-rows", title: "Topic not found", edit: "connection",
    desc: "The topic does not exist on this cluster, or this user cannot see it.",
    causes: ["The topic name is misspelt (names are case-sensitive)", "The topic was deleted", "Describe permission is missing for this user"],
  },
  TopicExistsException: {
    icon: "ph-rows", title: "Topic already exists", edit: "connection",
    desc: "A topic with this name is already on the cluster.", causes: [],
  },
  InvalidReplicationFactorException: {
    icon: "ph-hard-drives", title: "Replication factor too high", edit: "connection",
    desc: "The replication factor is larger than the number of available brokers.",
    causes: ["Use at most as many replicas as there are brokers"],
  },
  InvalidPartitionsException: {
    icon: "ph-rows", title: "Invalid partition count", edit: "connection",
    desc: "The number of partitions is not accepted.", causes: [],
  },
  InvalidTopicException: {
    icon: "ph-rows", title: "Invalid topic name", edit: "connection",
    desc: "Topic names may use letters, digits, '.', '_' and '-', up to 249 characters.", causes: [],
  },
  InvalidConfigurationException: {
    icon: "ph-gear-six", title: "Invalid topic configuration", edit: "connection",
    desc: "The broker rejected one of the topic settings.", causes: ["Check the config name and its value format"],
  },
  PolicyViolationException: {
    icon: "ph-prohibit", title: "Rejected by the cluster's topic policy", edit: "connection",
    desc: "A create-topic policy on the brokers did not allow this topic.", causes: [],
  },
  RecordTooLargeException: {
    icon: "ph-warning", title: "Message too large", edit: "connection",
    desc: "The record is larger than the topic or broker allows.",
    causes: ["Raise max.message.bytes on the topic", "Send a smaller value"],
  },
  NOT_CONNECTED: {
    icon: "ph-plugs", title: "Not connected", edit: "connection",
    desc: "This cluster is not connected. Connect it from the sidebar and try again.", causes: [],
  },
};

const SIDECAR: Explained = {
  icon: "ph-plug", title: "Kafka engine is not running", edit: "connection", desc: "",
  causes: [
    "Security software (antivirus / EDR / AppLocker) blocked or killed the bundled java.exe",
    "The bundled Java runtime could not start",
    "The sidecar jar is missing from the installation",
  ],
};

export function explain(err: KError): Explained {
  const known = CATALOG[err.name];
  if (known) return { ...known, desc: known.desc || err.message };
  if (err.name === "SIDECAR_UNAVAILABLE" || err.name === "SIDECAR_EXITED") return { ...SIDECAR, desc: err.message };
  return {
    icon: "ph-warning-octagon", edit: "connection", causes: [], desc: err.message,
    title: err.name.replace(/Exception$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
  };
}

/** One-line log text as on the error card: client message plus the Java root cause. */
export function logLine(err: KError) {
  return [err.message, err.detail].filter(Boolean).join(" — ");
}

export function short(err: KError) {
  return err.name.replace(/Exception$/, "");
}
