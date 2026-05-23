import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';
import puppeteer from 'puppeteer';

await Actor.init();

// Get input with defaults
const input = await Actor.getInput();
const city = input?.city || 'Muscat';
const checkin = input?.checkin || '2026-06-01';
const checkout = input?.checkout || '2026-06-04';
const guests = input?.guests || 2;

console.log(`🔍 Searching for hotels in ${city}`);
console.log(`📅 Check-in: ${checkin}, Check-out: ${checkout}, Guests: ${guests}`);

// Prepare the search URL
const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`;

console.log(`🌐 URL: ${searchUrl}`);

// Create a crawler
const crawler = new PuppeteerCrawler({
    launchContext: {
        launcher: puppeteer,
        launchOptions: {
            headless: true,
            args: ['--disable-gpu', '--no-sandbox'],
        },
    },
    
    async requestHandler({ request, page }) {
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2' });
        
        // Wait for hotel cards to load
        try {
            await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        } catch (e) {
            console.log('⏱️ Timeout waiting for hotels, trying fallback...');
            await page.waitForSelector('.sr_property_block', { timeout: 10000 });
        }
        
        // Extract hotel data
        const hotels = await page.evaluate(() => {
            const results = [];
            
            // Try multiple selectors because Booking.com changes them
            const cards = document.querySelectorAll('[data-testid="property-card"], .sr_property_block, .sr_item');
            
            for (const card of cards) {
                // Get hotel name
                let name = card.querySelector('[data-testid="title"]')?.innerText?.trim();
                if (!name) name = card.querySelector('.sr-hotel__name')?.innerText?.trim();
                if (!name) name = card.querySelector('.hotel_name')?.innerText?.trim();
                if (!name) continue;
                
                // Get price
                let price = 0;
                const priceSelectors = [
                    '[data-testid="price-and-discounted-price"]',
                    '.prco-valign-middle-helper',
                    '.bui-price-display__value',
                    '.sr__px'
                ];
                for (const selector of priceSelectors) {
                    const priceEl = card.querySelector(selector);
                    if (priceEl) {
                        const priceText = priceEl.innerText?.trim() || '';
                        const match = priceText.match(/(\d+(?:\.\d+)?)/);
                        if (match) {
                            price = parseFloat(match[1]);
                            break;
                        }
                    }
                }
                
                if (price === 0) continue;
                
                // Get rating
                let rating = 0;
                const ratingEl = card.querySelector('[data-testid="rating-score"], .review-score-badge');
                if (ratingEl) {
                    rating = parseFloat(ratingEl.innerText) || 0;
                }
                
                // Get hotel URL
                let hotelUrl = '';
                const linkEl = card.querySelector('a[data-testid="property-card-link"], .hotel_name_link');
                if (linkEl) {
                    hotelUrl = linkEl.getAttribute('href') || '';
                    if (hotelUrl && !hotelUrl.startsWith('http')) {
                        hotelUrl = `https://www.booking.com${hotelUrl}`;
                    }
                }
                
                // Get star rating
                let stars = 4;
                const starsEl = card.querySelector('[data-testid="rating-stars"], .bui-review-score__stars');
                if (starsEl) {
                    const starsText = starsEl.innerText || '';
                    stars = (starsText.match(/★/g) || []).length;
                }
                
                results.push({
                    name: name,
                    pricePerNight: price,
                    stars: stars || 4,
                    rating: rating,
                    url: hotelUrl,
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