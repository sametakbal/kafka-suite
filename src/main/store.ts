import { ipcMain } from 'electron';
import Store from 'electron-store';
import { randomUUID } from 'crypto';

interface KafkaConnection {
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

interface StoreSchema {
    connections: KafkaConnection[];
}

const store = new Store<StoreSchema>({
    name: 'kafka-suite-config',
    defaults: {
        connections: [],
    },
    encryptionKey: 'kafka-suite-local-encryption-key',
});

export function setupStoreHandlers() {
    ipcMain.handle('store:getConnections', () => {
        return store.get('connections', []);
    });

    ipcMain.handle('store:addConnection', (_event, connData: Omit<KafkaConnection, 'id' | 'createdAt'>) => {
        const connections = store.get('connections', []);
        const newConn: KafkaConnection = {
            ...connData,
            id: randomUUID(),
            status: 'disconnected',
            createdAt: Date.now(),
        };
        connections.push(newConn);
        store.set('connections', connections);
        return newConn;
    });

    ipcMain.handle('store:updateConnection', (_event, id: string, data: Partial<KafkaConnection>) => {
        const connections = store.get('connections', []);
        const idx = connections.findIndex((c) => c.id === id);
        if (idx === -1) throw new Error('Connection not found');
        connections[idx] = { ...connections[idx], ...data };
        store.set('connections', connections);
        return connections[idx];
    });

    ipcMain.handle('store:deleteConnection', (_event, id: string) => {
        const connections = store.get('connections', []);
        store.set(
            'connections',
            connections.filter((c) => c.id !== id)
        );
    });
}
