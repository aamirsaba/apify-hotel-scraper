import { Actor } from 'apify';

await Actor.init();

// Get input
const input = await Actor.getInput();
const city = input?.city || 'Muscat';
const checkin = input?.checkin || '2026-06-01';
const checkout = input?.checkout || '2026-06-04';
const guests = input?.guests || 2;

console.log(`🔍 Searching for hotels in ${city}`);
console.log(`📅 ${checkin} to ${checkout}, ${guests} guests`);

// Build the Booking.com URL
const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`;
console.log(`🌐 ${searchUrl}`);

// Use Apify's PuppeteerCrawler
const crawler = new Actor.PuppeteerCrawler({
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page...`);
        
        // Navigate to the page
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for hotel cards to appear
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        // Extract hotel data
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            for (const card of cards) {
                // Hotel name
                const nameElement = card.querySelector('[data-testid="title"]');
                const name = nameElement?.innerText?.trim();
                if (!name) continue;
                
                // Price
                const priceElement = card.querySelector('[data-testid="price-and-discounted-price"]');
                let price = 0;
                if (priceElement) {
                    const priceText = priceElement.innerText.trim();
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) price = parseFloat(match[1]);
                }
                if (price === 0) continue;
                
                // Rating
                const ratingElement = card.querySelector('[data-testid="rating-score"]');
                const rating = ratingElement ? parseFloat(ratingElement.innerText) : 0;
                
                // Hotel URL
                const linkElement = card.querySelector('a[data-testid="property-card-link"]');
                let hotelUrl = linkElement?.getAttribute('href') || '';
                if (hotelUrl && !hotelUrl.startsWith('http')) {
                    hotelUrl = `https://www.booking.com${hotelUrl}`;
                }
                
                // Star rating
                const starsElement = card.querySelector('[data-testid="rating-stars"]');
                let stars = 0;
                if (starsElement) {
                    stars = (starsElement.innerText.match(/★/g) || []).length;
                }
                
                results.push({
                    name: name,
                    pricePerNight: price,
                    stars: stars || 3,
                    rating: rating,
                    url: hotelUrl,
                    currency: 'USD'
                });
                
                // Limit to 20 hotels
                if (results.length >= 20) break;
            }
            
            return results;
        });
        
        console.log(`✅ Found ${hotels.length} hotels in ${city}`);
        
        // Save results
        await Actor.pushData({
            city: city,
            checkin: checkin,
            checkout: checkout,
            guests: guests,
            totalHotels: hotels.length,
            hotels: hotels,
            timestamp: new Date().toISOString()
        });
    },
    
    maxRequestsPerCrawl: 1,
});

// Start the crawler
await crawler.run([{ url: searchUrl }]);

console.log('🏁 Crawler finished successfully');

await Actor.exit();