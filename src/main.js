import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

// Create proxy configuration
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],  // Use residential proxies
    useApifyProxy: true,
});

const input = await Actor.getInput();
const city = input?.city || 'Muscat';
const checkin = input?.checkin || '2026-06-01';
const checkout = input?.checkout || '2026-06-04';
const guests = input?.guests || 2;

const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`;

console.log(`🔍 Searching hotels in ${city}`);

const crawler = new PuppeteerCrawler({
    proxyConfiguration,  // Use proxies to avoid blocking
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page with proxy...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for results
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            cards.forEach((card) => {
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                let price = 0;
                if (priceEl) {
                    const priceText = priceEl.innerText.trim();
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) price = parseFloat(match[1]);
                }
                
                if (name && price > 0 && name !== 'Skip to main content') {
                    results.push({
                        name: name.substring(0, 100),
                        pricePerNight: price,
                        currency: 'USD'
                    });
                }
            });
            
            return results;
        });
        
        console.log(`✅ Found ${hotels.length} hotels`);
        await Actor.pushData({ city, hotels, totalHotels: hotels.length });
    }
});

await crawler.run([{ url: searchUrl }]);
await Actor.exit();