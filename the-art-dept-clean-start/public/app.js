const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const artists = [];
let products = [];

const categories = ['All', 'Anime', 'Realism', 'Fantasy', 'Character Art', 'Logos', 'VTuber', 'Pets', 'Landscapes', 'Emotes'];
const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));
const connectedAccountStorageKey = 'theArtDeptConnectedAccountId';

let selectedCategory = 'All';
let selectedArtistId = 'open';
let artistApplications = [];
let orders = [];

const launchArtist = {
  id: 'open',
  name: 'Match me with an artist',
  handle: 'Founding artists opening soon',
  image: './assets/hero-market.svg',
  specialty: 'Send one request and The Art Dept can match it to artists posting on the marketplace.',
  bio: 'Artist profiles will come after listings are working smoothly. For now, customers can browse the Store or send one commission request and The Art Dept can help match it.',
  categories: ['Anime', 'Character Art', 'Fantasy', 'Realism', 'Logos', 'VTuber', 'Pets', 'Landscapes', 'Emotes'],
  tags: ['anime', 'character art', 'fantasy', 'realism', 'logos', 'vtuber', 'pets', 'landscapes', 'emotes'],
  base: 75,
  rating: 0,
  reviews: 0,
  responseHours: 24,
  availability: 'Applications open',
  packages: [['Starter sketch', 75], ['Full color illustration', 150], ['Larger custom project', 250]],
  reviewQuotes: []
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatMoney(value) {
  return money.format(Math.max(0, Number(value) || 0));
}

function feeParts(total) {
  const gross = Math.max(0, Number(total) || 0);
  const processor = gross * 0.029 + (gross > 0 ? 0.3 : 0);
  const platform = gross * 0.05;
  const artist = gross - processor - platform;
  return { gross, processor, platform, artist };
}

function icon(name) {
  return '<svg><use href="#' + name + '"></use></svg>';
}

function findArtist(artistId) {
  return artists.find((artist) => artist.id === artistId) || launchArtist;
}

function renderCategories() {
  qs('#categoryFilters').innerHTML = categories.map((category) => (
    '<button class="filter-chip' + (category === selectedCategory ? ' active' : '') + '" data-category="' + escapeHtml(category) + '">' +
      escapeHtml(category) +
    '</button>'
  )).join('');
}

function artistMatches(artist, query) {
  const searchText = [artist.name, artist.handle, artist.specialty, artist.bio, artist.categories.join(' '), artist.tags.join(' ')].join(' ').toLowerCase();
  return searchText.includes(query.toLowerCase());
}

function sortedArtists(list) {
  const sort = qs('#sortSelect').value;
  return list.slice().sort((a, b) => {
    if (sort === 'rating') return b.rating - a.rating;
    if (sort === 'price') return a.base - b.base;
    if (sort === 'fast') return a.responseHours - b.responseHours;
    return b.reviews + b.rating * 10 - (a.reviews + a.rating * 10);
  });
}

function renderArtists() {
  const query = qs('#globalSearch').value.trim();
  const filtered = artists.filter((artist) => {
    const categoryMatch = selectedCategory === 'All' || artist.categories.includes(selectedCategory);
    return categoryMatch && (!query || artistMatches(artist, query));
  });
  const list = sortedArtists(filtered);
  const emptyState = qs('#emptyState');
  emptyState.hidden = list.length > 0;
  emptyState.innerHTML = artists.length
    ? 'No matching artists yet. Try a broader search.'
    : '<strong>No public artist profiles yet.</strong><span>Artists can already post listings in the Store. Full profile pages can come next.</span>';
  qs('#artistGrid').innerHTML = list.map((artist) => (
    '<article class="artist-card">' +
      '<img src="' + artist.image + '" alt="' + escapeHtml(artist.name) + ' artwork sample" />' +
      '<div class="artist-card-body">' +
        '<div class="artist-title"><div><h3>' + escapeHtml(artist.name) + '</h3><span>' + escapeHtml(artist.handle) + '</span></div><span class="rating-pill">' + icon('i-star') + artist.rating.toFixed(1) + '</span></div>' +
        '<p>' + escapeHtml(artist.specialty) + '</p>' +
        '<div class="tag-row">' + artist.categories.slice(0, 3).map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('') + '</div>' +
        '<div class="card-meta"><span><strong>' + formatMoney(artist.base) + '</strong>starts at</span><span><strong>' + artist.responseHours + ' hr</strong>response</span></div>' +
        '<div class="card-actions"><button class="secondary" data-profile="' + artist.id + '">' + icon('i-user') + 'Profile</button><button class="primary" data-request="' + artist.id + '">' + icon('i-brush') + 'Request</button></div>' +
      '</div>' +
    '</article>'
  )).join('');
}

function renderProfile(artistId) {
  const artist = findArtist(artistId);
  selectedArtistId = artist.id;
  qs('#profileName').textContent = artist.name;
  qs('#profileImage').src = artist.image;
  qs('#profileImage').alt = artist.name + ' featured artwork';
  qs('#profileBio').textContent = artist.bio;
  qs('#profileFacts').innerHTML = [
    ['Availability', artist.availability],
    ['Response time', artists.length ? artist.responseHours + ' hours' : 'After signup'],
    ['Reviews', artists.length ? artist.reviews + ' reviews' : 'Not public yet'],
    ['Rating', artists.length ? artist.rating.toFixed(1) + ' out of 5' : 'Coming soon']
  ].map((row) => '<div class="fact-row"><span>' + escapeHtml(row[0]) + '</span><strong>' + escapeHtml(row[1]) + '</strong></div>').join('');
  qs('#profilePrices').innerHTML = artist.packages.map((row) => '<div class="price-row"><span>' + escapeHtml(row[0]) + '</span><strong>' + formatMoney(row[1]) + '</strong></div>').join('');
  qs('#profileReviews').innerHTML = artist.reviewQuotes.length
    ? artist.reviewQuotes.map((row) => '<div class="review-card"><strong>' + escapeHtml(row[0]) + '</strong><p>' + escapeHtml(row[1]) + '</p></div>').join('')
    : '<div class="review-card"><strong>No public reviews yet</strong><p>Real reviews will show after real commissions are completed.</p></div>';
  const gallery = artists.length
    ? [artist.image].concat(artists.filter((item) => item.id !== artist.id).slice(0, 2).map((item) => item.image))
    : [artist.image];
  qs('#profileGallery').innerHTML = gallery.map((src, index) => '<img src="' + src + '" alt="' + escapeHtml(artist.name) + ' gallery sample ' + (index + 1) + '" />').join('');
}

function renderProducts() {
  if (!products.length) {
    qs('#productGrid').innerHTML =
      '<article class="empty-card">' +
        '<h3>No listings posted yet</h3>' +
        '<p>When an artist publishes a listing, it will appear here automatically.</p>' +
        '<button class="primary" type="button" data-scroll="#post-listing">' + icon('i-plus') + 'Post the first listing</button>' +
      '</article>';
    return;
  }
  qs('#productGrid').innerHTML = products.map((product) => (
    '<article class="product-card">' +
      '<img src="' + product.image + '" alt="' + escapeHtml(product.title) + '" />' +
      '<div class="product-card-body">' +
        '<div class="product-title"><div><h3>' + escapeHtml(product.title) + '</h3><span>' + escapeHtml(product.artist) + '</span></div><strong>' + formatMoney(product.price) + '</strong></div>' +
        '<p>' + escapeHtml(product.description) + '</p>' +
        '<div class="tag-row"><span>' + escapeHtml(product.type) + '</span><span>' + escapeHtml(product.category) + '</span><span>' + escapeHtml(product.format) + '</span></div>' +
        (product.delivery ? '<p class="listing-note">' + escapeHtml(product.delivery) + '</p>' : '') +
        '<div class="card-actions"><a class="primary" href="' + escapeHtml(product.listingUrl) + '" target="_blank" rel="noopener">' + icon('i-cart') + 'Open listing</a><button class="secondary" type="button" data-listing-request="' + escapeHtml(product.id) + '">' + icon('i-brush') + 'Request similar</button></div>' +
      '</div>' +
    '</article>'
  )).join('');
}

function populateArtistSelect() {
  qs('#artistSelect').innerHTML = artists.length
    ? artists.map((artist) => '<option value="' + artist.id + '">' + escapeHtml(artist.name) + ' - from ' + formatMoney(artist.base) + '</option>').join('')
    : '<option value="open">Match me with an artist</option>';
  qs('#artistSelect').value = selectedArtistId;
}

function currentQuote() {
  const artist = findArtist(qs('#artistSelect').value);
  const multipliers = { sketch: 1, color: 2, sheet: 3.2, vtuber: 5.6, emote: 1.8, logo: 2.1 };
  const type = qs('#commissionType').value;
  const budget = Number(qs('#budgetInput').value) || 0;
  const commercial = qs('#usageSelect').value === 'commercial' ? 90 : 0;
  const rush = qs('#rushInput').checked ? 60 : 0;
  const estimate = Math.round(artist.base * multipliers[type] + commercial + rush);
  return Math.max(estimate, budget);
}

function updateQuote() {
  const parts = feeParts(currentQuote());
  qs('#quoteTotal').textContent = formatMoney(parts.gross);
  qs('#processorFee').textContent = formatMoney(parts.processor);
  qs('#platformFee').textContent = formatMoney(parts.platform);
  qs('#artistPayout').textContent = formatMoney(parts.artist);
}

function renderFeeCalculator() {
  const parts = feeParts(Number(qs('#feeAmount').value) || 0);
  qs('#saleAmount').textContent = formatMoney(parts.gross);
  qs('#calcProcessor').textContent = formatMoney(parts.processor);
  qs('#calcPlatform').textContent = formatMoney(parts.platform);
  qs('#calcArtist').textContent = formatMoney(parts.artist);
}

function renderDashboard() {
  const volume = orders.reduce((sum, order) => sum + order[4], 0);
  const platform = feeParts(volume).platform;
  const metrics = [
    ['Gross requests', formatMoney(volume)],
    ['Platform 5%', formatMoney(platform)],
    ['Open orders', String(orders.length)],
    ['Public listings', String(products.length)]
  ];
  qs('#metricGrid').innerHTML = metrics.map((row) => '<div class="metric-card"><span>' + row[0] + '</span><strong>' + row[1] + '</strong></div>').join('');
  qs('#ordersTable').innerHTML = orders.length
    ? orders.map((order) => (
      '<tr><td>' + escapeHtml(order[0]) + '</td><td>' + escapeHtml(order[1]) + '</td><td>' + escapeHtml(order[2]) + '</td><td><span class="status-pill">' + escapeHtml(order[3]) + '</span></td><td>' + formatMoney(order[4]) + '</td></tr>'
    )).join('')
    : '<tr><td colspan="5" class="muted">No commission requests yet. New customer requests will appear in Netlify Forms.</td></tr>';
  qs('#listingHealth').innerHTML = artists.length
    ? artists.slice(0, 4).map((artist) => '<div class="listing-row"><span>' + escapeHtml(artist.name) + '</span><strong>' + escapeHtml(artist.availability) + '</strong></div>').join('')
    : '<div class="listing-row"><span>Public listings</span><strong>' + products.length + ' live</strong></div><p class="muted">Artists can publish listing cards directly from the Post section.</p>';
}

function renderApplications() {
  const list = qs('#applicationsList');
  if (!list) return;
  list.innerHTML = artistApplications.length
    ? artistApplications.map((application) => (
        '<div class="application-card"><div><strong>' + escapeHtml(application[0]) + '</strong><span>' + escapeHtml(application[1]) + ' from ' + formatMoney(application[2]) + '</span></div><em>' + escapeHtml(application[3]) + '</em></div>'
      )).join('')
    : '<p class="muted">No applications yet.</p>';
}

async function fetchJson(path, options, fallbackMessage) {
  const response = await fetch(path, options || {});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallbackMessage || 'Request failed.');
  return data;
}

