import React, { useState } from 'react';
import { X, Loader2, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';

interface CreateTopicModalProps {
    connectionId: string;
    onClose: () => void;
    onCreated: () => void;
}

interface ConfigEntry {
    key: string;
    value: string;
}

const COMMON_CONFIGS = [
    { key: 'cleanup.policy', description: 'delete, compact, or delete,compact' },
    { key: 'retention.ms', description: 'Message retention time in ms' },
    { key: 'retention.bytes', description: 'Max bytes retained per partition' },
    { key: 'max.message.bytes', description: 'Max message size in bytes' },
    { key: 'min.insync.replicas', description: 'Min in-sync replicas for acks' },
    { key: 'compression.type', description: 'producer, gzip, snappy, lz4, zstd' },
    { key: 'segment.bytes', description: 'Log segment file size' },
];

export function CreateTopicModal({ connectionId, onClose, onCreated }: CreateTopicModalProps) {
    const [topicName, setTopicName] = useState('');
    const [numPartitions, setNumPartitions] = useState(1);
    const [replicationFactor, setReplicationFactor] = useState(1);
    const [configs, setConfigs] = useState<ConfigEntry[]>([]);
    const [status, setStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const addConfig = () => {
        setConfigs([...configs, { key: '', value: '' }]);
    };

    const removeConfig = (index: number) => {
        setConfigs(configs.filter((_, i) => i !== index));
    };

    const updateConfig = (index: number, field: 'key' | 'value', val: string) => {
        const updated = [...configs];
        updated[index] = { ...updated[index], [field]: val };
        setConfigs(updated);
    };

    const handleCreate = async () => {
        if (!topicName.trim()) return;

        setStatus('creating');
        setErrorMessage('');

        try {
            const configMap: Record<string, string> = {};
            for (const c of configs) {
                if (c.key.trim() && c.value.trim()) {
                    configMap[c.key.trim()] = c.value.trim();
                }
            }

            const result = await window.electronAPI.createTopic(
                connectionId,
                topicName.trim(),
                numPartitions,
                replicationFactor,
                Object.keys(configMap).length > 0 ? configMap : undefined
            );

            if (result.success) {
                setStatus('success');
                setTimeout(() => {
                    onCreated();
                    onClose();
                }, 1000);
            } else {
                setStatus('error');
                setErrorMessage(result.error || 'Failed to create topic.');
            }
        } catch (err: any) {
            setStatus('error');
            setErrorMessage(err.message || 'An unexpected error occurred.');
        }
    };

    const isValid = topicName.trim().length > 0 && numPartitions >= 1 && replicationFactor >= 1;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[#0f172a] w-full max-w-xl rounded-2xl shadow-2xl border border-slate-700/50 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Create New Topic</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 space-y-5 overflow-y-auto max-h-[60vh]">
                    {/* Success Banner */}
                    {status === 'success' && (
                        <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-4 flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                            <p className="text-emerald-300 text-sm font-medium">
                                Topic <span className="font-mono">{topicName}</span> created successfully!
                            </p>
                        </div>
                    )}

                    {/* Error Banner */}
                    {status === 'error' && errorMessage && (
                        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="text-red-400 font-semibold text-sm">Failed to Create Topic</h3>
                                <p className="text-red-300/80 text-sm mt-1">{errorMessage}</p>
                            </div>
                        </div>
                    )}

                    {/* Topic Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Topic Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={topicName}
                            onChange={(e) => setTopicName(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 placeholder-slate-500 outline-none"
                            placeholder="e.g. user-events, order-stream"
                            disabled={status === 'creating' || status === 'success'}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                            Use lowercase, hyphens or dots. Avoid special characters.
                        </p>
                    </div>

                    {/* Partitions & Replication Factor */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Partitions
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                value={numPartitions}
                                onChange={(e) => setNumPartitions(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none"
                                disabled={status === 'creating' || status === 'success'}
                            />
                            <p className="mt-1 text-xs text-slate-500">
                                Parallelism level. More = higher throughput.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Replication Factor
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={10}
                                value={replicationFactor}
                                onChange={(e) => setReplicationFactor(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none"
                                disabled={status === 'creating' || status === 'success'}
                            />
                            <p className="mt-1 text-xs text-slate-500">
                                Number of copies. Cannot exceed broker count.
                            </p>
                        </div>
                    </div>

                    {/* Advanced Configs */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="block text-sm font-medium text-slate-300">
                                Advanced Configuration
                            </label>
                            <button
                                onClick={addConfig}
                                disabled={status === 'creating' || status === 'success'}
                                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add Config
                            </button>
                        </div>

                        {configs.length === 0 && (
                            <p className="text-xs text-slate-500 italic">
                                No custom configuration. Click "Add Config" to set retention, compression, etc.
                            </p>
                        )}

                        <div className="space-y-2">
                            {configs.map((config, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            value={config.key}
                                            onChange={(e) => updateConfig(idx, 'key', e.target.value)}
                                            list="config-keys"
                                            className="w-full bg-slate-800/50 border border-slate-700 text-white text-xs rounded-lg focus:ring-primary focus:border-primary block p-2 placeholder-slate-500 outline-none"
                                            placeholder="Config key (e.g. retention.ms)"
                                            disabled={status === 'creating' || status === 'success'}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            value={config.value}
                                            onChange={(e) => updateConfig(idx, 'value', e.target.value)}
                                            className="w-full bg-slate-800/50 border border-slate-700 text-white text-xs rounded-lg focus:ring-primary focus:border-primary block p-2 placeholder-slate-500 outline-none"
                                            placeholder="Value"
                                            disabled={status === 'creating' || status === 'success'}
                                        />
                                    </div>
                                    <button
                                        onClick={() => removeConfig(idx)}
                                        disabled={status === 'creating' || status === 'success'}
                                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Datalist for autocomplete */}
                        <datalist id="config-keys">
                            {COMMON_CONFIGS.map((c) => (
                                <option key={c.key} value={c.key}>
                                    {c.description}
                                </option>
                            ))}
                        </datalist>

                        {/* Common config hints */}
                        {configs.length > 0 && (
                            <div className="mt-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                                <p className="text-xs font-medium text-slate-400 mb-2">Common configs:</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {COMMON_CONFIGS.map((c) => (
                                        <button
                                            key={c.key}
                                            onClick={() => {
                                                const emptyIdx = configs.findIndex((cfg) => !cfg.key.trim());
                                                if (emptyIdx >= 0) {
                                                    updateConfig(emptyIdx, 'key', c.key);
                                                } else {
                                                    setConfigs([...configs, { key: c.key, value: '' }]);
                                                }
                                            }}
                                            disabled={status === 'creating' || status === 'success'}
                                            className="px-2 py-1 text-xs bg-slate-700/50 text-slate-300 rounded hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50"
                                            title={c.description}
                                        >
                                            {c.key}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-slate-800 bg-slate-800/20 flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="text-slate-300 hover:text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!isValid || status === 'creating' || status === 'success'}
                        className="bg-primary hover:bg-blue-600 text-white text-sm font-semibold px-6 py-2 rounded-lg shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {status === 'creating' && <Loader2 className="w-4 h-4 animate-spin" />}
                        {status === 'success' ? 'Created!' : 'Create Topic'}
                    </button>
                </div>
            </div>
        </div>
    );
}
