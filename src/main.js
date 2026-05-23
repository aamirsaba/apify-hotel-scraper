import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();
const city = input?.city || 'Muscat';
const checkin = input?.checkin || '2026-06-01';
const checkout = input?.checkout || '2026-06-04';
const guests = input?.guests || 2;

const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`;

console.log(`🔍 Searching hotels in ${city}`);

const crawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for results to load
        await new Promise(r => setTimeout(r, 5000));
        
        // Extract hotel data with better selectors
        const hotels = await page.evaluate(() => {
            const results = [];
            
            // Find all property cards
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            cards.forEach((card) => {
                // Get hotel name - clean version
                let name = '';
                const nameEl = card.querySelector('[data-testid="title"]');
                if (nameEl) {
                    name = nameEl.innerText.trim();
                }
                if (!name) {
                    const linkEl = card.querySelector('a[data-testid="property-card-link"]');
                    if (linkEl) {
                        name = linkEl.innerText.trim();
                    }
                }
                if (!name) return;
                
                // Skip invalid names
                if (name === 'Skip to main content' || name.length < 2) return;
                
                // Get price
                let price = 0;
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                if (priceEl) {
                    const priceText = priceEl.innerText.trim();
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) price = parseFloat(match[1]);
                }
                
                if (price === 0) return;
                
                // Get rating
                let rating = 0;
                const ratingEl = card.querySelector('[data-testid="rating-score"]');
                if (ratingEl) {
                    rating = parseFloat(ratingEl.innerText) || 0;
                }
                
                results.push({
                    name: name.substring(0, 100),
                    pricePerNight: price,
                    rating: rating,
                    currency: 'USD'
                });
            });
            
            return results;
        });
        
        console.log(`✅ Found ${hotels.length} hotels in ${city}`);
        
        await Actor.pushData({
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: guests,
            totalHotels: hotels.length,
            hotels: hotels,
            timestamp: new Date().toISOString()
        });
    }
});

await crawler.run([{ url: searchUrl }]);
console.log('🏁 Crawler finished');
await Actor.exit();