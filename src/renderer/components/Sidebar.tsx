import React from 'react';
import {
    Monitor,
    Database,
    Layers,
    Users,
    PlusCircle,
    Trash2,
    Unplug,
} from 'lucide-react';
import { KafkaConnection } from '../types';

interface SidebarProps {
    connections: KafkaConnection[];
    selectedConnectionId: string | null;
    onSelectConnection: (id: string) => void;
    onAddCluster: () => void;
    onDeleteConnection: (id: string) => void;
    onDisconnect: (id: string) => void;
}

export function Sidebar({
    connections,
    selectedConnectionId,
    onSelectConnection,
    onAddCluster,
    onDeleteConnection,
    onDisconnect,
}: SidebarProps) {
    return (
        <div className="w-64 h-full bg-[#0f172a] border-r border-slate-800 flex flex-col shrink-0">
            {/* Brand Header */}
            <div className="p-6 flex items-center gap-3">
                <div className="bg-primary/20 p-2 rounded-lg text-primary">
                    <Monitor className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                    <h1 className="text-base font-bold text-white tracking-wide">Kafka Suite</h1>
                    <p className="text-xs text-slate-400">v1.0.0</p>
                </div>
            </div>

            {/* Navigation & Clusters */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
                {/* Platform Section */}
                <div>
                    <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Platform
                    </p>
                    <ul className="space-y-1">
                        <NavItem icon={<Layers className="w-5 h-5" />} label="Overview" active={false} />
                        <NavItem icon={<Database className="w-5 h-5" />} label="Clusters" active={true} />
                    </ul>
                </div>

                {/* Active Clusters */}
                <div>
                    <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Active Clusters
                    </p>
                    <ul className="space-y-1">
                        {connections.length === 0 && (
                            <li className="px-3 py-2 text-xs text-slate-500 italic">
                                No clusters yet. Add one below.
                            </li>
                        )}
                        {connections.map((conn) => (
                            <li key={conn.id} className="group">
                                <div
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${selectedConnectionId === conn.id
                                        ? 'bg-slate-800/50 text-white border border-slate-700/50'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                                        }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => onSelectConnection(conn.id)}
                                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                                    >
                                        <div
                                            className={`w-2 h-2 rounded-full shrink-0 ${conn.status === 'connected'
                                                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                                                : conn.status === 'error'
                                                    ? 'bg-red-500'
                                                    : 'bg-slate-500'
                                                }`}
                                        />
                                        <span className="text-sm font-medium truncate">{conn.name}</span>
                                    </button>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {conn.status === 'connected' && (
                                            <button
                                                type="button"
                                                onClick={() => onDisconnect(conn.id)}
                                                className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-amber-400"
                                                title="Disconnect"
                                            >
                                                <Unplug className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onDeleteConnection(conn.id)}
                                            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Add Cluster Button */}
            <div className="p-4 border-t border-slate-800">
                <button
                    onClick={onAddCluster}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-blue-900/20"
                >
                    <PlusCircle className="w-5 h-5" />
                    <span>Add New Cluster</span>
                </button>
            </div>
        </div>
    );
}

function NavItem({
    icon,
    label,
    active,
}: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
}) {
    return (
        <li>
            <a
                href="#"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${active
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
            >
                {icon}
                <span className="text-sm font-medium">{label}</span>
            </a>
        </li>
    );
}
