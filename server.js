const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const ptp = require('pdf-to-printer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Get list of printers
app.get('/printers', async (req, res) => {
    try {
        const printers = await ptp.getPrinters();
        res.json({ success: true, printers });
    } catch (error) {
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
        
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        if (url) {
            // Jika dikirimkan URL (misal URL Laporan)
            await page.goto(url, { waitUntil: 'networkidle0' });
        } else {
            // Jika dikirimkan raw HTML
            await page.setContent(html, { waitUntil: 'networkidle0' });
        }

        // Generate PDF sementara
        const tempPdfPath = path.join(__dirname, `temp_print_${Date.now()}.pdf`);
        await page.pdf({ path: tempPdfPath, format: 'A4' });

        await browser.close();

        // Kirim ke printer
        const options = {};
        if (printerName) {
            options.printer = printerName;
        }

        await ptp.print(tempPdfPath, options);

        // Hapus file sementara setelah diprint
        setTimeout(() => {
            if (fs.existsSync(tempPdfPath)) {
                fs.unlinkSync(tempPdfPath);
            }
        }, 5000);

        res.json({ success: true, message: 'Berhasil dikirim ke printer.' });

    } catch (error) {
        console.error('Print Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Local Print Service berjalan di http://localhost:${PORT}`);
    console.log(`Gunakan endpoint /printers untuk melihat daftar printer.`);
});
