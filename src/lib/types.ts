export type Env = "DEV" | "TEST" | "PROD";

export type SecurityProtocol = "PLAINTEXT" | "SSL" | "SASL_PLAINTEXT" | "SASL_SSL";
export type SaslMechanism = "PLAIN" | "SCRAM-SHA-256" | "SCRAM-SHA-512";

export interface SslConfig {
  /** CA certificates: .jks, .p12 or .pem; empty means the Java default CAs. */
  truststore: string;
  /** Client certificate for mutual TLS (optional). */
  keystore: string;
  verifyHostname: boolean;
}

/** Saved connection. Secrets never live here — they are in the OS keyring under the id. */
export interface Connection {
  id: string;
  name: string;
  folder: string;
  env: Env;
  color: number;
  /** Comma-separated host:port list. */
  bootstrap: string;
  securityProtocol: SecurityProtocol;
  saslMechanism: SaslMechanism;
  username: string;
  savePassword: boolean;
  ssl: SslConfig;
}

export type Theme = "dark" | "light" | "system";

export interface Settings {
  theme: Theme;
  /** Latest messages read when a topic is opened. */
  messageLimit: number;
  /** Messages kept while live tailing; older ones drop off. */
  liveBuffer: number;
  /** Show CR, LF, SOH, STX, ETX… as visible markers in values. */
  showControlChars: boolean;
}

export interface ProduceHeader {
  key: string;
  value: string;
}

/** A saved sample message ("draft"); with a topic it can be sent in one click. */
export interface Template {
  name: string;
  value: string;
  key: string;
  headers: ProduceHeader[];
  partition: number | null;
  topic?: string;
  connId?: string;
  count?: number;
}

export interface KError {
  /** Kafka protocol error code for broker errors, 0 otherwise. */
  code: number;
  /** Exception class (TopicExistsException…) or a local name (SIDECAR_EXITED, NOT_CONNECTED…). */
  name: string;
  message: string;
  detail?: string | null;
}

export interface Broker {
  id: number;
  host: string;
  port: number;
  rack: string | null;
}

export interface ClusterInfo {
  clusterId: string;
  controller: number | null;
  brokers: Broker[];
  topics: number;
  elapsedMs: number;
}

export interface TopicInfo {
  name: string;
  partitions: number;
  replicationFactor: number;
  internal: boolean;
  /** Records currently retained (latest − earliest offset); null when offsets could not be read. */
  messages: number | null;
}

export interface RawHeader {
  key: string;
  value: string | null;
}

/** A record as the sidecar sends it. */
export interface RawMessage {
  partition: number;
  offset: number;
  timestamp: number;
  timestampType: string;
  key: string | null;
  keyBase64: string | null;
  value: string | null;
  valueBase64: string | null;
  size: number;
  truncated: boolean;
  tombstone: boolean;
  headers: RawHeader[];
}

export type Kind = "json" | "xml" | "text" | "binary" | "null";

/** A record ready for display. */
export interface KMessage extends RawMessage {
  /** "partition-offset", unique within a topic. */
  id: string;
  kind: Kind;
  preview: string | null;
}

export interface MessagesResult {
  topic: string;
  partitions: number;
  messages: RawMessage[];
  /** False when the read deadline passed before every partition was read to its end. */
  complete: boolean;
  elapsedMs: number;
}

export interface ProduceResult {
  count: number;
  partition: number;
  offset: number;
  timestamp: number;
  elapsedMs: number;
}

export interface LiveBatch {
  tailId: number;
  connId: string;
  topic: string;
  messages: RawMessage[];
}

export interface LiveFailure {
  tailId: number;
  connId: string;
  topic: string;
  error: KError;
}
