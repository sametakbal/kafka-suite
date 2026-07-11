import React, { useState } from 'react';
import { X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { KafkaConnection } from '../types';

interface AddClusterModalProps {
    onClose: () => void;
    onAdd: (data: Omit<KafkaConnection, 'id' | 'createdAt'>) => void;
    isLoading: boolean;
}

export function AddClusterModal({ onClose, onAdd, isLoading }: AddClusterModalProps) {
    const [name, setName] = useState('');
    const [brokers, setBrokers] = useState('');
    const [securityProtocol, setSecurityProtocol] = useState<KafkaConnection['securityProtocol']>('PLAINTEXT');
    const [saslUsername, setSaslUsername] = useState('');
    const [saslPassword, setSaslPassword] = useState('');
    const [saslMechanism, setSaslMechanism] = useState<'plain' | 'scram-sha-256' | 'scram-sha-512'>('plain');
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testError, setTestError] = useState('');

    const needsSasl = securityProtocol === 'SASL_PLAINTEXT' || securityProtocol === 'SASL_SSL';

    const handleTestConnection = async () => {
        setTestStatus('testing');
        setTestError('');
        try {
            const saslConfig = needsSasl
                ? { username: saslUsername, password: saslPassword, mechanism: saslMechanism }
                : undefined;
            const result = await window.electronAPI.testConnection(brokers, securityProtocol, saslConfig);
            if (result.success) {
                setTestStatus('success');
            } else {
                setTestStatus('error');
                setTestError(result.error || 'Connection failed');
            }
        } catch (err: any) {
            setTestStatus('error');
            setTestError(err.message || 'Connection test failed');
        }
    };

    const handleSubmit = () => {
        if (!name.trim() || !brokers.trim()) return;
        onAdd({
            name: name.trim(),
            brokers: brokers.trim(),
            securityProtocol,
            ...(needsSasl && {
                saslUsername,
                saslPassword,
                saslMechanism,
            }),
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[#0f172a] w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl border border-slate-700/50 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Add New Cluster</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-8 space-y-6 overflow-y-auto flex-1 min-h-0">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Cluster Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 placeholder-slate-500 outline-none"
                            placeholder="e.g. Production-West-01"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                            A friendly name to identify this cluster.
                        </p>
                    </div>

                    {/* Bootstrap Servers */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Bootstrap Servers
                        </label>
                        <input
                            type="text"
                            value={brokers}
                            onChange={(e) => setBrokers(e.target.value)}
                            className={`w-full bg-slate-800/50 border text-white text-sm rounded-lg block p-2.5 placeholder-slate-500 outline-none ${testStatus === 'error'
                                    ? 'border-red-500/50 focus:ring-red-500 focus:border-red-500'
                                    : 'border-slate-700 focus:ring-primary focus:border-primary'
                                }`}
                            placeholder="host:port,host:port"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                            Comma-separated list of broker endpoints.
                        </p>
                    </div>

                    {/* Security Protocol */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Security Protocol
                        </label>
                        <select
                            value={securityProtocol}
                            onChange={(e) =>
                                setSecurityProtocol(e.target.value as KafkaConnection['securityProtocol'])
                            }
                            className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none"
                        >
                            <option value="PLAINTEXT">PLAINTEXT</option>
                            <option value="SSL">SSL</option>
                            <option value="SASL_PLAINTEXT">SASL_PLAINTEXT</option>
                            <option value="SASL_SSL">SASL_SSL</option>
                        </select>
                    </div>

                    {/* SASL Fields (conditional) */}
                    {needsSasl && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    SASL Mechanism
                                </label>
                                <select
                                    value={saslMechanism}
                                    onChange={(e) => setSaslMechanism(e.target.value as any)}
                                    className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 outline-none"
                                >
                                    <option value="plain">PLAIN</option>
                                    <option value="scram-sha-256">SCRAM-SHA-256</option>
                                    <option value="scram-sha-512">SCRAM-SHA-512</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    SASL Username
                                </label>
                                <input
                                    type="text"
                                    value={saslUsername}
                                    onChange={(e) => setSaslUsername(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 placeholder-slate-500 outline-none"
                                    placeholder="Username"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    SASL Password
                                </label>
                                <input
                                    type="password"
                                    value={saslPassword}
                                    onChange={(e) => setSaslPassword(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 placeholder-slate-500 outline-none"
                                    placeholder="Password"
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Test Result + Footer (always visible, outside the scroll area) */}
                <div className="border-t border-slate-800 bg-slate-800/20 shrink-0">
                    {/* Success Banner */}
                    {testStatus === 'success' && (
                        <div className="mx-8 mt-4 bg-emerald-500/10 border border-emerald-500/50 rounded-lg px-4 py-3 flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                            <p className="text-emerald-300 text-sm font-medium">
                                Connection successful! Broker is reachable.
                            </p>
                        </div>
                    )}

                    {/* Error Banner */}
                    {testStatus === 'error' && testError && (
                        <div className="mx-8 mt-4 bg-red-500/10 border border-red-500 rounded-lg px-4 py-3 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div className="space-y-1 min-w-0">
                                <h3 className="text-red-400 font-semibold text-sm">Connection Failed</h3>
                                <p className="text-red-300/80 text-sm break-words">{testError}</p>
                                <p className="text-xs text-slate-400">
                                    Check network connectivity, verify broker address and port, and ensure
                                    security protocols match.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="px-8 py-5 flex justify-between items-center">
                        <button
                            onClick={onClose}
                            className="text-slate-300 hover:text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <div className="flex gap-3">
                            <button
                                onClick={handleTestConnection}
                                disabled={!brokers.trim() || testStatus === 'testing'}
                                className="text-primary hover:text-blue-400 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors border border-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {testStatus === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
                                Test Connection
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!name.trim() || !brokers.trim() || isLoading}
                                className="bg-primary hover:bg-blue-600 text-white text-sm font-semibold px-6 py-2 rounded-lg shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Add Cluster
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
