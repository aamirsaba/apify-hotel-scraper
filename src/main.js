import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
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
    proxyConfiguration,
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for results
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            cards.forEach((card) => {
                // Get hotel name
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                if (!name) return;
                
                // Get price - look for the actual total price, not deposit
                let price = 0;
                
                // Try different price selectors - priority to final price
                const priceSelectors = [
                    '[data-testid="price-and-discounted-price"]',
                    '.prco-valign-middle-helper',
                    '.bui-price-display__value',
                    '[data-testid="total-price"]',
                    '.sr__px'
                ];
                
                for (const selector of priceSelectors) {
                    const priceEl = card.querySelector(selector);
                    if (priceEl && priceEl.innerText) {
                        const priceText = priceEl.innerText.trim();
                        // Look for numbers that look like actual prices (not $0 or very small)
                        const match = priceText.match(/(\d{2,3}(?:\.\d{2})?)/);
                        if (match) {
                            const potentialPrice = parseFloat(match[1]);
                            // Ignore prices that are too small (likely deposits)
                            if (potentialPrice > 20 && potentialPrice < 5000) {
                                price = potentialPrice;
                                break;
                            }
                        }
                    }
                }
                
                // Get rating
                const ratingEl = card.querySelector('[data-testid="rating-score"]');
                const rating = ratingEl ? parseFloat(ratingEl.innerText) : 0;
                
                // Only add if we have a reasonable price
                if (name && price > 20) {
                    results.push({
                        name: name.substring(0, 100),
                        pricePerNight: price,
                        rating: rating,
                        currency: 'USD'
                    });
                }
            });
            
            return results;
        });
        
        console.log(`✅ Found ${hotels.length} hotels with reasonable prices`);
        await Actor.pushData({ city, hotels, totalHotels: hotels.length });
    }
});

await crawler.run([{ url: searchUrl }]);
await Actor.exit();