import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { setupStoreHandlers } from './store';
import { setupKafkaHandlers } from './kafka';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'Kafka Suite',
        titleBarStyle: 'hiddenInset',
        frame: true,
        backgroundColor: '#101722',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // In dev mode, load from Vite dev server
    const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();
    setupStoreHandlers();
    setupKafkaHandlers(() => mainWindow);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
