import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

// Create proxy configuration with residential proxies
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
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
    proxyConfiguration,
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for results to load
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        // Scroll down to load more hotels
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 500;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight || totalHeight > 5000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
        
        // Wait a bit after scrolling
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            console.log(`Found ${cards.length} hotel cards on page`);
            
            cards.forEach((card) => {
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                if (!name) return;
                
                // Try multiple price selectors
                let pricePerNight = 0;
                const priceSelectors = [
                    '[data-testid="price-and-discounted-price"]',
                    '[data-testid="total-price"]',
                    '.prco-valign-middle-helper'
                ];
                
                for (const selector of priceSelectors) {
                    const priceEl = card.querySelector(selector);
                    if (priceEl) {
                        const priceText = priceEl.innerText.trim();
                        const match = priceText.match(/(\d+(?:\.\d+)?)/);
                        if (match) {
                            pricePerNight = parseFloat(match[1]);
                            break;
                        }
                    }
                }
                
                // Accept wider price range
                if (pricePerNight < 20 || pricePerNight > 5000) return;
                
                // Get rating
                const ratingEl = card.querySelector('[data-testid="rating-score"]');
                const rating = ratingEl ? parseFloat(ratingEl.innerText) : 0;
                
                // Get star rating
                let stars = 0;
                const starsEl = card.querySelector('[data-testid="rating-stars"]');
                if (starsEl) {
                    stars = (starsEl.innerText.match(/★/g) || []).length;
                }
                
                results.push({
                    name: name.substring(0, 100),
                    pricePerNight: Math.round(pricePerNight),
                    rating: rating,
                    stars: stars,
                    currency: 'USD'
                });
            });
            
            return results;
        });
        
        console.log(`✅ Found ${hotels.length} hotels in ${city}`);
        console.log(`📊 Hotel names: ${hotels.map(h => h.name).join(', ')}`);
        
        await Actor.pushData({ 
            city, 
            checkin,
            checkout,
            guests,
            hotels: hotels,
            totalHotels: hotels.length,
            timestamp: new Date().toISOString()
        });
    }
});

await crawler.run([{ url: searchUrl }]);
console.log('🏁 Crawler finished');
await Actor.exit();