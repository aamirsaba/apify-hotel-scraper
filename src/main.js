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

const searchUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&group_adults=${guests}`;

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 1,
    
    requestHandler: async ({ page, request }) => {
        console.log(`📄 Loading page...`);
        
        await page.goto(request.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for results to load
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        // Take a screenshot to debug
        await page.screenshot({ path: 'booking-search.png' });
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[data-testid="property-card"]');
            
            // Currency conversion rates
            const rates = { 'OMR': 2.6, 'AED': 0.272, 'SAR': 0.266, 'USD': 1 };
            
            cards.forEach((card) => {
                // Get hotel name
                const nameEl = card.querySelector('[data-testid="title"]');
                const name = nameEl ? nameEl.innerText.trim() : '';
                if (!name) return;
                
                // Find the price per night - look for the element with OMR
                let pricePerNight = 0;
                let currency = 'USD';
                
                // Method 1: Look for OMR price (most accurate)
                const allText = card.innerText;
                const omrMatch = allText.match(/OMR\s*(\d+(?:\.\d+)?)/i);
                if (omrMatch) {
                    pricePerNight = parseFloat(omrMatch[1]) * 2.6; // Convert OMR to USD
                    currency = 'USD';
                    console.log(`Found OMR price: ${omrMatch[1]} OMR = $${pricePerNight}`);
                }
                
                // Method 2: If no OMR found, try price element
                if (pricePerNight === 0) {
                    const priceEl = card.querySelector('[data-testid="price-and-discounted-price"]');
                    if (priceEl) {
                        const priceText = priceEl.innerText.trim();
                        const match = priceText.match(/(\d+(?:\.\d+)?)/);
                        if (match) {
                            pricePerNight = parseFloat(match[1]);
                        }
                    }
                }
                
                // Only include hotels with reasonable prices ($30-$500)
                if (pricePerNight < 30 || pricePerNight > 500) return;
                
                // Get rating
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
        
        console.log(`✅ Found ${hotels.length} hotels with correct prices`);
        await Actor.pushData({ 
            city, checkin, checkout, guests, 
            hotels, totalHotels: hotels.length 
        });
    }
});

await crawler.run([{ url: searchUrl }]);
await Actor.exit();