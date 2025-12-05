const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const { PDFDocument } = require('pdf-lib');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- IMPROVED SCROLL FUNCTION ---
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 300; // Scroll amount
            let scrolls = 0;  // Safety counter

            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                scrolls++;

                // Stop if we reached bottom OR if we have scrolled too much (safety break)
                // 500 scrolls * 300px = 150,000px height (Massive page)
                if (totalHeight >= scrollHeight || scrolls >= 500) {
                    clearInterval(timer);
                    resolve();
                }
            }, 150); // Slightly slower to allow images to render
        });
    });
}

app.post('/create-pdf', async (req, res) => {
    const { targetUrl } = req.body;

    if (!targetUrl) return res.status(400).json({ error: 'URL is required' });

    console.log(`Processing: ${targetUrl}`);

    let browser = null;

    try {
        // 1. FIX: Added protocolTimeout and memory flags
        browser = await puppeteer.launch({
            headless: "new",
            protocolTimeout: 0, // <--- DISABLES THE TIMEOUT ERROR
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Uses disk instead of RAM
                '--disable-gpu',
                '--js-flags="--max-old-space-size=4096"' // Allow more memory
            ]
        });

        const page = await browser.newPage();

        // Set a standard desktop view
        await page.setViewport({ width: 1280, height: 1024 });

        // Go to URL (Timeout increased to 3 minutes)
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 180000 });

        console.log("Starting scroll...");

        // 2. Execute the safer scroll
        await autoScroll(page);

        console.log("Scroll finished. Waiting for final render...");
        await new Promise(r => setTimeout(r, 3000)); // Wait for lazy loaded images

        // Extract Images
        const imageUrls = await page.evaluate(() => {
            const images = document.querySelectorAll('img');
            const urls = [];
            images.forEach(img => {
                // Get src or data-src (lazy load usually uses data-src)
                const src = img.src || img.getAttribute('data-src');

                // Filter out small icons/pixels
                if(src && img.width > 50 && img.height > 50) {
                    urls.push(src);
                }
            });
            // Remove duplicates
            return [...new Set(urls)];
        });

        console.log(`Found ${imageUrls.length} images.`);
        await browser.close();
        browser = null;

        if (imageUrls.length === 0) {
            return res.status(404).json({ error: 'No images found on page.' });
        }

        // Create PDF
        const pdfDoc = await PDFDocument.create();
        let addedPages = 0;

        for (let i = 0; i < imageUrls.length; i++) {
            try {
                const response = await axios.get(imageUrls[i], {
                    responseType: 'arraybuffer',
                    timeout: 5000,
                    headers: { 'User-Agent': 'Mozilla/5.0' } // Pretend to be a browser
                });

                const imageBuffer = response.data;
                const contentType = response.headers['content-type'];

                let pdfImage;
                if (contentType && contentType.includes('png')) {
                    pdfImage = await pdfDoc.embedPng(imageBuffer);
                } else if (contentType && (contentType.includes('jpeg') || contentType.includes('jpg'))) {
                    pdfImage = await pdfDoc.embedJpg(imageBuffer);
                } else {
                    // Skip webp or svg for now as pdf-lib doesn't support them natively
                    continue;
                }

                const page = pdfDoc.addPage([pdfImage.width, pdfImage.height]);
                page.drawImage(pdfImage, {
                    x: 0,
                    y: 0,
                    width: pdfImage.width,
                    height: pdfImage.height,
                });
                addedPages++;
            } catch (err) {
                // console.log(`Skipped image ${i}: ${err.message}`);
            }
        }

        if(addedPages === 0) {
            return res.status(500).json({ error: 'Could not fetch valid images (blocked or unsupported format).' });
        }

        const pdfBytes = await pdfDoc.save();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=generated.pdf');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error("Critical Error:", error.message);
        if (browser) await browser.close();
        res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
