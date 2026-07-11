import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'node:fs';
import { setupStoreHandlers } from './store';
import { setupKafkaHandlers } from './kafka';

let mainWindow: BrowserWindow | null = null;

const appIconPath = path.join(__dirname, '..', 'build', 'icon.png');
const appIcon = fs.existsSync(appIconPath)
    ? nativeImage.createFromPath(appIconPath)
    : undefined;

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
        ...(appIcon && { icon: appIcon }),
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
    // In dev the app runs under the generic Electron bundle, so set the dock
    // icon manually; packaged builds get it from the bundle via electron-builder
    if (process.platform === 'darwin' && !app.isPackaged && appIcon) {
        app.dock?.setIcon(appIcon);
    }

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
