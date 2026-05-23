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
console.log(`🌐 ${searchUrl}`);

const crawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Navigating to Booking.com...`);
        
        // Go to the search page
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Accept cookies if the popup appears
        try {
            await page.click('#onetrust-accept-btn-handler');
            await page.waitForTimeout(1000);  // This works in older versions
        } catch (e) {
            console.log('No cookie popup or already accepted');
        }
        
        // Use setTimeout instead of waitForTimeout
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Extract hotel data
        const hotels = await page.evaluate(() => {
            const results = [];
            
            // Find hotel cards
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            cards.forEach((card, index) => {
                if (index >= 10) return;
                
                // Hotel name
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                
                // Price
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                let price = 0;
                if (priceEl) {
                    const priceText = priceEl.innerText.trim();
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) price = parseFloat(match[1]);
                }
                
                // Rating
                const ratingEl = card.querySelector('[data-testid="rating-score"]');
                const rating = ratingEl ? parseFloat(ratingEl.innerText) : 0;
                
                if (name && price > 0) {
                    results.push({
                        name: name,
                        pricePerNight: price,
                        rating: rating,
                        currency: 'USD'
                    });
                }
            });
            
            return results;
        });
        
        console.log(`✅ Found ${hotels.length} hotels in ${city}`);
        
        // Push data to output
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

// Run the crawler
await crawler.run([{ url: searchUrl }]);

console.log('🏁 Crawler finished successfully!');
await Actor.exit();