async function callFunction(path, payload) {
  return fetchJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  }, 'Request failed.');
}

function updateListingCount() {
  const count = qs('#publicListingCount');
  if (count) count.textContent = String(products.length);
}

async function loadListings() {
  try {
    const data = await fetchJson('/.netlify/functions/listings', {}, 'Listings could not load.');
    products = Array.isArray(data.listings) ? data.listings : [];
    renderProducts();
    renderDashboard();
    updateListingCount();
  } catch (error) {
    renderProducts();
    showToast('Listings will load after Netlify finishes the new deploy.');
  }
}

async function publishListing(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = qs('#publishListingButton');
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.rightsConfirmed = qs('#listingRights').checked;

  try {
    button.disabled = true;
    button.textContent = 'Publishing...';
    const data = await callFunction('/.netlify/functions/listings', payload);
    products = [data.listing].concat(products);
    form.reset();
    renderProducts();
    renderDashboard();
    updateListingCount();
    qs('#store').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Listing published.');
  } catch (error) {
    showToast(error.message || 'Listing could not be published.');
  } finally {
    button.disabled = false;
    button.innerHTML = icon('i-send') + 'Publish listing';
  }
}

function getSavedConnectedAccountId() {
  try {
    return window.localStorage.getItem(connectedAccountStorageKey) || '';
  } catch (error) {
    return '';
  }
}

