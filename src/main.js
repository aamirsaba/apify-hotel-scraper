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
        
        // Wait a bit for dynamic content
        await new Promise(r => setTimeout(r, 5000));
        
        // Get all text content for debugging
        const pageText = await page.evaluate(() => document.body.innerText);
        console.log(`📄 Page contains "hotel": ${pageText.toLowerCase().includes('hotel')}`);
        console.log(`📄 Page contains "booking": ${pageText.toLowerCase().includes('booking')}`);
        
        // Try to find ANY hotel-like elements
        const hotels = await page.evaluate(() => {
            const results = [];
            
            // Look for ANY div that might contain hotel info
            const allDivs = document.querySelectorAll('div');
            const potentialHotels = [];
            
            for (const div of allDivs) {
                const text = div.innerText || '';
                if (text.includes('hotel') || text.includes('Hotel') || text.includes('night')) {
                    potentialHotels.push(div);
                }
            }
            
            console.log(`Found ${potentialHotels.length} potential hotel divs`);
            
            // Try to extract from the first few
            for (let i = 0; i < Math.min(10, potentialHotels.length); i++) {
                const div = potentialHotels[i];
                const text = div.innerText.substring(0, 500);
                
                // Look for price pattern
                const priceMatch = text.match(/\$?(\d{2,3}(?:\.\d{2})?)/);
                const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
                
                // Look for hotel name (often all caps or at start of line)
                const lines = text.split('\n');
                let name = lines[0]?.substring(0, 100) || 'Unknown Hotel';
                
                if (price > 0 && price < 1000) {
                    results.push({
                        name: name,
                        pricePerNight: price,
                        currency: 'USD'
                    });
                }
            }
            
            return results;
        });
        
        console.log(`✅ Found ${hotels.length} hotels`);
        
        // Also save the page HTML for debugging
        const html = await page.content();
        await Actor.setValue('debug.html', html);
        console.log(`💾 Saved page HTML to debug.html`);
        
        await Actor.pushData({
            city: city,
            totalHotels: hotels.length,
            hotels: hotels,
            timestamp: new Date().toISOString()
        });
    }
});

await crawler.run([{ url: searchUrl }]);
console.log('🏁 Crawler finished');
await Actor.exit();