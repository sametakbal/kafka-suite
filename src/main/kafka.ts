import { ipcMain, BrowserWindow } from 'electron';
import { Kafka, Consumer, Admin, logLevel } from 'kafkajs';
import Store from 'electron-store';

interface KafkaConnection {
    id: string;
    name: string;
    brokers: string;
    securityProtocol: 'PLAINTEXT' | 'SSL' | 'SASL_PLAINTEXT' | 'SASL_SSL';
    saslUsername?: string;
    saslPassword?: string;
    saslMechanism?: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    status?: string;
    createdAt: number;
}

interface StoreSchema {
    connections: KafkaConnection[];
}

const store = new Store<StoreSchema>({
    name: 'kafka-suite-config',
    defaults: { connections: [] },
    encryptionKey: 'kafka-suite-local-encryption-key',
});

// Active Kafka instances and consumers
const kafkaInstances: Map<string, Kafka> = new Map();
const activeAdmins: Map<string, Admin> = new Map();
let activeConsumer: Consumer | null = null;
let activeTailConnectionId: string | null = null;

function getConnectionById(id: string): KafkaConnection | undefined {
    const connections: KafkaConnection[] = store.get('connections', []);
    return connections.find((c) => c.id === id);
}

function createKafkaInstance(conn: KafkaConnection): Kafka {
    const brokers = conn.brokers.split(',').map((b) => b.trim());

    const kafkaConfig: any = {
        clientId: `kafka-suite-${conn.id}`,
        brokers,
        logLevel: logLevel.WARN,
        connectionTimeout: 10000,
        requestTimeout: 30000,
    };

    // SASL config
    if (conn.securityProtocol === 'SASL_PLAINTEXT' || conn.securityProtocol === 'SASL_SSL') {
        if (conn.saslUsername && conn.saslPassword) {
            kafkaConfig.sasl = {
                mechanism: conn.saslMechanism || 'plain',
                username: conn.saslUsername,
                password: conn.saslPassword,
            };
        }
    }

    // SSL config
    if (conn.securityProtocol === 'SSL' || conn.securityProtocol === 'SASL_SSL') {
        kafkaConfig.ssl = true;
    }

    return new Kafka(kafkaConfig);
}

async function ensureKafkaConnection(connectionId: string): Promise<Kafka> {
    if (kafkaInstances.has(connectionId)) {
        return kafkaInstances.get(connectionId)!;
    }

    const conn = getConnectionById(connectionId);
    if (!conn) throw new Error('Connection not found');

    const kafka = createKafkaInstance(conn);
    kafkaInstances.set(connectionId, kafka);
    return kafka;
}

async function cleanupConsumer() {
    if (activeConsumer) {
        try {
            await activeConsumer.disconnect();
        } catch (e) {
            console.error('Error disconnecting consumer:', e);
        }
        activeConsumer = null;
        activeTailConnectionId = null;
    }
}

