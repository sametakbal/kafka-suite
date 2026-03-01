export interface KafkaConnection {
    id: string;
    name: string;
    brokers: string;
    securityProtocol: 'PLAINTEXT' | 'SSL' | 'SASL_PLAINTEXT' | 'SASL_SSL';
    saslUsername?: string;
    saslPassword?: string;
    saslMechanism?: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    status?: 'connected' | 'disconnected' | 'error';
    createdAt: number;
}

export interface TopicInfo {
    name: string;
    partitions: number;
    messageCount?: number;
}

export interface KafkaMessage {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: string | null;
    timestamp: string;
    headers?: Record<string, string>;
}
