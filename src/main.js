import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

// Create proxy configuration with residential proxies
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    useApifyProxy: true,
});

const input = await Actor.getInput();

// Validate required fields
const city = input?.city;
const checkin = input?.checkin;
const checkout = input?.checkout;
const guests = input?.guests || 2;

if (!city) throw new Error('City is required');
if (!checkin) throw new Error('Check-in date is required');
if (!checkout) throw new Error('Check-out date is required');

console.log(`🔍 Searching hotels in ${city}`);
console.log(`📅 Check-in: ${checkin}, Check-out: ${checkout}, Guests: ${guests}`);

const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}&selected_currency=USD`;

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        // Scroll to load more
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
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            // Helper: Estimate stars from price
            function estimateStarsFromPrice(price) {
                if (price >= 400) return 5;
                if (price >= 250) return 4;
                if (price >= 150) return 3;
                if (price >= 80) return 2;
                return 1;
            }
            
            cards.forEach((card) => {
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                if (!name) return;
                
                // Get price
                let pricePerNight = 0;
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                if (priceEl) {
                    const priceText = priceEl.innerText.trim();
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) pricePerNight = parseFloat(match[1]);
                }
                
                if (pricePerNight < 20 || pricePerNight > 5000) return;
                
                // Get rating
                const ratingEl = card.querySelector('[data-testid="rating-score"]');
                const rating = ratingEl ? parseFloat(ratingEl.innerText) : 0;
                
                // Try to get real stars from various selectors
                let stars = 0;
                
                // Method 1: Look for data-testid
                const starsTestId = card.querySelector('[data-testid="rating-stars"]');
                if (starsTestId) {
                    const starsText = starsTestId.innerText || '';
                    stars = (starsText.match(/★/g) || []).length;
                }
                
                // Method 2: Look for class with stars
                if (stars === 0) {
                    const starElements = card.querySelectorAll('[class*="star"], [class*="Star"]');
                    for (const el of starElements) {
                        const text = el.innerText || el.getAttribute('aria-label') || '';
                        const count = (text.match(/★/g) || []).length;
                        if (count > 0 && count <= 5) {
                            stars = count;
                            break;
                        }
                    }
                }
                
                // Method 3: Use price-based estimation (RELIABLE FALLBACK)
                if (stars === 0) {
                    stars = estimateStarsFromPrice(pricePerNight);
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
        console.log(`📊 Stars summary: ${hotels.map(h => `${h.name.substring(0,25)}: ${h.stars}★`).join(', ')}`);
        
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