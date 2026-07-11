import React from 'react';
import {
    Database,
    CheckCircle,
    Server,
    ShieldCheck,
    ChevronRight,
    PlusCircle,
    Layers,
} from 'lucide-react';
import { KafkaConnection } from '../types';

interface OverviewProps {
    connections: KafkaConnection[];
    onOpenCluster: (id: string) => void;
    onAddCluster: () => void;
}

export function Overview({ connections, onOpenCluster, onAddCluster }: OverviewProps) {
    const connectedCount = connections.filter((c) => c.status === 'connected').length;
    const totalBrokers = connections.reduce(
        (sum, c) => sum + c.brokers.split(',').filter((b) => b.trim()).length,
        0
    );

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#101722]">
            {/* Header */}
            <header className="h-16 border-b border-slate-800 flex items-center px-6 bg-[#101722]/80 backdrop-blur sticky top-0 z-20">
                <div className="flex items-center gap-3 text-sm">
                    <span className="text-white font-semibold flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" />
                        Overview
                    </span>
                    <span className="text-slate-500 text-xs ml-2">
                        All clusters at a glance
                    </span>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Stat Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard
                        label="Total Clusters"
                        value={connections.length.toString()}
                        icon={<Database className="w-5 h-5" />}
                        iconColor="text-primary"
                    />
                    <StatCard
                        label="Connected"
                        value={`${connectedCount} / ${connections.length}`}
                        icon={<CheckCircle className="w-5 h-5" />}
                        iconColor={connectedCount > 0 ? 'text-emerald-500' : 'text-slate-500'}
                    />
                    <StatCard
                        label="Total Brokers"
                        value={totalBrokers.toString()}
                        icon={<Server className="w-5 h-5" />}
                        iconColor="text-amber-500"
                    />
                </div>

                {/* Cluster Cards */}
                <div>
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Database className="w-5 h-5 text-primary" />
                        Clusters
                    </h2>

                    {connections.length === 0 ? (
                        <div className="bg-[#1e293b] border border-slate-700/50 rounded-xl p-12 flex flex-col items-center justify-center gap-4">
                            <Database className="w-10 h-10 text-slate-600" />
                            <p className="text-slate-400 text-sm">
                                No clusters yet. Add your first cluster to get started.
                            </p>
                            <button
                                onClick={onAddCluster}
                                className="inline-flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
                            >
                                <PlusCircle className="w-4 h-4" />
                                Add New Cluster
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {connections.map((conn) => (
                                <ClusterCard
                                    key={conn.id}
                                    connection={conn}
                                    onOpen={() => onOpenCluster(conn.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

function ClusterCard({
    connection,
    onOpen,
}: {
    connection: KafkaConnection;
    onOpen: () => void;
}) {
    const isConnected = connection.status === 'connected';
    const isError = connection.status === 'error';
    const brokerCount = connection.brokers.split(',').filter((b) => b.trim()).length;

    return (
        <button
            type="button"
            onClick={onOpen}
            className="group text-left bg-[#1e293b] border border-slate-700/50 rounded-xl p-5 hover:border-primary/40 transition-all shadow-sm"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-primary/10 p-2 rounded-lg text-primary shrink-0">
                        <Database className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-white font-semibold text-sm truncate">
                            {connection.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-mono truncate">
                            {connection.brokers}
                        </p>
                    </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-primary transition-colors shrink-0 mt-1" />
            </div>

            <div className="flex items-center gap-3 text-xs">
                <span
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full font-medium ${
                        isConnected
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : isError
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-slate-700/40 text-slate-400'
                    }`}
                >
                    <span
                        className={`w-1.5 h-1.5 rounded-full ${
                            isConnected
                                ? 'bg-emerald-400 animate-pulse'
                                : isError
                                  ? 'bg-red-400'
                                  : 'bg-slate-500'
                        }`}
                    />
                    {isConnected ? 'Connected' : isError ? 'Error' : 'Disconnected'}
                </span>
                <span className="text-slate-500">
                    {brokerCount} broker{brokerCount !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1 text-slate-500 ml-auto">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {connection.securityProtocol}
                </span>
            </div>
        </button>
    );
}

function StatCard({
    label,
    value,
    icon,
    iconColor,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    iconColor: string;
}) {
    return (
        <div className="bg-[#1e293b] border border-slate-700/50 p-4 rounded-xl">
            <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm font-medium">{label}</span>
                <span className={iconColor}>{icon}</span>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
        </div>
    );
}
