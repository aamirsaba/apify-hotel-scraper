import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();

if (!input?.city) throw new Error('Missing required: city');
if (!input?.checkin) throw new Error('Missing required: checkin');
if (!input?.checkout) throw new Error('Missing required: checkout');

const city = input.city;
const checkin = input.checkin;
const checkout = input.checkout;
const guests = input.guests || 2;

console.log(`🔍 Searching hotels in ${city}`);

const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    useApifyProxy: true,
});

// Force USD currency in the URL
const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}&selected_currency=USD`;

console.log(`🌐 URL: ${searchUrl}`);

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
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                if (!name) return;
                
                // Find price element
                const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                if (!priceEl) return;
                
                let priceText = priceEl.innerText.trim();
                let pricePerNight = 0;
                
                // Look for USD pattern
                const usdMatch = priceText.match(/US\$\s*(\d+(?:\.\d+)?)/);
                if (usdMatch) {
                    pricePerNight = parseFloat(usdMatch[1]);
                } else {
                    // Just get any number
                    const match = priceText.match(/(\d+(?:\.\d+)?)/);
                    if (match) {
                        pricePerNight = parseFloat(match[1]);
                    }
                }
                
                // Filter reasonable prices ($30-$500 per night)
                if (pricePerNight < 30 || pricePerNight > 500) return;
                
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
        
        console.log(`✅ Found ${hotels.length} hotels with USD prices`);
        await Actor.pushData({ 
            city, checkin, checkout, guests, 
            hotels, totalHotels: hotels.length 
        });
    }
});

await crawler.run([{ url: searchUrl }]);
await Actor.exit();