import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

// Create proxy configuration with residential proxies
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],  // Use residential proxies to avoid blocking
    useApifyProxy: true,
});

const input = await Actor.getInput();
const city = input?.city || 'Muscat';
const checkin = input?.checkin || '2026-06-01';
const checkout = input?.checkout || '2026-06-04';
const guests = input?.guests || 2;

const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}&selected_currency=USD`;

console.log(`🔍 Searching hotels in ${city}`);

const crawler = new PuppeteerCrawler({
    proxyConfiguration,  // Add this line - CRITICAL!
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Random delay to avoid detection
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Wait for results
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            cards.forEach((card) => {
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                if (!name) return;
                
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                let pricePerNight = 0;
                if (priceEl) {
                    const priceText = priceEl.innerText.trim();
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) {
                        pricePerNight = parseFloat(match[1]);
                    }
                }
                
                if (pricePerNight < 10 || pricePerNight > 2000) return;
                
                const ratingEl = card.querySelector('[data-testid="rating-score"]');
                const rating = ratingEl ? parseFloat(ratingEl.innerText) : 0;
                
                results.push({
                    name: name.substring(0, 100),
                    pricePerNight: Math.round(pricePerNight),
                    rating: rating,
                    currency: 'USD'
                });
            });
            
            return results;
        });
        
        console.log(`✅ Found ${hotels.length} hotels in ${city}`);
        await Actor.pushData({ city, hotels, totalHotels: hotels.length });
    }
});

await crawler.run([{ url: searchUrl }]);
await Actor.exit();