function saveConnectedAccountId(accountId) {
  if (!accountId) return;
  try {
    window.localStorage.setItem(connectedAccountStorageKey, accountId);
  } catch (error) {
    return;
  }
}

function clearConnectedAccountId() {
  try {
    window.localStorage.removeItem(connectedAccountStorageKey);
  } catch (error) {
    return;
  }
}

function setStripeStatus(text, state) {
  const card = qs('#stripeStatusCard');
  const target = qs('#stripeStatusText');
  if (!card || !target) return;
  target.textContent = text;
  card.classList.toggle('ready', state === 'ready');
  card.classList.toggle('warning', state !== 'ready');
}

function prefillStripeFields() {
  const name = qs('#stripeArtistName');
  const email = qs('#stripeArtistEmail');
  if (name && !name.value && qs('#applicantName')) name.value = qs('#applicantName').value;
  if (email && !email.value && qs('#applicantEmail')) email.value = qs('#applicantEmail').value;
}

async function startStripeOnboarding() {
  prefillStripeFields();
  const displayName = qs('#stripeArtistName').value.trim();
  const email = qs('#stripeArtistEmail').value.trim();
  if (!displayName || !email) {
    showToast('Add an artist name and email first.');
    return;
  }

  try {
    setStripeStatus('Creating Stripe onboarding link...', 'warning');
    const data = await callFunction('/.netlify/functions/create-connect-account', {
      displayName,
      email
    });
    saveConnectedAccountId(data.accountId);
    window.location.href = data.onboardingUrl;
  } catch (error) {
    setStripeStatus('Stripe Connect needs one more setup step before artists can onboard.', 'warning');
    showToast('Finish Stripe Connect setup in your Stripe dashboard.');
  }
}

