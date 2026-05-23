import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();

// Validate required fields - NO HARDCODING
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
const guests = input.guests || 2;  // Only guests has a default

console.log(`🔍 Searching hotels in ${city} from ${checkin} to ${checkout}`);

const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    useApifyProxy: true,
});

const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`;

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            cards.forEach((card) => {
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                if (!name) return;
                
                // Extract price
                let pricePerNight = 0;
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                if (priceEl) {
                    const priceText = priceEl.innerText.trim();
                    const match = priceText.match(/(\d{2,3}(?:\.\d{2})?)/);
                    if (match) {
                        pricePerNight = parseFloat(match[1]);
                    }
                }
                
                if (pricePerNight < 20) return;
                
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
        
        console.log(`✅ Found ${hotels.length} hotels`);
        await Actor.pushData({ city, checkin, checkout, guests, hotels, totalHotels: hotels.length });
    }
});

await crawler.run([{ url: searchUrl }]);
await Actor.exit();