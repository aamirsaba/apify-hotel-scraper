import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

// Get input from your website
const input = await Actor.getInput();
const { city, checkin, checkout, guests = 2 } = input;

console.log(`🔍 Searching for hotels in ${city}`);

// Prepare the search URL
const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`;

console.log(`🌐 URL: ${searchUrl}`);

// Create a crawler
const crawler = new PuppeteerCrawler({
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu', '--no-sandbox'],
        },
    },
    
    async requestHandler({ request, page }) {
        console.log(`📄 Processing: ${request.url}`);
        
        // Wait for hotel cards to load
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        // Extract hotel data
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            for (const card of cards) {
                const name = card.querySelector('[data-testid="title"]')?.innerText?.trim() || '';
                if (!name) continue;
                
                const priceElement = card.querySelector('[data-testid="price-and-discounted-price"]');
                const priceText = priceElement?.innerText?.trim() || '';
                const priceMatch = priceText.match(/(\d+(?:\.\d+)?)/);
                const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
                
                if (price === 0) continue;
                
                const ratingElement = card.querySelector('[data-testid="rating-score"]');
                const rating = ratingElement?.innerText?.trim() || '';
                
                const linkElement = card.querySelector('a[data-testid="property-card-link"]');
                const hotelUrl = linkElement?.getAttribute('href') || '';
                
                const starsElement = card.querySelector('[data-testid="rating-stars"]');
                let stars = 0;
                if (starsElement) {
                    const starsText = starsElement.innerText || '';
                    stars = (starsText.match(/★/g) || []).length;
                }
                
                results.push({
                    name: name,
                    pricePerNight: price,
                    stars: stars || 4,
                    rating: parseFloat(rating) || 0,
                    url: hotelUrl ? `https://www.booking.com${hotelUrl}` : null,
                    currency: 'USD'
                });
                
                if (results.length >= 20) break;
            }
            
            return results;
        });
        
        console.log(`✅ Found ${hotels.length} hotels`);
        
        await Actor.pushData({
            city,
            checkin,
            checkout,
            guests,
            hotels,
            count: hotels.length,
            timestamp: new Date().toISOString()
        });
    },
    
    async failedRequestHandler({ request }) {
        console.error(`❌ Failed: ${request.url}`);
    }
});

// Run the crawler
await crawler.run([{ url: searchUrl }]);

console.log('🏁 Crawler finished');

await Actor.exit();