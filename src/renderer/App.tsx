import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { AddClusterModal } from './components/AddClusterModal';
import { KafkaConnection, TopicInfo } from './types';

export default function App() {
    const queryClient = useQueryClient();
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Fetch saved connections
    const { data: connections = [], isLoading: connectionsLoading } = useQuery<KafkaConnection[]>({
        queryKey: ['connections'],
        queryFn: () => window.electronAPI.getConnections(),
    });

    const selectedConnection = connections.find((c) => c.id === selectedConnectionId) || null;

    // Listen for connection status updates from the main process
    useEffect(() => {
        const cleanup = window.electronAPI.onConnectionStatus((data) => {
            queryClient.invalidateQueries({ queryKey: ['connections'] });
        });
        return cleanup;
    }, [queryClient]);

    // Add connection mutation
    const addConnectionMutation = useMutation({
        mutationFn: (data: Omit<KafkaConnection, 'id' | 'createdAt'>) =>
            window.electronAPI.addConnection(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['connections'] });
            setIsAddModalOpen(false);
        },
    });

    // Delete connection mutation
    const deleteConnectionMutation = useMutation({
        mutationFn: (id: string) => window.electronAPI.deleteConnection(id),
        onSuccess: (_, deletedId) => {
            if (selectedConnectionId === deletedId) {
                setSelectedConnectionId(null);
            }
            queryClient.invalidateQueries({ queryKey: ['connections'] });
        },
    });

    // Connect to cluster
    const connectMutation = useMutation({
        mutationFn: (id: string) => window.electronAPI.connectToKafka(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['connections'] });
        },
    });

    // Disconnect from cluster
    const disconnectMutation = useMutation({
        mutationFn: (id: string) => window.electronAPI.disconnectFromKafka(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['connections'] });
        },
    });

    const handleSelectConnection = useCallback(
        async (id: string) => {
            setSelectedConnectionId(id);
            const conn = connections.find((c) => c.id === id);
            if (conn && conn.status !== 'connected') {
                connectMutation.mutate(id);
            }
        },
        [connections, connectMutation]
    );

    return (
        <div className="h-screen flex bg-[#101722] text-slate-100 font-[Inter,sans-serif]">
            {/* Sidebar */}
            <Sidebar
                connections={connections}
                selectedConnectionId={selectedConnectionId}
                onSelectConnection={handleSelectConnection}
                onAddCluster={() => setIsAddModalOpen(true)}
                onDeleteConnection={(id) => deleteConnectionMutation.mutate(id)}
                onDisconnect={(id) => disconnectMutation.mutate(id)}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {selectedConnection ? (
                    <Dashboard
                        connection={selectedConnection}
                        onDisconnect={() => {
                            if (selectedConnectionId) disconnectMutation.mutate(selectedConnectionId);
                        }}
                    />
                ) : (
                    <EmptyState onAddCluster={() => setIsAddModalOpen(true)} />
                )}
            </div>

            {/* Add Cluster Modal */}
            {isAddModalOpen && (
                <AddClusterModal
                    onClose={() => setIsAddModalOpen(false)}
                    onAdd={(data) => addConnectionMutation.mutate(data)}
                    isLoading={addConnectionMutation.isPending}
                />
            )}
        </div>
    );
}

function EmptyState({ onAddCluster }: { onAddCluster: () => void }) {
    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-6 max-w-md">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                    <svg
                        className="w-10 h-10 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
                        />
                    </svg>
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white mb-2">Welcome to Kafka Suite</h2>
                    <p className="text-slate-400 text-sm leading-relaxed">
                        Connect to your Kafka clusters to monitor topics, browse messages, and stream data in
                        real-time. Add your first cluster to get started.
                    </p>
                </div>
                <button
                    onClick={onAddCluster}
                    className="inline-flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-blue-900/20"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add New Cluster
                </button>
            </div>
        </div>
    );
}