async function checkStripeStatus() {
  const accountId = getSavedConnectedAccountId();
  if (!accountId) {
    setStripeStatus('No connected artist account is saved yet.', 'warning');
    showToast('Start Stripe onboarding first.');
    return;
  }

  try {
    const data = await callFunction('/.netlify/functions/connect-status', { accountId });
    if (data.ready) {
      setStripeStatus('Stripe is ready for checkout. Saved account: ' + accountId, 'ready');
      showToast('Stripe account is ready.');
    } else {
      setStripeStatus('Stripe onboarding is not finished yet. Saved account: ' + accountId, 'warning');
      showToast('Stripe still needs onboarding.');
    }
  } catch (error) {
    setStripeStatus('Stripe could not check that saved account. Clear it and try onboarding again.', 'warning');
    showToast('Stripe could not check the saved account.');
  }
}

async function startCommissionCheckout() {
  const accountId = getSavedConnectedAccountId();
  if (!accountId) {
    qs('#artist-signup').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Start artist Stripe onboarding first.');
    return;
  }

  const artist = findArtist(qs('#artistSelect').value);
  const deposit = Math.max(0.5, Math.round(currentQuote() * 0.3 * 100) / 100);

  try {
    const data = await callFunction('/.netlify/functions/create-checkout-session', {
      connectedAccountId: accountId,
      artistName: artist.name,
      customerEmail: qs('#clientEmail') ? qs('#clientEmail').value.trim() : '',
      amount: deposit
    });
    window.location.href = data.url;
  } catch (error) {
    showToast('Stripe checkout is not ready yet. Check artist payout setup first.');
  }
}

function renderMessages() {
  const seed = [
    ['artist', 'Thanks for the brief. I can start with thumbnail sketches after the deposit.'],
    ['customer', 'Great. I added the color notes and deadline.'],
    ['artist', 'Perfect. I will send two composition options first.']
  ];
  qs('#messageList').innerHTML = seed.map((row) => '<div class="message ' + (row[0] === 'customer' ? 'customer' : '') + '">' + escapeHtml(row[1]) + '</div>').join('');
}

