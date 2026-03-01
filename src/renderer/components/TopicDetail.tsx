import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowLeft,
    Play,
    Pause,
    RefreshCw,
    Copy,
    Layers,
    ChevronRight,
    Send,
} from 'lucide-react';
import { KafkaConnection, TopicInfo, KafkaMessage } from '../types';
import { formatJson, isJsonString, formatTimestamp } from '../lib/utils';
import { ProduceMessageModal } from './ProduceMessageModal';

interface TopicDetailProps {
    connection: KafkaConnection;
    topicName: string;
    topicInfo?: TopicInfo;
    onBack: () => void;
}

const MAX_MESSAGES = 100;

export function TopicDetail({ connection, topicName, topicInfo, onBack }: TopicDetailProps) {
    const queryClient = useQueryClient();
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [liveMessages, setLiveMessages] = useState<KafkaMessage[]>([]);
    const [expandedMessage, setExpandedMessage] = useState<number | null>(null);
    const [isProduceOpen, setIsProduceOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // Fetch initial messages (last 50)
    const {
        data: initialMessages = [],
        isLoading: messagesLoading,
        refetch: refetchMessages,
    } = useQuery<KafkaMessage[]>({
        queryKey: ['messages', connection.id, topicName],
        queryFn: () => window.electronAPI.getMessages(connection.id, topicName, 50),
        enabled: connection.status === 'connected',
    });

    // All messages = initial + live (capped at MAX_MESSAGES)
    const allMessages = isLiveMode
        ? [...initialMessages, ...liveMessages].slice(-MAX_MESSAGES)
        : initialMessages;

    // Live tail subscription
    useEffect(() => {
        if (!isLiveMode) return;

        let cleanup: (() => void) | undefined;

        const startTail = async () => {
            try {
                // Subscribe to incoming messages via IPC
                cleanup = window.electronAPI.onMessage((message: KafkaMessage) => {
                    if (message.topic === topicName) {
                        setLiveMessages((prev) => {
                            const updated = [...prev, message];
                            // Buffer cap: keep only the last MAX_MESSAGES
                            return updated.slice(-MAX_MESSAGES);
                        });
                    }
                });

                await window.electronAPI.startLiveTail(connection.id, topicName);
            } catch (err) {
                console.error('Failed to start live tail:', err);
                setIsLiveMode(false);
            }
        };

        startTail();

        return () => {
            cleanup?.();
            window.electronAPI.stopLiveTail().catch(console.error);
        };
    }, [isLiveMode, connection.id, topicName]);

    // Cleanup live tail on unmount (zombie prevention)
    useEffect(() => {
        return () => {
            if (isLiveMode) {
                window.electronAPI.stopLiveTail().catch(console.error);
            }
        };
    }, []);

    // Auto-scroll to bottom in live mode
    useEffect(() => {
        if (isLiveMode && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [liveMessages, isLiveMode]);

    const toggleLiveMode = useCallback(() => {
        if (isLiveMode) {
            setIsLiveMode(false);
            setLiveMessages([]);
        } else {
            setIsLiveMode(true);
        }
    }, [isLiveMode]);

    const copyMessage = useCallback((value: string | null) => {
        if (value) {
            navigator.clipboard.writeText(isJsonString(value) ? formatJson(value) : value);
        }
    }, []);

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-[#101722]">
            {/* Header */}
            <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-[#101722]/80 backdrop-blur sticky top-0 z-20">
                <div className="flex items-center gap-3 text-sm">
                    <button
                        onClick={onBack}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-slate-400 font-medium">Topics</span>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                    <span className="text-white font-semibold bg-slate-800 px-2 py-0.5 rounded text-xs tracking-wide font-mono">
                        {topicName}
                    </span>
                    {topicInfo && (
                        <span className="text-slate-500 text-xs ml-2">
                            {topicInfo.partitions} partition{topicInfo.partitions !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {/* Produce Message Button */}
                    <button
                        onClick={() => setIsProduceOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all"
                    >
                        <Send className="w-4 h-4" />
                        Produce
                    </button>

                    {/* Live Mode Toggle */}
                    <button
                        onClick={toggleLiveMode}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${isLiveMode
                            ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            }`}
                    >
                        {isLiveMode ? (
                            <>
                                <Pause className="w-4 h-4" />
                                Stop Live
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4" />
                                Start Live
                            </>
                        )}
                    </button>

                    {!isLiveMode && (
                        <button
                            onClick={() => refetchMessages()}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                            title="Refresh Messages"
                        >
                            <RefreshCw className={`w-5 h-5 ${messagesLoading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
            </header>

            {/* Live Indicator */}
            {isLiveMode && (
                <div className="flex items-center gap-3 px-6 py-2 bg-[#0f172a] border-b border-slate-800">
                    <div className="relative flex items-center justify-center w-6 h-6">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-20 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </div>
                    <span className="text-sm font-medium text-white">
                        Live Stream:{' '}
                        <span className="font-mono text-primary">{topicName}</span>
                    </span>
                    <span className="text-xs text-slate-500 ml-auto">
                        {liveMessages.length} new message{liveMessages.length !== 1 ? 's' : ''}
                        {' | Buffer: '}
                        {allMessages.length}/{MAX_MESSAGES}
                    </span>
                </div>
            )}

            {/* Messages */}
            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3"
            >
                {/* Loading */}
                {messagesLoading && (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                        <p className="text-slate-400 text-sm">Loading messages...</p>
                    </div>
                )}

                {/* Empty */}
                {!messagesLoading && allMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Layers className="w-10 h-10 text-slate-600" />
                        <p className="text-slate-400 text-sm">
                            {isLiveMode
                                ? 'Waiting for new messages...'
                                : 'No messages found in this topic.'}
                        </p>
                    </div>
                )}

                {/* Message Cards */}
                {allMessages.map((msg, idx) => (
                    <MessageCard
                        key={`${msg.partition}-${msg.offset}-${idx}`}
                        message={msg}
                        isExpanded={expandedMessage === idx}
                        onToggle={() => setExpandedMessage(expandedMessage === idx ? null : idx)}
                        onCopy={() => copyMessage(msg.value)}
                        colorIndex={msg.partition}
                    />
                ))}

                {/* Auto-scroll anchor */}
                <div ref={messagesEndRef} />
            </div>

            {/* Produce Message Modal */}
            {isProduceOpen && (
                <ProduceMessageModal
                    connectionId={connection.id}
                    topicName={topicName}
                    partitionCount={topicInfo?.partitions}
                    onClose={() => setIsProduceOpen(false)}
                    onProduced={() => {
                        queryClient.invalidateQueries({
                            queryKey: ['messages', connection.id, topicName],
                        });
                    }}
                />
            )}
        </div>
    );
}

const PARTITION_COLORS = [
    'bg-primary',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-orange-500',
    'bg-teal-500',
];

function MessageCard({
    message,
    isExpanded,
    onToggle,
    onCopy,
    colorIndex,
}: {
    message: KafkaMessage;
    isExpanded: boolean;
    onToggle: () => void;
    onCopy: () => void;
    colorIndex: number;
}) {
    const isJson = isJsonString(message.value);
    const displayValue = isJson ? formatJson(message.value) : message.value || '';
    const borderColor = PARTITION_COLORS[colorIndex % PARTITION_COLORS.length];

    return (
        <div
            className="bg-[#1e293b] border border-slate-700/50 rounded-xl overflow-hidden shadow-sm relative group cursor-pointer transition-all hover:border-slate-600/50"
            onClick={onToggle}
        >
            {/* Colored partition indicator bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${borderColor}`} />

            {/* Message Header */}
            <div className="flex justify-between items-start px-4 pt-3 pb-2 border-b border-slate-800">
                <div className="flex gap-4 font-mono text-xs">
                    <span className="text-slate-500">
                        Offset: <span className="text-slate-300">{message.offset}</span>
                    </span>
                    <span className="text-slate-500">
                        Partition: <span className="text-slate-300">{message.partition}</span>
                    </span>
                    {message.key && (
                        <span className="text-slate-500">
                            Key: <span className="text-amber-300">{message.key}</span>
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                        {formatTimestamp(message.timestamp)}
                    </span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onCopy();
                        }}
                        className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy message"
                    >
                        <Copy className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Message Body */}
            <div className="px-4 py-3 font-mono text-sm overflow-x-auto">
                {isJson ? (
                    <pre className="text-slate-300 whitespace-pre-wrap">
                        {isExpanded
                            ? colorizeJson(displayValue)
                            : truncatePreview(displayValue)}
                    </pre>
                ) : (
                    <p className="text-slate-300 whitespace-pre-wrap">
                        {isExpanded ? displayValue : displayValue.slice(0, 200)}
                        {!isExpanded && displayValue.length > 200 && (
                            <span className="text-slate-500">...</span>
                        )}
                    </p>
                )}
            </div>
        </div>
    );
}

function truncatePreview(json: string): React.ReactNode {
    const lines = json.split('\n');
    if (lines.length <= 6) {
        return colorizeJson(json);
    }
    const preview = lines.slice(0, 5).join('\n') + '\n  ...';
    return colorizeJson(preview);
}

function colorizeJson(text: string): React.ReactNode {
    // Simple JSON colorization using regex
    const parts: React.ReactNode[] = [];
    const regex = /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|([-+]?\d+\.?\d*(?:[eE][-+]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        if (match[1]) {
            // Key (followed by colon)
            parts.push(
                <span key={match.index} className="json-key">
                    {match[1]}
                </span>
            );
            parts.push(':');
        } else if (match[2]) {
            // String value
            parts.push(
                <span key={match.index} className="json-string">
                    {match[2]}
                </span>
            );
        } else if (match[3]) {
            // Number
            parts.push(
                <span key={match.index} className="json-number">
                    {match[3]}
                </span>
            );
        } else if (match[4]) {
            // Boolean
            parts.push(
                <span key={match.index} className="json-boolean">
                    {match[4]}
                </span>
            );
        } else if (match[5]) {
            // Null
            parts.push(
                <span key={match.index} className="json-null">
                    {match[5]}
                </span>
            );
        }

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return <>{parts}</>;
}
