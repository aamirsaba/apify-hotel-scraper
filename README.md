# Apify Hotel Scraper

Scrapes hotel data from Booking.com for a given city and dates.

## Input

- `city` (required): City name
- `checkin` (required): Check-in date (YYYY-MM-DD)
- `checkout` (required): Check-out date (YYYY-MM-DD)
- `guests` (optional): Number of guests (default: 2)

## Output

Returns hotel name, price, stars, rating, and booking URL.