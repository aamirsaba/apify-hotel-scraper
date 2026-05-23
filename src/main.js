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
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for results
        await page.waitForSelector('[data-testid="property-card"], .sr_property_block, .accommodation-card', { timeout: 30000 });
        
        // Take a screenshot for debugging (optional)
        await page.screenshot({ path: 'booking-page.png' });
        
        // Extract hotel data
        const hotels = await page.evaluate(() => {
            const results = [];
            
            // Try multiple selectors to find hotel cards
            const selectors = [
                '[data-testid="property-card"]',
                '.sr_property_block',
                '.accommodation-card',
                '[data-testid="accommodation-card"]',
                '.sr_item'
            ];
            
            let cards = [];
            for (const selector of selectors) {
                cards = document.querySelectorAll(selector);
                if (cards.length > 0) {
                    console.log(`Found ${cards.length} cards with selector: ${selector}`);
                    break;
                }
            }
            
            cards.forEach((card, index) => {
                if (index >= 10) return;
                
                // Try multiple selectors for hotel name
                let name = '';
                const nameSelectors = [
                    '[data-testid="title"]',
                    '.sr-hotel__name',
                    '.hotel_name',
                    '.accommodation-name'
                ];
                for (const sel of nameSelectors) {
                    const el = card.querySelector(sel);
                    if (el && el.innerText) {
                        name = el.innerText.trim();
                        break;
                    }
                }
                if (!name) return;
                
                // Try multiple selectors for price
                let price = 0;
                const priceSelectors = [
                    '[data-testid="price-and-discounted-price"]',
                    '.prco-valign-middle-helper',
                    '.bui-price-display__value',
                    '.sr__px',
                    '.price'
                ];
                for (const sel of priceSelectors) {
                    const el = card.querySelector(sel);
                    if (el && el.innerText) {
                        const priceText = el.innerText.trim();
                        const match = priceText.match(/(\d+(?:\.\d+)?)/);
                        if (match) {
                            price = parseFloat(match[1]);
                            break;
                        }
                    }
                }
                
                if (price === 0) {
                    // Look for any number that looks like a price
                    const allText = card.innerText;
                    const matches = allText.match(/\$?(\d{2,3}(?:\.\d{2})?)/g);
                    if (matches && matches.length > 0) {
                        price = parseFloat(matches[0].replace('$', ''));
                    }
                }
                
                if (price > 0) {
                    results.push({
                        name: name.substring(0, 100),
                        pricePerNight: price,
                        currency: 'USD'
                    });
                }
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
        
        console.log(`✅ Data pushed to dataset`);
    }
});

await crawler.run([{ url: searchUrl }]);
console.log('🏁 Crawler finished');
await Actor.exit();