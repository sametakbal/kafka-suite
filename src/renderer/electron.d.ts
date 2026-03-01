import { KafkaConnection, TopicInfo, KafkaMessage } from './types';

export interface ElectronAPI {
    // Connection store
    getConnections(): Promise<KafkaConnection[]>;
    addConnection(conn: Omit<KafkaConnection, 'id' | 'createdAt'>): Promise<KafkaConnection>;
    updateConnection(id: string, data: Partial<KafkaConnection>): Promise<KafkaConnection>;
    deleteConnection(id: string): Promise<void>;

    // Kafka operations
    connectToKafka(connectionId: string): Promise<{ success: boolean; error?: string }>;
    disconnectFromKafka(connectionId: string): Promise<void>;
    testConnection(
        brokers: string,
        securityProtocol: string,
        saslConfig?: { username: string; password: string; mechanism: string }
    ): Promise<{ success: boolean; error?: string }>;
    getTopics(connectionId: string): Promise<TopicInfo[]>;
    getMessages(connectionId: string, topic: string, limit?: number): Promise<KafkaMessage[]>;

    // Topic management
    createTopic(
        connectionId: string,
        topicName: string,
        numPartitions: number,
        replicationFactor: number,
        configs?: Record<string, string>
    ): Promise<{ success: boolean; error?: string }>;

    // Produce message
    produceMessage(
        connectionId: string,
        topic: string,
        value: string,
        key?: string,
        headers?: Record<string, string>,
        partition?: number
    ): Promise<{ success: boolean; error?: string }>;

    // Live tail
    startLiveTail(connectionId: string, topic: string): Promise<void>;
    stopLiveTail(): Promise<void>;
    onMessage(callback: (message: KafkaMessage) => void): () => void;
    onConnectionStatus(
        callback: (data: { connectionId: string; status: string; error?: string }) => void
    ): () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