function showToast(text) {
  const toast = qs('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function requestArtist(artistId) {
  const artist = findArtist(artistId);
  selectedArtistId = artist.id;
  qs('#artistSelect').value = artist.id;
  renderProfile(artist.id);
  updateQuote();
  qs('#request').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function requestListing(listingId) {
  const listing = products.find((product) => product.id === listingId);
  if (!listing) return;
  qs('#briefInput').value = 'I am interested in this listing: ' + listing.title + ' by ' + listing.artist + '. ' + listing.description;
  qs('#referenceLink').value = listing.image;
  qs('#budgetInput').value = listing.price;
  qs('#budgetRange').value = Math.min(800, Math.max(40, Number(listing.price) || 40));
  updateQuote();
  qs('#request').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Commission form filled from that listing.');
}

function setDefaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 21);
  qs('#deadlineInput').value = date.toISOString().slice(0, 10);
}

function bindEvents() {
  qs('#categoryFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    selectedCategory = button.dataset.category;
    renderCategories();
    renderArtists();
  });

  qs('#artistGrid').addEventListener('click', (event) => {
    const profile = event.target.closest('[data-profile]');
    const request = event.target.closest('[data-request]');
    if (profile) {
      renderProfile(profile.dataset.profile);
      qs('#profiles').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (request) requestArtist(request.dataset.request);
  });

  qs('#productGrid').addEventListener('click', (event) => {
    const scroll = event.target.closest('[data-scroll]');
    const request = event.target.closest('[data-listing-request]');
    if (scroll) qs(scroll.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (request) requestListing(request.dataset.listingRequest);
  });

  qsa('[data-scroll]').forEach((button) => {
    button.addEventListener('click', () => qs(button.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });

  qs('#profileRequestButton').addEventListener('click', () => requestArtist(selectedArtistId));
  qs('#globalSearch').addEventListener('input', renderArtists);
  qs('#sortSelect').addEventListener('change', renderArtists);
  ['artistSelect', 'commissionType', 'usageSelect', 'rushInput'].forEach((id) => qs('#' + id).addEventListener('change', updateQuote));
  qs('#budgetRange').addEventListener('input', (event) => {
    qs('#budgetInput').value = event.target.value;
    updateQuote();
  });
  qs('#budgetInput').addEventListener('input', (event) => {
    const value = Math.min(800, Math.max(40, Number(event.target.value) || 40));
    qs('#budgetRange').value = value;
    updateQuote();
  });
  qs('#feeAmount').addEventListener('input', renderFeeCalculator);

  qs('#listingForm').addEventListener('submit', publishListing);

  const startStripeButton = qs('#startStripeOnboardingButton');
  if (startStripeButton) startStripeButton.addEventListener('click', startStripeOnboarding);

  const checkStripeButton = qs('#checkStripeStatusButton');
  if (checkStripeButton) checkStripeButton.addEventListener('click', checkStripeStatus);

  const clearStripeButton = qs('#clearStripeAccountButton');
  if (clearStripeButton) {
    clearStripeButton.addEventListener('click', () => {
      clearConnectedAccountId();
      setStripeStatus('Saved Stripe account cleared.', 'warning');
      showToast('Saved Stripe account cleared.');
    });
  }

  qs('#depositButton').addEventListener('click', startCommissionCheckout);
  qs('#sendMessageButton').addEventListener('click', () => {
    const input = qs('#messageInput');
    const text = input.value.trim();
    if (!text) return;
    qs('#messageList').insertAdjacentHTML('beforeend', '<div class="message customer">' + escapeHtml(text) + '</div>');
    input.value = '';
    qs('#messageList').scrollTop = qs('#messageList').scrollHeight;
  });
  qs('#addListingButton').addEventListener('click', () => qs('#post-listing').scrollIntoView({ behavior: 'smooth', block: 'start' }));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      qsa('.nav-links a').forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
      });
    });
  }, { rootMargin: '-30% 0px -62% 0px', threshold: 0 });
  qsa('main section[id]').forEach((section) => observer.observe(section));
}

function init() {
  renderCategories();
  renderArtists();
  renderProfile(selectedArtistId);
  renderProducts();
  populateArtistSelect();
  setDefaultDeadline();
  updateQuote();
  renderFeeCalculator();
  renderDashboard();
  renderApplications();
  renderMessages();
  bindEvents();
  loadListings();
  if (getSavedConnectedAccountId()) {
    setStripeStatus('Saved Stripe account found. Check status before checkout.', 'warning');
  }
}

init();
