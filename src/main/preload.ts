import { contextBridge, ipcRenderer } from 'electron';

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

const electronAPI = {
    // Connection store
    getConnections: (): Promise<KafkaConnection[]> =>
        ipcRenderer.invoke('store:getConnections'),
    addConnection: (conn: Omit<KafkaConnection, 'id' | 'createdAt'>): Promise<KafkaConnection> =>
        ipcRenderer.invoke('store:addConnection', conn),
    updateConnection: (id: string, data: Partial<KafkaConnection>): Promise<KafkaConnection> =>
        ipcRenderer.invoke('store:updateConnection', id, data),
    deleteConnection: (id: string): Promise<void> =>
        ipcRenderer.invoke('store:deleteConnection', id),

    // Kafka operations
    connectToKafka: (connectionId: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('kafka:connect', connectionId),
    disconnectFromKafka: (connectionId: string): Promise<void> =>
        ipcRenderer.invoke('kafka:disconnect', connectionId),
    testConnection: (brokers: string, securityProtocol: string, saslConfig?: { username: string; password: string; mechanism: string }): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('kafka:testConnection', brokers, securityProtocol, saslConfig),
    getTopics: (connectionId: string): Promise<TopicInfo[]> =>
        ipcRenderer.invoke('kafka:getTopics', connectionId),
    getMessages: (connectionId: string, topic: string, limit?: number): Promise<KafkaMessage[]> =>
        ipcRenderer.invoke('kafka:getMessages', connectionId, topic, limit),

    // Topic management
    createTopic: (
        connectionId: string,
        topicName: string,
        numPartitions: number,
        replicationFactor: number,
        configs?: Record<string, string>
    ): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('kafka:createTopic', connectionId, topicName, numPartitions, replicationFactor, configs),

    // Produce message
    produceMessage: (
        connectionId: string,
        topic: string,
        value: string,
        key?: string,
        headers?: Record<string, string>,
        partition?: number
    ): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('kafka:produceMessage', connectionId, topic, value, key, headers, partition),

    // Live tail
    startLiveTail: (connectionId: string, topic: string): Promise<void> =>
        ipcRenderer.invoke('kafka:startLiveTail', connectionId, topic),
    stopLiveTail: (): Promise<void> =>
        ipcRenderer.invoke('kafka:stopLiveTail'),
    onMessage: (callback: (message: KafkaMessage) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, message: KafkaMessage) => callback(message);
        ipcRenderer.on('kafka:message', handler);
        return () => ipcRenderer.removeListener('kafka:message', handler);
    },
    onConnectionStatus: (callback: (data: { connectionId: string; status: string; error?: string }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { connectionId: string; status: string; error?: string }) => callback(data);
        ipcRenderer.on('kafka:connectionStatus', handler);
        return () => ipcRenderer.removeListener('kafka:connectionStatus', handler);
    },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
    interface Window {
        electronAPI: typeof electronAPI;
    }
}