export function setupKafkaHandlers(getMainWindow: () => BrowserWindow | null) {
    // Connect to a Kafka cluster
    ipcMain.handle('kafka:connect', async (_event, connectionId: string) => {
        try {
            const kafka = await ensureKafkaConnection(connectionId);
            const admin = kafka.admin();
            await admin.connect();
            activeAdmins.set(connectionId, admin);

            // Update connection status in store
            const connections: KafkaConnection[] = store.get('connections', []);
            const idx = connections.findIndex((c) => c.id === connectionId);
            if (idx !== -1) {
                connections[idx].status = 'connected';
                store.set('connections', connections);
            }

            const win = getMainWindow();
            if (win) {
                win.webContents.send('kafka:connectionStatus', {
                    connectionId,
                    status: 'connected',
                });
            }

            return { success: true };
        } catch (error: any) {
            const win = getMainWindow();
            if (win) {
                win.webContents.send('kafka:connectionStatus', {
                    connectionId,
                    status: 'error',
                    error: error.message,
                });
            }
            return { success: false, error: error.message };
        }
    });

    // Disconnect from Kafka
    ipcMain.handle('kafka:disconnect', async (_event, connectionId: string) => {
        try {
            // Cleanup consumer if it belongs to this connection
            if (activeTailConnectionId === connectionId) {
                await cleanupConsumer();
            }

            const admin = activeAdmins.get(connectionId);
            if (admin) {
                await admin.disconnect();
                activeAdmins.delete(connectionId);
            }

            kafkaInstances.delete(connectionId);

            const connections: KafkaConnection[] = store.get('connections', []);
            const idx = connections.findIndex((c) => c.id === connectionId);
            if (idx !== -1) {
                connections[idx].status = 'disconnected';
                store.set('connections', connections);
            }
        } catch (error: any) {
            console.error('Error disconnecting:', error);
        }
    });

    // Test connection without saving
    ipcMain.handle(
        'kafka:testConnection',
        async (
            _event,
            brokers: string,
            securityProtocol: string,
            saslConfig?: { username: string; password: string; mechanism: string }
        ) => {
            try {
                const brokerList = brokers.split(',').map((b) => b.trim());
                const kafkaConfig: any = {
                    clientId: 'kafka-suite-test',
                    brokers: brokerList,
                    connectionTimeout: 10000,
                    requestTimeout: 10000,
                    logLevel: logLevel.WARN,
                };

                if (securityProtocol === 'SASL_PLAINTEXT' || securityProtocol === 'SASL_SSL') {
                    if (saslConfig) {
                        kafkaConfig.sasl = {
                            mechanism: saslConfig.mechanism || 'plain',
                            username: saslConfig.username,
                            password: saslConfig.password,
                        };
                    }
                }
                if (securityProtocol === 'SSL' || securityProtocol === 'SASL_SSL') {
                    kafkaConfig.ssl = true;
                }

                const testKafka = new Kafka(kafkaConfig);
                const testAdmin = testKafka.admin();
                await testAdmin.connect();
                await testAdmin.listTopics(); // Quick check
                await testAdmin.disconnect();

                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        }
    );

    // Get topics for a connection
    ipcMain.handle('kafka:getTopics', async (_event, connectionId: string) => {
        try {
            let admin = activeAdmins.get(connectionId);
            if (!admin) {
                const kafka = await ensureKafkaConnection(connectionId);
                admin = kafka.admin();
                await admin.connect();
                activeAdmins.set(connectionId, admin);
            }

            const topics = await admin.listTopics();
            const metadata = await admin.fetchTopicMetadata({ topics });

            return metadata.topics.map((t) => ({
                name: t.name,
                partitions: t.partitions.length,
            }));
        } catch (error: any) {
            throw new Error(`Failed to get topics: ${error.message}`);
        }
    });

    // Get last N messages from a topic
    ipcMain.handle(
        'kafka:getMessages',
        async (_event, connectionId: string, topic: string, limit: number = 50) => {
            try {
                const kafka = await ensureKafkaConnection(connectionId);
                const admin = activeAdmins.get(connectionId) || kafka.admin();

                if (!activeAdmins.has(connectionId)) {
                    await admin.connect();
                    activeAdmins.set(connectionId, admin);
                }

                // Get topic offsets to determine where to start reading
                const topicOffsets = await admin.fetchTopicOffsets(topic);
                const consumer = kafka.consumer({
                    groupId: `kafka-suite-reader-${Date.now()}`,
                });
                await consumer.connect();
                await consumer.subscribe({ topic, fromBeginning: false });

                const messages: any[] = [];
                let resolvePromise: () => void;
                const messagePromise = new Promise<void>((resolve) => {
                    resolvePromise = resolve;
                });

                // Calculate start offsets - go back 'limit' messages from the end
                const partitionOffsets = topicOffsets.map((p) => ({
                    partition: p.partition,
                    offset: Math.max(0, parseInt(p.offset) - limit).toString(),
                }));

                // Seek to calculated offsets
                await consumer.run({
                    eachMessage: async ({ topic: t, partition, message: msg }) => {
                        messages.push({
                            topic: t,
                            partition,
                            offset: msg.offset,
                            key: msg.key ? msg.key.toString() : null,
                            value: msg.value ? msg.value.toString() : null,
                            timestamp: msg.timestamp,
                            headers: msg.headers
                                ? Object.fromEntries(
                                    Object.entries(msg.headers).map(([k, v]) => [
                                        k,
                                        v ? v.toString() : '',
                                    ])
                                )
                                : undefined,
                        });

                        if (messages.length >= limit) {
                            resolvePromise();
                        }
                    },
                });

                // Seek each partition to the calculated offset
                for (const po of partitionOffsets) {
                    consumer.seek({
                        topic,
                        partition: po.partition,
                        offset: po.offset,
                    });
                }

                // Wait for messages with timeout
                await Promise.race([
                    messagePromise,
                    new Promise<void>((resolve) => setTimeout(resolve, 5000)),
                ]);

                await consumer.disconnect();
                return messages.sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp)).slice(-limit);
            } catch (error: any) {
                throw new Error(`Failed to get messages: ${error.message}`);
            }
        }
    );

    // Start live tail for a topic
    ipcMain.handle('kafka:startLiveTail', async (_event, connectionId: string, topic: string) => {
        // Always cleanup existing consumer first (zombie prevention)
        await cleanupConsumer();

        try {
            const kafka = await ensureKafkaConnection(connectionId);
            activeConsumer = kafka.consumer({
                groupId: `kafka-suite-live-${Date.now()}`,
            });

            await activeConsumer.connect();
            await activeConsumer.subscribe({ topic, fromBeginning: false });

            activeTailConnectionId = connectionId;

            await activeConsumer.run({
                eachMessage: async ({ topic: t, partition, message: msg }) => {
                    const win = getMainWindow();
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('kafka:message', {
                            topic: t,
                            partition,
                            offset: msg.offset,
                            key: msg.key ? msg.key.toString() : null,
                            value: msg.value ? msg.value.toString() : null,
                            timestamp: msg.timestamp,
                            headers: msg.headers
                                ? Object.fromEntries(
                                    Object.entries(msg.headers).map(([k, v]) => [
                                        k,
                                        v ? v.toString() : '',
                                    ])
                                )
                                : undefined,
                        });
                    }
                },
            });
        } catch (error: any) {
            await cleanupConsumer();
            throw new Error(`Failed to start live tail: ${error.message}`);
        }
    });

    // Create a new topic
    ipcMain.handle(
        'kafka:createTopic',
        async (
            _event,
            connectionId: string,
            topicName: string,
            numPartitions: number,
            replicationFactor: number,
            configs?: Record<string, string>
        ) => {
            try {
                let admin = activeAdmins.get(connectionId);
                if (!admin) {
                    const kafka = await ensureKafkaConnection(connectionId);
                    admin = kafka.admin();
                    await admin.connect();
                    activeAdmins.set(connectionId, admin);
                }

                const created = await admin.createTopics({
                    topics: [
                        {
                            topic: topicName,
                            numPartitions,
                            replicationFactor,
                            ...(configs && Object.keys(configs).length > 0
                                ? {
                                    configEntries: Object.entries(configs).map(
                                        ([name, value]) => ({ name, value })
                                    ),
                                }
                                : {}),
                        },
                    ],
                });

                if (!created) {
                    return { success: false, error: 'Topic already exists or could not be created.' };
                }

                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        }
    );

    // Produce message to a topic
    ipcMain.handle(
        'kafka:produceMessage',
        async (
            _event,
            connectionId: string,
            topic: string,
            value: string,
            key?: string,
            headers?: Record<string, string>,
            partition?: number
        ) => {
            try {
                const kafka = await ensureKafkaConnection(connectionId);
                const producer = kafka.producer();
                await producer.connect();

                const messageRecord: any = {
                    value,
                };

                if (key) {
                    messageRecord.key = key;
                }

                if (headers && Object.keys(headers).length > 0) {
                    messageRecord.headers = headers;
                }

                if (partition !== undefined && partition >= 0) {
                    messageRecord.partition = partition;
                }

                await producer.send({
                    topic,
                    messages: [messageRecord],
                });

                await producer.disconnect();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        }
    );

    // Stop live tail
    ipcMain.handle('kafka:stopLiveTail', async () => {
        await cleanupConsumer();
    });
}
