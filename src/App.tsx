import { useEffect, useState } from "react";
import { activeTabOf, connOf, useApp } from "./state";
import { setWindowTitle } from "./lib/rpc";
import { ENV_COLOR, SWATCHES } from "./lib/format";
import { importConnectionsFromFile } from "./lib/transfer";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import Tabs from "./components/Tabs";
import StatusBar from "./components/StatusBar";
import Toast from "./components/Toast";
import OverviewView from "./components/OverviewView";
import TopicsView from "./components/TopicsView";
import MessagesView from "./components/MessagesView";
import WelcomeView from "./components/WelcomeView";
import ErrorView from "./components/ErrorView";
import DetailPanel from "./components/DetailPanel";
import ConnectionDrawer from "./components/dialogs/ConnectionDrawer";
import ProduceDialog from "./components/dialogs/ProduceDialog";
import CreateTopicDialog from "./components/dialogs/CreateTopicDialog";
import SettingsDialog from "./components/dialogs/SettingsDialog";
import CommandPalette from "./components/dialogs/CommandPalette";
import ErrorBoundary from "./components/ErrorBoundary";

function useResolvedTheme() {
  const theme = useApp((s) => s.settings.theme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export default function App() {
  const ready = useApp((s) => s.ready);
  const init = useApp((s) => s.init);
  const overlay = useApp((s) => s.overlay);
  const setOverlay = useApp((s) => s.setOverlay);
  const tab = useApp(activeTabOf);
  const hasConnections = useApp((s) => s.connections.length > 0);
  const conn = useApp((s) => connOf(s, tab?.connId ?? s.focusConn));
  const status = useApp((s) => (tab ? s.status[tab.connId] : undefined));
  const view = useApp((s) => (tab ? s.views[tab.id] : undefined));
  const theme = useResolvedTheme();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const base = "Kafka Suite";
    if (!conn) void setWindowTitle(base);
    else void setWindowTitle(`${base} — ${conn.name}${tab?.topic ? ` · ${tab.topic}` : ""}`);
  }, [conn, tab?.topic]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape" && useApp.getState().overlay) {
        setOverlay(null);
        return;
      }
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setOverlay({ kind: "palette" });
      } else if (k === "n") {
        e.preventDefault();
        setOverlay({ kind: "connection" });
      } else if (k === "o") {
        e.preventDefault();
        void importConnectionsFromFile();
      } else if (k === ",") {
        e.preventDefault();
        setOverlay({ kind: "settings" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOverlay]);

  if (!ready) return <div className="app" data-ks-theme={theme} />;

  const stripe = !conn ? "transparent" : conn.env === "PROD" ? ENV_COLOR.PROD : SWATCHES[conn.color] ?? "transparent";
  // A tab whose connection failed shows the error card instead of its content.
  const connError = tab && status?.state === "error" && status.error && (tab.kind === "topics" || !view?.messages.length);
  const showDetail = tab?.kind === "messages" && view && !view.detailClosed && !view.error && view.selected;

  let content;
  if (!hasConnections) content = <WelcomeView />;
  else if (!tab) content = <OverviewView />;
  else if (connError) content = <ErrorView connId={tab.connId} error={status!.error!} retryable />;
  else if (tab.kind === "topics") content = <TopicsView tab={tab} />;
  else content = <MessagesView tab={tab} />;

  return (
    <div className="app" data-ks-theme={theme}>
      <div style={{ height: 3, flex: "none", background: stripe }} />
      <TopBar />
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
          {hasConnections && <Tabs />}
          <ErrorBoundary key={tab?.id ?? "none"}>{content}</ErrorBoundary>
        </main>
        {showDetail && <ErrorBoundary key={view?.selected ?? ""}><DetailPanel tab={tab!} /></ErrorBoundary>}
      </div>
      <StatusBar />

      {overlay && <div className="scrim" onClick={() => setOverlay(null)} />}
      <ErrorBoundary key={overlay?.kind ?? "none"} onReset={() => setOverlay(null)}>
      {overlay?.kind === "connection" && <ConnectionDrawer key={overlay.connId ?? "new"} connId={overlay.connId} />}
      {overlay?.kind === "produce" && <ProduceDialog key={overlay.connId + overlay.topic} overlay={overlay} />}
      {overlay?.kind === "createTopic" && <CreateTopicDialog connId={overlay.connId} />}
      {overlay?.kind === "settings" && <SettingsDialog />}
      {overlay?.kind === "palette" && <CommandPalette />}
      </ErrorBoundary>
      <Toast />
    </div>
  );
}
