import React, { useState } from 'react';
import {
    X,
    Loader2,
    Plus,
    Trash2,
    AlertCircle,
    CheckCircle,
    Send,
    Braces,
} from 'lucide-react';

interface ProduceMessageModalProps {
    connectionId: string;
    topicName: string;
    partitionCount?: number;
    onClose: () => void;
    onProduced: () => void;
}

interface HeaderEntry {
    key: string;
    value: string;
}

export function ProduceMessageModal({
    connectionId,
    topicName,
    partitionCount,
    onClose,
    onProduced,
}: ProduceMessageModalProps) {
    const [messageValue, setMessageValue] = useState('');
    const [messageKey, setMessageKey] = useState('');
    const [partition, setPartition] = useState<string>('');
    const [headers, setHeaders] = useState<HeaderEntry[]>([]);
    const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [sendCount, setSendCount] = useState(0);

    const addHeader = () => {
        setHeaders([...headers, { key: '', value: '' }]);
    };

    const removeHeader = (index: number) => {
        setHeaders(headers.filter((_, i) => i !== index));
    };

    const updateHeader = (index: number, field: 'key' | 'value', val: string) => {
        const updated = [...headers];
        updated[index] = { ...updated[index], [field]: val };
        setHeaders(updated);
    };

    const formatAsJson = () => {
        try {
            const parsed = JSON.parse(messageValue);
            setMessageValue(JSON.stringify(parsed, null, 2));
        } catch {
            // Not valid JSON, ignore
        }
    };

    const isValidJson = (() => {
        try {
            JSON.parse(messageValue);
            return true;
        } catch {
            return false;
        }
    })();

    const handleSend = async () => {
        if (!messageValue.trim()) return;

        setStatus('sending');
        setErrorMessage('');

        try {
            const headerMap: Record<string, string> = {};
            for (const h of headers) {
                if (h.key.trim() && h.value.trim()) {
                    headerMap[h.key.trim()] = h.value.trim();
                }
            }

            const partitionNum =
                partition.trim() !== '' ? parseInt(partition, 10) : undefined;

            const result = await window.electronAPI.produceMessage(
                connectionId,
                topicName,
                messageValue,
                messageKey.trim() || undefined,
                Object.keys(headerMap).length > 0 ? headerMap : undefined,
                partitionNum !== undefined && !isNaN(partitionNum) ? partitionNum : undefined
            );

            if (result.success) {
                setStatus('success');
                setSendCount((c) => c + 1);
                // Reset back to idle after brief feedback so user can send more
                setTimeout(() => setStatus('idle'), 1500);
                onProduced();
            } else {
                setStatus('error');
                setErrorMessage(result.error || 'Failed to produce message.');
            }
        } catch (err: any) {
            setStatus('error');
            setErrorMessage(err.message || 'An unexpected error occurred.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[#0f172a] w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-700/50 flex flex-col overflow-hidden max-h-[90vh]">
                {/* Header */}
                <div className="px-8 py-5 border-b border-slate-800 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Send className="w-5 h-5 text-primary" />
                            Produce Message
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Topic: <span className="font-mono text-slate-300">{topicName}</span>
                            {sendCount > 0 && (
                                <span className="ml-3 text-emerald-400">
                                    {sendCount} message{sendCount !== 1 ? 's' : ''} sent
                                </span>
                            )}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 space-y-5 overflow-y-auto flex-1">
                    {/* Success Banner */}
                    {status === 'success' && (
                        <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-3 flex items-center gap-3 animate-pulse">
                            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                            <p className="text-emerald-300 text-sm font-medium">
                                Message sent successfully!
                            </p>
                        </div>
                    )}

                    {/* Error Banner */}
                    {status === 'error' && errorMessage && (
                        <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="text-red-400 font-semibold text-sm">
                                    Failed to Produce Message
                                </h3>
                                <p className="text-red-300/80 text-sm mt-1">{errorMessage}</p>
                            </div>
                        </div>
                    )}

                    {/* Key & Partition Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Message Key
                                <span className="text-slate-500 font-normal ml-1">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={messageKey}
                                onChange={(e) => setMessageKey(e.target.value)}
                                className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 placeholder-slate-500 outline-none"
                                placeholder="e.g. user-123"
                                disabled={status === 'sending'}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Partition
                                <span className="text-slate-500 font-normal ml-1">(optional)</span>
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={partitionCount ? partitionCount - 1 : undefined}
                                value={partition}
                                onChange={(e) => setPartition(e.target.value)}
                                className="w-full bg-slate-800/50 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5 placeholder-slate-500 outline-none"
                                placeholder={
                                    partitionCount
                                        ? `0 - ${partitionCount - 1} (auto if empty)`
                                        : 'Auto'
                                }
                                disabled={status === 'sending'}
                            />
                        </div>
                    </div>

                    {/* Message Value */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-sm font-medium text-slate-300">
                                Message Value <span className="text-red-400">*</span>
                            </label>
                            <div className="flex items-center gap-2">
                                {messageValue.trim() && (
                                    <span
                                        className={`text-xs px-2 py-0.5 rounded-full ${isValidJson
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                : 'bg-slate-700/50 text-slate-400'
                                            }`}
                                    >
                                        {isValidJson ? 'Valid JSON' : 'Plain text'}
                                    </span>
                                )}
                                {isValidJson && (
                                    <button
                                        onClick={formatAsJson}
                                        className="flex items-center gap-1 text-xs text-primary hover:text-blue-400 transition-colors"
                                        title="Pretty print JSON"
                                    >
                                        <Braces className="w-3.5 h-3.5" />
                                        Format
                                    </button>
                                )}
                            </div>
                        </div>
                        <textarea
                            value={messageValue}
                            onChange={(e) => setMessageValue(e.target.value)}
                            rows={10}
                            className="w-full bg-[#0b1221] border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-3 placeholder-slate-500 outline-none font-mono resize-y"
                            placeholder='{"event": "user_signup", "userId": 42, "timestamp": "2026-03-01T12:00:00Z"}'
                            disabled={status === 'sending'}
                            spellCheck={false}
                        />
                    </div>

                    {/* Headers */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-slate-300">
                                Headers
                                <span className="text-slate-500 font-normal ml-1">(optional)</span>
                            </label>
                            <button
                                onClick={addHeader}
                                disabled={status === 'sending'}
                                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-blue-400 transition-colors disabled:opacity-50"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add Header
                            </button>
                        </div>

                        {headers.length === 0 && (
                            <p className="text-xs text-slate-500 italic">
                                No headers. Click "Add Header" to include metadata.
                            </p>
                        )}

                        <div className="space-y-2">
                            {headers.map((header, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={header.key}
                                        onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                                        className="flex-1 bg-slate-800/50 border border-slate-700 text-white text-xs rounded-lg focus:ring-primary focus:border-primary block p-2 placeholder-slate-500 outline-none"
                                        placeholder="Header key"
                                        disabled={status === 'sending'}
                                    />
                                    <input
                                        type="text"
                                        value={header.value}
                                        onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                                        className="flex-1 bg-slate-800/50 border border-slate-700 text-white text-xs rounded-lg focus:ring-primary focus:border-primary block p-2 placeholder-slate-500 outline-none"
                                        placeholder="Header value"
                                        disabled={status === 'sending'}
                                    />
                                    <button
                                        onClick={() => removeHeader(idx)}
                                        disabled={status === 'sending'}
                                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-slate-800 bg-slate-800/20 flex justify-between items-center shrink-0">
                    <button
                        onClick={onClose}
                        className="text-slate-300 hover:text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={!messageValue.trim() || status === 'sending'}
                        className="bg-primary hover:bg-blue-600 text-white text-sm font-semibold px-6 py-2 rounded-lg shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {status === 'sending' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                        Send Message
                    </button>
                </div>
            </div>
        </div>
    );
}
