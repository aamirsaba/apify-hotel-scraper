import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();

// Validate required fields
if (!input?.city) {
    throw new Error('Missing required input: city');
}
if (!input?.checkin) {
    throw new Error('Missing required input: checkin (YYYY-MM-DD)');
}
if (!input?.checkout) {
    throw new Error('Missing required input: checkout (YYYY-MM-DD)');
}

const city = input.city;
const checkin = input.checkin;
const checkout = input.checkout;
const guests = input.guests || 2;

console.log(`🔍 Searching hotels in ${city} from ${checkin} to ${checkout}`);

const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    useApifyProxy: true,
});

const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`;

// Currency conversion rates (as of 2026)
const CURRENCY_RATES = {
    'USD': 1,
    'OMR': 2.6,      // 1 OMR = 2.6 USD
    'AED': 0.272,
    'SAR': 0.266,
    'EUR': 1.08,
    'GBP': 1.25
};

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        const hotels = await page.evaluate((rates) => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            cards.forEach((card) => {
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                if (!name) return;
                
                // Get price text
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                if (!priceEl) return;
                
                let priceText = priceEl.innerText.trim();
                let rawPrice = 0;
                let currency = 'USD';
                
                // Detect currency from text
                if (priceText.includes('OMR')) {
                    currency = 'OMR';
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) rawPrice = parseFloat(match[1]);
                } else if (priceText.includes('AED')) {
                    currency = 'AED';
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) rawPrice = parseFloat(match[1]);
                } else if (priceText.includes('SAR')) {
                    currency = 'SAR';
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) rawPrice = parseFloat(match[1]);
                } else {
                    // Assume USD or just numbers
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) rawPrice = parseFloat(match[1]);
                }
                
                // Convert to USD
                let priceInUSD = rawPrice;
                if (currency !== 'USD' && rates[currency]) {
                    priceInUSD = rawPrice * rates[currency];
                }
                
                // Validate reasonable price range ($30-$500 per night is typical for good hotels)
                if (priceInUSD < 30 || priceInUSD > 500) return;
                
                const ratingEl = card.querySelector('[data-testid="rating-score"]');
                const rating = ratingEl ? parseFloat(ratingEl.innerText) : 0;
                
                results.push({
                    name: name.substring(0, 100),
                    pricePerNight: Math.round(priceInUSD),
                    originalPrice: rawPrice,
                    originalCurrency: currency,
                    rating: rating,
                    currency: 'USD'
                });
            });
            
            return results;
        }, CURRENCY_RATES);
        
        console.log(`✅ Found ${hotels.length} hotels with converted USD prices`);
        await Actor.pushData({ 
            city, 
            checkin, 
            checkout, 
            guests, 
            hotels, 
            totalHotels: hotels.length,
            timestamp: new Date().toISOString()
        });
    }
});

await crawler.run([{ url: searchUrl }]);
console.log('🏁 Crawler finished');
await Actor.exit();