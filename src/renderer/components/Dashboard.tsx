import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    RefreshCw,
    Search,
    CheckCircle,
    Layers,
    Activity,
    AlertTriangle,
    ChevronRight,
    Plus,
} from 'lucide-react';
import { KafkaConnection, TopicInfo } from '../types';
import { TopicDetail } from './TopicDetail';
import { CreateTopicModal } from './CreateTopicModal';

interface DashboardProps {
    connection: KafkaConnection;
    onDisconnect: () => void;
}

export function Dashboard({ connection, onDisconnect }: DashboardProps) {
    const queryClient = useQueryClient();
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);

    // Fetch topics for connected cluster
    const {
        data: topics = [],
        isLoading: topicsLoading,
        error: topicsError,
        refetch: refetchTopics,
    } = useQuery<TopicInfo[]>({
        queryKey: ['topics', connection.id],
        queryFn: () => window.electronAPI.getTopics(connection.id),
        enabled: connection.status === 'connected',
        retry: 1,
    });

    const filteredTopics = topics.filter((t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const isConnected = connection.status === 'connected';

    if (selectedTopic) {
        return (
            <TopicDetail
                connection={connection}
                topicName={selectedTopic}
                topicInfo={topics.find((t) => t.name === selectedTopic)}
                onBack={() => setSelectedTopic(null)}
            />
        );
    }

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#101722]">
            {/* Header */}
            <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-[#101722]/80 backdrop-blur sticky top-0 z-20">
                <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-400 font-medium">Clusters</span>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                    <span className="text-white font-semibold bg-slate-800 px-2 py-0.5 rounded text-xs tracking-wide">
                        {connection.name}
                    </span>
                    {isConnected && (
                        <span className="flex items-center gap-1.5 ml-2 text-emerald-400 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Connected
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {/* Search */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-[#1e293b] text-white text-sm rounded-lg block w-80 pl-10 p-2.5 border border-slate-700 focus:ring-2 focus:ring-primary focus:border-primary placeholder-slate-400 transition-all outline-none"
                            placeholder="Search topics..."
                        />
                    </div>
                    <div className="h-6 w-px bg-slate-700" />
                    <button
                        onClick={() => refetchTopics()}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-5 h-5 ${topicsLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Stat Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        label="Connection Status"
                        value={isConnected ? 'Online' : 'Offline'}
                        icon={<CheckCircle className="w-5 h-5" />}
                        iconColor={isConnected ? 'text-emerald-500' : 'text-red-500'}
                    />
                    <StatCard
                        label="Total Topics"
                        value={topics.length.toString()}
                        icon={<Layers className="w-5 h-5" />}
                        iconColor="text-primary"
                    />
                    <StatCard
                        label="Total Partitions"
                        value={topics.reduce((sum, t) => sum + t.partitions, 0).toString()}
                        icon={<Activity className="w-5 h-5" />}
                        iconColor="text-amber-500"
                    />
                    <StatCard
                        label="Brokers"
                        value={connection.brokers.split(',').length.toString()}
                        icon={<AlertTriangle className="w-5 h-5" />}
                        iconColor="text-purple-400"
                    />
                </div>

                {/* Topic Explorer */}
                <div className="bg-[#1e293b] border border-slate-700/50 rounded-xl overflow-hidden flex flex-col shadow-xl shadow-black/20">
                    <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between bg-[#0f172a]/30">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Layers className="w-5 h-5 text-primary" />
                            Topic Explorer
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-slate-400">
                                {filteredTopics.length} topic{filteredTopics.length !== 1 ? 's' : ''}
                            </span>
                            {isConnected && (
                                <button
                                    onClick={() => setIsCreateTopicOpen(true)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-sm font-medium transition-colors border border-primary/20"
                                >
                                    <Plus className="w-4 h-4" />
                                    New Topic
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Loading State */}
                    {topicsLoading && (
                        <div className="p-12 flex flex-col items-center justify-center gap-3">
                            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-slate-400 text-sm">Loading topics...</p>
                        </div>
                    )}

                    {/* Error State */}
                    {topicsError && (
                        <div className="p-12 flex flex-col items-center justify-center gap-3">
                            <AlertTriangle className="w-8 h-8 text-red-400" />
                            <p className="text-red-400 text-sm">
                                {(topicsError as Error).message || 'Failed to load topics'}
                            </p>
                            <button
                                onClick={() => refetchTopics()}
                                className="text-primary text-sm hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    )}

                    {/* Not Connected State */}
                    {!isConnected && !topicsLoading && (
                        <div className="p-12 flex flex-col items-center justify-center gap-3">
                            <AlertTriangle className="w-8 h-8 text-amber-400" />
                            <p className="text-slate-400 text-sm">Connecting to cluster...</p>
                        </div>
                    )}

                    {/* Topic Table */}
                    {isConnected && !topicsLoading && !topicsError && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wider text-slate-400 font-semibold bg-slate-800/20">
                                        <th className="px-6 py-4 font-medium">Topic Name</th>
                                        <th className="px-6 py-4 font-medium">Partitions</th>
                                        <th className="px-6 py-4 font-medium w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/50 text-sm text-slate-300">
                                    {filteredTopics.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                                                {searchQuery ? 'No topics match your search.' : 'No topics found.'}
                                            </td>
                                        </tr>
                                    )}
                                    {filteredTopics.map((topic) => (
                                        <tr
                                            key={topic.name}
                                            onClick={() => setSelectedTopic(topic.name)}
                                            className="group hover:bg-slate-800/30 transition-colors cursor-pointer"
                                        >
                                            <td className="px-6 py-4 font-medium text-white flex items-center gap-2">
                                                <Layers className="w-4 h-4 text-slate-500 group-hover:text-primary transition-colors" />
                                                {topic.name}
                                            </td>
                                            <td className="px-6 py-4">{topic.partitions}</td>
                                            <td className="px-6 py-4 text-right">
                                                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {/* Create Topic Modal */}
            {isCreateTopicOpen && (
                <CreateTopicModal
                    connectionId={connection.id}
                    onClose={() => setIsCreateTopicOpen(false)}
                    onCreated={() => {
                        queryClient.invalidateQueries({ queryKey: ['topics', connection.id] });
                    }}
                />
            )}
        </div>
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
