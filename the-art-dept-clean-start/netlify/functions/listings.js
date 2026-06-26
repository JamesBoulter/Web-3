const { randomUUID } = require('crypto');

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
}

async function getStore() {
  const blobs = await import('@netlify/blobs');
  return blobs.getStore('artist-listings');
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    const badJson = new Error('The listing could not be read. Please try again.');
    badJson.statusCode = 400;
    throw badJson;
  }
}

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanUrl(value, label) {
  const text = cleanText(value, 500);
  if (!text) {
    const error = new Error(label + ' is required.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Unsupported URL');
    return url.toString();
  } catch (error) {
    const invalid = new Error(label + ' must be a full link that starts with http:// or https://.');
    invalid.statusCode = 400;
    throw invalid;
  }
}

function requireText(value, label, maxLength) {
  const text = cleanText(value, maxLength);
  if (!text) {
    const error = new Error(label + ' is required.');
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function listingFromBody(body) {
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 1 || price > 100000) {
    const error = new Error('Price must be between $1 and $100,000.');
    error.statusCode = 400;
    throw error;
  }

  if (body.rightsConfirmed !== true) {
    const error = new Error('Artists must confirm they own or have permission to sell the artwork.');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    createdAt: now,
    artist: requireText(body.artist, 'Artist name', 90),
    email: requireText(body.email, 'Artist email', 160),
    title: requireText(body.title, 'Listing title', 120),
    type: requireText(body.type, 'Listing type', 60),
    category: requireText(body.category, 'Category', 60),
    format: requireText(body.format, 'Format', 60),
    price: Math.round(price * 100) / 100,
    description: requireText(body.description, 'Description', 700),
    image: cleanUrl(body.image, 'Image link'),
    listingUrl: cleanUrl(body.listingUrl, 'Buy or contact link'),
    delivery: cleanText(body.delivery, 220)
  };
}

function publicListing(listing) {
  return {
    id: listing.id,
    createdAt: listing.createdAt,
    artist: listing.artist,
    title: listing.title,
    type: listing.type,
    category: listing.category,
    format: listing.format,
    price: listing.price,
    description: listing.description,
    image: listing.image,
    listingUrl: listing.listingUrl,
    delivery: listing.delivery
  };
}

async function listListings() {
  const store = await getStore();
  const result = await store.list();
  const blobs = result && Array.isArray(result.blobs) ? result.blobs : [];
  const keys = blobs.map((blob) => blob.key).filter((key) => key && key.startsWith('listing-'));
  const listings = await Promise.all(keys.map((key) => store.get(key, { type: 'json' }).catch(() => null)));
  return listings
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(publicListing)
    .slice(0, 100);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const listings = await listListings();
      return json(200, { listings });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const listing = listingFromBody(body);
      const store = await getStore();
      await store.setJSON('listing-' + listing.id, listing);
      return json(200, { listing: publicListing(listing) });
    }

    return json(405, { error: 'Use GET or POST.' });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 500, {
      error: error.message || 'The listing could not be saved.'
    });
  }
};
