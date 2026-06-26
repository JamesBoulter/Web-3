async function getListingStore() {
  const blobs = await import('@netlify/blobs');
  const siteID =
    process.env.NETLIFY_BLOBS_SITE_ID ||
    process.env.NETLIFY_SITE_ID ||
    process.env.SITE_ID;
  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.NETLIFY_TOKEN;

  if (siteID && token) {
    return blobs.getStore('artist-listings', { siteID, token });
  }

  return blobs.getStore('artist-listings');
}

function listingStoreErrorMessage(error) {
  const message = error && error.message ? error.message : '';
  if (/not been configured|siteID|token|Netlify Blobs/i.test(message)) {
    return 'Netlify Blobs needs setup. Add NETLIFY_BLOBS_SITE_ID and NETLIFY_BLOBS_TOKEN in Netlify environment variables, then redeploy.';
  }
  return 'Listings storage is not ready yet. Check the Netlify deploy and environment variables.';
}

module.exports = {
  getListingStore,
  listingStoreErrorMessage
};
