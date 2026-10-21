const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const ptp = require('pdf-to-printer');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const ALLOWED_ORIGINS = new Set(['https://rsudpb.com']);
const PRINT_URL_BASE = 'https://rsudpb.com/';

function normalizePrintUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
        const error = new Error('URL cetak harus berupa teks URL yang tidak kosong.');
        error.statusCode = 400;
        throw error;
    }

    let parsedUrl;
    try {
        // Relative paths from the HIS page are resolved against rsudpb.com.
        parsedUrl = new URL(value.trim(), PRINT_URL_BASE);
    } catch {
        const error = new Error('URL cetak tidak valid. Kirim URL penuh atau path relatif, misalnya /laporan/cetak?id=123.');
        error.statusCode = 400;
        throw error;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        const error = new Error('URL cetak harus menggunakan http atau https.');
        error.statusCode = 400;
        throw error;
    }

    return parsedUrl.href;
}

async function getAvailablePrinters() {
    if (process.platform === 'darwin') {
        const { stdout } = await execFileAsync('/usr/bin/lpstat', ['-p']);
        return stdout
            .split(/\r?\n/)
            .map((line) => line.match(/^printer (\S+)\s/))
            .filter(Boolean)
            .map((match) => ({ deviceId: match[1], name: match[1], paperSizes: [] }));
    }

    return ptp.getPrinters();
}

async function printPdf(pdfPath, printerName) {
    if (process.platform === 'darwin') {
        const args = [];
        if (printerName) args.push('-d', printerName);
        args.push(pdfPath);
        return execFileAsync('/usr/bin/lp', args);
    }

    const options = {};
    if (printerName) options.printer = printerName;
    return ptp.print(pdfPath, options);
}

function findInstalledBrowser() {
    if (process.platform === 'win32') {
        const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const localAppData = process.env['LOCALAPPDATA'] || '';

        const candidates = [
            // Google Chrome
            path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
            // Microsoft Edge (bawaan Windows 10 & 11)
            path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
            path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
            path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe'),
        ];

        for (const candidate of candidates) {
            if (candidate && fs.existsSync(candidate)) {
                return candidate;
            }
        }
    } else if (process.platform === 'darwin') {
        const macCandidates = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ];
        for (const candidate of macCandidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    } else if (process.platform === 'linux') {
        const linuxCandidates = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
        ];
        for (const candidate of linuxCandidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return null;
}

function getBrowserLaunchOptions() {
    const options = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    const configuredPath = process.env.PUPPETEER_EXECUTABLE_PATH;

    if (configuredPath) {
        if (!fs.existsSync(configuredPath)) {
            throw new Error(`Browser tidak ditemukan di ${configuredPath}. Pastikan PUPPETEER_EXECUTABLE_PATH sudah benar.`);
        }
        options.executablePath = configuredPath;
        return options;
    }

    // 1. Cek Chromium bawaan Puppeteer
    try {
        const defaultPath = puppeteer.executablePath();
        if (defaultPath && fs.existsSync(defaultPath)) {
            options.executablePath = defaultPath;
            return options;
        }
    } catch {
        // Lanjut ke browser yang terpasang di sistem
    }

    // 2. Fallback otomatis: Gunakan Google Chrome atau Microsoft Edge yang terinstall di OS
    const installedPath = findInstalledBrowser();
    if (installedPath) {
        console.log(`Chromium bawaan Puppeteer tidak ditemukan. Menggunakan browser sistem: ${installedPath}`);
        options.executablePath = installedPath;
        return options;
    }

    throw new Error(
        'Tidak ditemukan Google Chrome, Microsoft Edge, atau Chromium di komputer ini. ' +
        'Silakan install Google Chrome atau set path browser di environment variable PUPPETEER_EXECUTABLE_PATH.'
    );
}

// Log requests without recording document HTML, URLs, or other print payloads.
app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        const origin = req.get('origin') || 'local/CLI';
        const errorDetail = res.locals.errorMessage ? ` error=${JSON.stringify(res.locals.errorMessage)}` : '';
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} origin=${origin} status=${res.statusCode} ${Date.now() - startedAt}ms${errorDetail}`);
    });
    next();
});

// Allow same-machine CLI requests, and browser requests from the HIS site only.
app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return res.status(403).json({ success: false, message: 'Origin tidak diizinkan.' });
    }
    next();
});
app.use(cors({ origin: [...ALLOWED_ORIGINS], methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ success: true, service: 'local-print-service' });
});

// Get list of printers
app.get('/printers', async (req, res) => {
    try {
        const printers = await getAvailablePrinters();
        res.json({ success: true, printers });
    } catch (error) {
        res.locals.errorMessage = error.message;
        console.error('Get printers Error:', error.stack || error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Print URL or HTML
app.post('/print', async (req, res) => {
    const { url, html, printerName } = req.body;

    if (!url && !html) {
        return res.status(400).json({ success: false, message: 'Harap sediakan url atau html untuk dicetak.' });
    }

    try {
        console.log(`Menyiapkan dokumen untuk printer: ${printerName || 'Default Printer'}`);
        const targetUrl = url ? normalizePrintUrl(url) : null;

        const browser = await puppeteer.launch(getBrowserLaunchOptions());
        console.log(`Browser siap: ${await browser.version()}`);
        const page = await browser.newPage();

        if (targetUrl) {
            // Jika dikirimkan URL (misal URL Laporan)
            console.log(`Membuka halaman untuk dicetak: ${new URL(targetUrl).origin}`);
            await page.goto(targetUrl, { waitUntil: 'networkidle0' });
        } else {
            // Jika dikirimkan raw HTML
            await page.setContent(html, { waitUntil: 'networkidle0' });
        }

        // Generate PDF sementara
        const tempPdfPath = path.join(__dirname, `temp_print_${Date.now()}.pdf`);
        await page.pdf({ path: tempPdfPath, format: 'A4' });

        await browser.close();

        // Kirim ke printer menggunakan CUPS di macOS, atau pdf-to-printer di Windows.
        const printResult = await printPdf(tempPdfPath, printerName);
        if (printResult?.stdout) console.log(`Print queue: ${printResult.stdout.trim()}`);

        // Hapus file sementara setelah diprint
        setTimeout(() => {
            if (fs.existsSync(tempPdfPath)) {
                fs.unlinkSync(tempPdfPath);
            }
        }, 5000);

        res.json({ success: true, message: 'Berhasil dikirim ke printer.' });

    } catch (error) {
        res.locals.errorMessage = error.message;
        console.error('Print Error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
});

const server = app.listen(PORT, () => {
    console.log(`Local Print Service berjalan di http://localhost:${PORT}`);
    console.log(`Origin browser yang diizinkan: ${[...ALLOWED_ORIGINS].join(', ')}`);
    console.log(`Cek status: http://localhost:${PORT}/health`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} sedang dipakai. Tutup proses yang menggunakannya atau jalankan dengan PORT=PORT_LAIN.`);
        process.exit(1);
    }
    console.error('Gagal menjalankan Local Print Service:', error);
    process.exit(1);
});
