import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));
let autoRefreshRunning = false;
const pendingVerificationKey = 'theArtDept.pendingVerificationEmail';

const state = {
  config: null,
  supabase: null,
  session: null,
  profile: null,
  artistProfile: null,
  payoutAccount: null,
  profiles: [],
  artistProfiles: [],
  portfolio: [],
  listings: [],
  orders: [],
  requests: [],
  reviews: [],
  reports: [],
  supportTickets: [],
  view: new URLSearchParams(location.search).get('view') || 'home',
  dashboardTab: 'overview',
  authMode: 'signin',
  authBusy: false,
  editingListingId: null,
  search: '',
  category: 'All'
};

const categories = ['All', 'Anime', 'Character Art', 'Fantasy', 'Realism', 'Logos', 'VTuber', 'Pets', 'Landscapes', 'Emotes'];

function icon(name) {
  return '<svg><use href="#' + name + '"></use></svg>';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatMoney(cents) {
  return money.format(Math.max(0, Number(cents) || 0) / 100);
}

function slug(value) {
  return String(value || 'file').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
}

function showToast(text) {
  const toast = qs('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function authRedirectUrl(mode = 'verified') {
  return location.origin + location.pathname + '?auth=' + encodeURIComponent(mode);
}

function setAuthBusy(isBusy) {
  state.authBusy = isBusy;
  const submit = qs('#authSubmitButton');
  if (submit) submit.disabled = isBusy;
  qsa('[data-auth-mode]').forEach((button) => button.disabled = isBusy);
  const label = qs('#authSubmitLabel');
  if (!label) return;
  if (isBusy) {
    label.textContent = state.authMode === 'signup' ? 'Creating account...' : 'Signing in...';
  } else {
    label.textContent = state.authMode === 'signup' ? 'Create account' : 'Sign in';
  }
}

function showVerificationDialog(mode, email) {
  const dialog = qs('#verifyDialog');
  if (!dialog) return;
  dialog.dataset.mode = mode;
  dialog.dataset.email = email || '';

  const safeEmail = email || 'your email';
  const isVerified = mode === 'verified';
  const isReset = mode === 'reset-sent';
  qs('#verifyEyebrow').textContent = isVerified ? 'Email verified' : isReset ? 'Password reset' : 'Email verification';
  qs('#verifyTitle').textContent = isVerified ? 'You may now sign in' : isReset ? 'Check your email' : 'Please verify your email';
  qs('#verifyMessage').textContent = isVerified
    ? 'Your email is confirmed. Close this message or press Sign in to continue.'
    : isReset
      ? 'We sent a password reset link to ' + safeEmail + '. Open that email to choose a new password.'
      : 'We sent a confirmation link to ' + safeEmail + '. Open that email before signing in.';
  qs('#verifyPrimary').textContent = isVerified ? 'Sign in' : 'Back to sign in';
  qs('#verifyResend').hidden = isVerified || isReset;

  if (dialog.open) dialog.close();
  dialog.showModal();
}

function showResetPasswordDialog() {
  ['#authDialog', '#verifyDialog'].forEach((selector) => {
    const dialog = qs(selector);
    if (dialog && dialog.open) dialog.close();
  });
  qs('#newPassword').value = '';
  qs('#confirmPassword').value = '';
  qs('#resetDialog').showModal();
}

function cleanAuthUrl() {
  if (history.replaceState) history.replaceState({}, document.title, location.pathname);
}

function profileFor(id) {
  return state.profiles.find((profile) => profile.id === id) || null;
}

function artistProfileFor(id) {
  return state.artistProfiles.find((profile) => profile.user_id === id) || {};
}

function portfolioFor(id) {
  return state.portfolio
    .filter((item) => item.artist_id === id)
    .sort((a, b) => {
      if (!!b.is_featured !== !!a.is_featured) return Number(!!b.is_featured) - Number(!!a.is_featured);
      return Number(a.sort_order || 0) - Number(b.sort_order || 0) || new Date(b.created_at) - new Date(a.created_at);
    });
}

function listingsForArtist(id) {
  return state.listings.filter((listing) => listing.artist_id === id && listing.status === 'active');
}

function allListingsForArtist(id) {
  return state.listings.filter((listing) => listing.artist_id === id);
}

function listingFor(id) {
  return state.listings.find((listing) => listing.id === id) || null;
}

function requestFor(id) {
  return state.requests.find((request) => request.id === id) || null;
}

function artistName(id) {
  const profile = profileFor(id);
  return profile ? profile.display_name : 'Artist';
}

function isDigitalListing(listing) {
  if (!listing) return false;
  const text = [listing.format, listing.listing_type].join(' ').toLowerCase();
  return text.includes('digital') || text.includes('download') || text.includes('emote') || text.includes('logo');
}

function reviewsForArtist(id) {
  return state.reviews.filter((review) => review.artist_id === id);
}

function reviewForOrder(id) {
  return state.reviews.find((review) => review.order_id === id) || null;
}

function ratingSummary(id) {
  const reviews = reviewsForArtist(id);
  if (!reviews.length) return { average: 0, count: 0 };
  const average = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
  return { average, count: reviews.length };
}

function ratingText(id) {
  const rating = ratingSummary(id);
  return rating.count ? rating.average.toFixed(1) + ' stars (' + rating.count + ')' : 'No reviews yet';
}

function artistProfileLink(id) {
  return location.origin + location.pathname + '?artist=' + encodeURIComponent(id);
}

function artistCompletionItems() {
  if (!state.profile || state.profile.role !== 'artist') return [];
  const artist = state.artistProfile || {};
  const mine = portfolioFor(state.profile.id);
  const listings = state.listings.filter((listing) => listing.artist_id === state.profile.id && listing.status !== 'removed');
  return [
    { label: 'Add profile image', done: !!artist.profile_image_url, tab: 'profile' },
    { label: 'Add banner image', done: !!artist.banner_image_url, tab: 'profile' },
    { label: 'Write a useful bio', done: !!(artist.bio && artist.bio.trim().length >= 40), tab: 'profile' },
    { label: 'Choose categories', done: !!(artist.categories && artist.categories.length), tab: 'profile' },
    { label: 'Upload 3 portfolio pieces', done: mine.length >= 3, tab: 'portfolio' },
    { label: 'Connect Stripe payouts', done: isArtistReady(state.payoutAccount), tab: 'payouts' },
    { label: 'Post your first listing', done: !!listings.length, tab: 'listings' }
  ];
}

function completionPercent(items) {
  if (!items.length) return 0;
  return Math.round((items.filter((item) => item.done).length / items.length) * 100);
}

function eligibleReviewOrdersForArtist(artistId) {
  if (!state.profile) return [];
  return state.orders.filter((order) =>
    order.customer_id === state.profile.id &&
    order.artist_id === artistId &&
    (order.status === 'paid' || order.status === 'fulfilled') &&
    !reviewForOrder(order.id)
  );
}

function canManageListing(listing) {
  return !!(state.profile && listing && listing.artist_id === state.profile.id);
}

function isArtistReady(profile) {
  return !!(profile && profile.stripe_payouts_enabled && profile.stripe_charges_enabled && profile.stripe_details_submitted);
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.session && state.session.access_token) {
    headers.Authorization = 'Bearer ' + state.session.access_token;
  }
  return headers;
}

async function callFunction(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function loadConfig() {
  const response = await fetch('/.netlify/functions/config');
  state.config = await response.json();
  if (!state.config.supabaseUrl || !state.config.supabaseAnonKey) return;
  state.supabase = createClient(state.config.supabaseUrl, state.config.supabaseAnonKey);
  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
}

async function ensureOwnProfile() {
  if (!state.session) return;
  const user = state.session.user;
  const role = user.user_metadata && user.user_metadata.role === 'artist' ? 'artist' : 'customer';
  const displayName = (user.user_metadata && user.user_metadata.display_name) || user.email.split('@')[0];

  const { data } = await state.supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!data) {
    await state.supabase.from('profiles').insert({
      id: user.id,
      email: user.email,
      display_name: displayName,
      role
    });
    if (role === 'artist') {
      await state.supabase.from('artist_profiles').insert({
        user_id: user.id,
        handle: slug(displayName)
      });
    }
  }
}

async function loadProfile() {
  state.profile = null;
  state.artistProfile = null;
  state.payoutAccount = null;
  if (!state.session) return;

  await ensureOwnProfile();
  const { data: profile } = await state.supabase.from('profiles').select('*').eq('id', state.session.user.id).maybeSingle();
  state.profile = profile || null;

  if (profile && (profile.role === 'artist' || profile.role === 'admin')) {
    const [{ data: artistProfile }, { data: payoutAccount }] = await Promise.all([
      state.supabase.from('artist_profiles').select('*').eq('user_id', profile.id).maybeSingle(),
      state.supabase.from('artist_payout_accounts').select('*').eq('user_id', profile.id).maybeSingle()
    ]);
    state.artistProfile = artistProfile || null;
    state.payoutAccount = payoutAccount || null;
  }
}

async function loadPublicData() {
  if (!state.supabase) return;
  const [profiles, artistProfiles, portfolio, listings, reviews] = await Promise.all([
    state.supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    state.supabase.from('artist_profiles').select('*'),
    state.supabase.from('portfolio_items').select('*').order('created_at', { ascending: false }),
    state.supabase.from('listings').select('*').order('created_at', { ascending: false }),
    state.supabase.from('reviews').select('*').order('created_at', { ascending: false })
  ]);

  state.profiles = profiles.data || [];
  state.artistProfiles = artistProfiles.data || [];
  state.portfolio = portfolio.data || [];
  state.listings = listings.data || [];
  state.reviews = reviews.data || [];
}

async function loadPrivateData() {
  state.orders = [];
  state.requests = [];
  state.reports = [];
  state.supportTickets = [];
  if (!state.supabase || !state.profile) return;

  const tasks = [
    state.supabase.from('orders').select('*').order('created_at', { ascending: false }),
    state.supabase.from('commission_requests').select('*').order('created_at', { ascending: false })
  ];

  if (state.profile.role === 'admin') {
    tasks.push(state.supabase.from('reports').select('*').order('created_at', { ascending: false }));
    tasks.push(state.supabase.from('support_tickets').select('*').order('created_at', { ascending: false }));
  }

  const [orders, requests, reports, supportTickets] = await Promise.all(tasks);
  state.orders = orders.data || [];
  state.requests = requests.data || [];
  state.reports = reports ? reports.data || [] : [];
  state.supportTickets = supportTickets ? supportTickets.data || [] : [];
}

async function refreshAll() {
  if (!state.supabase) {
    render();
    return;
  }
  await loadProfile();
  await loadPublicData();
  await loadPrivateData();
  render();
}

function updateTopbar() {
  const dashboardButton = qs('#dashboardNavButton');
  if (dashboardButton) dashboardButton.hidden = true;
  qsa('.main-nav button').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));

  const actions = qs('#accountActions');
  if (!state.profile) {
    actions.innerHTML = '<button class="primary" data-auth-open="signin">' + icon('i-user') + 'Account</button>';
    return;
  }

  actions.innerHTML = `
    <details class="account-menu">
      <summary>${icon('i-user')}<span>${escapeHtml(state.profile.display_name)}</span></summary>
      <div class="account-dropdown">
        <button data-view="dashboard">${icon('i-chart')}Dashboard</button>
        <button data-sign-out>${icon('i-logout')}Sign out</button>
      </div>
    </details>
  `;
}

function renderSetupMissing() {
  return `
    <section class="section-band">
      <p class="eyebrow">Setup needed</p>
      <h1>The Art Department V3</h1>
      <p class="lede">Supabase is not connected yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in Netlify, then redeploy.</p>
    </section>
  `;
}

function renderHome() {
  const activeListings = state.listings.filter((item) => item.status === 'active');
  const artistCount = state.profiles.filter((profile) => profile.role === 'artist').length;
  const paidOrders = state.orders.filter((order) => order.status === 'paid');
  const latest = activeListings.slice(0, 3);

  return `
    <section class="hero-band" id="home">
      <div class="hero-copy">
        <p class="eyebrow">Custom art marketplace</p>
        <h1>The Art Department</h1>
        <p class="lede">Browse portfolios, buy artist listings, request custom commissions, and give artists their own dashboard without exposing admin analytics.</p>
        <div class="hero-actions">
          <button class="primary" data-view="store">${icon('i-card')}Shop art</button>
          <button class="secondary" data-view="artists">${icon('i-search')}Find artists</button>
          ${state.profile ? '<button class="secondary" data-view="dashboard">' + icon('i-user') + 'Open dashboard</button>' : '<button class="secondary" data-auth-open="signup">' + icon('i-user') + 'Join</button>'}
        </div>
        <div class="stat-row">
          <span><strong>${activeListings.length}</strong>live listings</span>
          <span><strong>${artistCount}</strong>artists</span>
          <span><strong>${paidOrders.length}</strong>paid orders</span>
          <span><strong>${state.config ? state.config.platformFeePercent : 5}%</strong>platform fee</span>
        </div>
      </div>
      <div class="hero-visual">
        <img src="./assets/hero-market.svg" alt="The Art Department marketplace preview" />
        <div class="quick-ticket"><span>Role-aware app</span><strong>Customers, artists, admin</strong><small>Separate dashboards</small></div>
      </div>
    </section>
    <section class="section-band">
      <div class="section-head"><div><p class="eyebrow">New listings</p><h2>Fresh from artists</h2></div><button class="secondary" data-view="store">View all</button></div>
      ${latest.length ? '<div class="product-grid">' + latest.map(renderListingCard).join('') + '</div>' : renderEmpty('No listings yet', 'Artists can post listings after signing in and connecting payouts.')}
    </section>
  `;
}

function filteredListings() {
  const query = state.search.toLowerCase();
  return state.listings.filter((listing) => {
    if (listing.status !== 'active') return false;
    const categoryMatch = state.category === 'All' || listing.category === state.category;
    const artist = artistName(listing.artist_id);
    const text = [listing.title, listing.description, listing.category, listing.listing_type, artist].join(' ').toLowerCase();
    return categoryMatch && (!query || text.includes(query));
  });
}

function renderFilters() {
  return `<div class="filters">${categories.map((category) => '<button class="filter-chip' + (state.category === category ? ' active' : '') + '" data-category="' + escapeHtml(category) + '">' + escapeHtml(category) + '</button>').join('')}</div>`;
}

function renderStore() {
  const listings = filteredListings();
  return `
    <section class="section-band">
      <div class="section-head"><div><p class="eyebrow">Store</p><h2>Buy directly from artists</h2></div>${state.profile && state.profile.role === 'artist' ? '<button class="primary" data-view="dashboard" data-dashboard-tab="listings">' + icon('i-plus') + 'Post listing</button>' : ''}</div>
      <div class="search-row">
        <label class="search-box">${icon('i-search')}<input id="searchInput" type="search" value="${escapeHtml(state.search)}" placeholder="Search character art, pets, logos..." /></label>
        <select id="sortSelect"><option value="new">Newest</option><option value="price-low">Lowest price</option><option value="price-high">Highest price</option></select>
      </div>
      ${renderFilters()}
      ${listings.length ? '<div class="product-grid">' + listings.map(renderListingCard).join('') + '</div>' : renderEmpty('No matching listings', 'Try a broader search or check back after artists post more work.')}
    </section>
  `;
}

function renderListingCard(listing) {
  const artist = artistName(listing.artist_id);
  const manage = canManageListing(listing);
  return `
    <article class="product-card">
      <img src="${escapeHtml(listing.image_url)}" alt="${escapeHtml(listing.title)}" />
      <div class="card-body">
        <div class="card-title"><div><h3>${escapeHtml(listing.title)}</h3><span>${escapeHtml(artist)} - ${escapeHtml(listing.status)}</span></div><strong>${formatMoney(listing.price_cents)}</strong></div>
        <p class="mini-note">Service and card processing fees are shown separately at checkout.</p>
        <p>${escapeHtml(listing.description)}</p>
        <div class="tag-row"><span>${escapeHtml(listing.category)}</span><span>${escapeHtml(listing.listing_type)}</span><span>${escapeHtml(listing.format)}</span></div>
        <div class="card-actions">
          ${listing.status === 'active' ? '<button class="primary" data-buy-listing="' + listing.id + '">' + icon('i-card') + 'Buy now</button><button class="secondary" data-request-listing="' + listing.id + '">' + icon('i-brush') + 'Request similar</button>' : ''}
          ${manage ? '<button class="secondary" data-edit-listing="' + listing.id + '">Edit</button>' : '<button class="secondary" data-report-target="listing" data-report-id="' + listing.id + '">Report</button>'}
        </div>
      </div>
    </article>
  `;
}

function artistModels() {
  return state.profiles
    .filter((profile) => profile.role === 'artist')
    .map((profile) => ({
      profile,
      artist: artistProfileFor(profile.id),
      listings: listingsForArtist(profile.id),
      portfolio: portfolioFor(profile.id)
    }));
}

function renderArtists() {
  const query = state.search.toLowerCase();
  const artists = artistModels().filter((item) => {
    const text = [item.profile.display_name, item.artist.handle, item.artist.bio, (item.artist.categories || []).join(' ')].join(' ').toLowerCase();
    return !query || text.includes(query);
  });

  return `
    <section class="section-band">
      <div class="section-head"><div><p class="eyebrow">Artists</p><h2>Search portfolios and listings</h2></div></div>
      <div class="search-row">
        <label class="search-box">${icon('i-search')}<input id="searchInput" type="search" value="${escapeHtml(state.search)}" placeholder="Search artists, styles, categories..." /></label>
        <select id="artistSort"><option>Recommended</option><option>Newest</option></select>
      </div>
      ${artists.length ? '<div class="artist-grid">' + artists.map(renderArtistCard).join('') + '</div>' : renderEmpty('No artists yet', 'Artists appear here after signing up and creating a profile.')}
    </section>
  `;
}

function renderArtistCard(item) {
  const cover = item.artist.banner_image_url || (item.portfolio[0] && item.portfolio[0].media_url) || (item.listings[0] && item.listings[0].image_url) || './assets/hero-market.svg';
  const stats = [
    item.listings.length + ' listings',
    item.portfolio.length + ' portfolio',
    ratingText(item.profile.id)
  ];
  return `
    <article class="artist-card">
      <img src="${escapeHtml(cover)}" alt="${escapeHtml(item.profile.display_name)} portfolio" />
      <div class="card-body">
        <div class="card-title"><div><h3>${escapeHtml(item.profile.display_name)}</h3><span>@${escapeHtml(item.artist.handle || 'artist')}</span></div><span class="status-pill">${item.listings.length} listings</span></div>
        <div class="mini-metrics">${stats.map((stat) => '<span>' + escapeHtml(stat) + '</span>').join('')}</div>
        <p>${escapeHtml(item.artist.bio || 'Artist profile coming together.')}</p>
        <div class="tag-row">${(item.artist.categories || []).slice(0, 4).map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('')}</div>
        <div class="card-actions">
          <button class="primary" data-view-artist="${item.profile.id}">${icon('i-image')}Profile</button>
          <button class="secondary" data-request-artist="${item.profile.id}">${icon('i-brush')}Request</button>
        </div>
      </div>
    </article>
  `;
}

function renderArtistProfile(artistId) {
  const profile = profileFor(artistId);
  const artist = artistProfileFor(artistId);
  if (!profile) return renderArtists();
  const items = portfolioFor(artistId);
  const listings = listingsForArtist(artistId);
  const reviews = reviewsForArtist(artistId);
  const reviewOrders = eligibleReviewOrdersForArtist(artistId);
  const banner = artist.banner_image_url || (items[0] && items[0].media_url) || (listings[0] && listings[0].image_url) || './assets/hero-market.svg';
  const featured = items.filter((item) => item.is_featured).slice(0, 3);
  const portfolioSummary = artist.portfolio_summary || (items.length ? 'A quick look at this artist\'s posted portfolio.' : 'Portfolio pieces will appear here after the artist uploads them.');
  return `
    <section class="section-band artist-profile-hero">
      <img src="${escapeHtml(banner)}" alt="${escapeHtml(profile.display_name)} banner" />
      <div>
        ${artist.profile_image_url ? '<img class="avatar-xl" src="' + escapeHtml(artist.profile_image_url) + '" alt="' + escapeHtml(profile.display_name) + ' avatar" />' : ''}
        <p class="eyebrow">Artist profile</p>
        <h1>${escapeHtml(profile.display_name)}</h1>
        <p class="lede">${escapeHtml(artist.bio || 'Artist profile coming soon.')}</p>
        <div class="profile-stat-grid">
          <div><strong>${listings.length}</strong><span>active listings</span></div>
          <div><strong>${items.length}</strong><span>portfolio pieces</span></div>
          <div><strong>${reviews.length}</strong><span>reviews</span></div>
          <div><strong>${artist.starting_price_cents ? formatMoney(artist.starting_price_cents) : 'Ask'}</strong><span>starting price</span></div>
        </div>
        <div class="tag-row">
          <span>${escapeHtml(ratingText(artistId))}</span>
          ${artist.turnaround ? '<span>' + escapeHtml(artist.turnaround) + '</span>' : ''}
          ${(artist.categories || []).map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('')}
        </div>
        <div class="row-actions">
          ${artist.website_url ? '<a class="secondary" href="' + escapeHtml(artist.website_url) + '" target="_blank" rel="noopener">Website</a>' : ''}
          ${artist.instagram_url ? '<a class="secondary" href="' + escapeHtml(artist.instagram_url) + '" target="_blank" rel="noopener">Instagram</a>' : ''}
          <button class="primary" data-request-artist="${artistId}">${icon('i-brush')}Request commission</button>
          <button class="secondary" data-report-target="artist" data-report-id="${artistId}">Report artist</button>
        </div>
      </div>
    </section>
    <section class="section-band layout-two">
      <div>
        ${featured.length ? '<h2>Featured work</h2><div class="portfolio-grid featured-grid">' + featured.map((item) => renderPortfolioCard(item)).join('') + '</div>' : ''}
        <h2>Portfolio</h2>
        <p class="muted">${escapeHtml(portfolioSummary)}</p>
        ${items.length ? '<div class="portfolio-grid">' + items.map((item) => renderPortfolioCard(item)).join('') + '</div>' : renderEmpty('No portfolio yet', 'This artist has not uploaded portfolio pieces yet.')}
        <h2>Reviews</h2>
        ${reviewOrders.length ? '<div class="review-prompt"><strong>Bought from this artist?</strong><span>Leave a review so future customers know what to expect.</span>' + reviewOrders.map((order) => '<button class="secondary compact" data-review-order="' + order.id + '">Review ' + escapeHtml((listingFor(order.listing_id) || {}).title || 'order') + '</button>').join('') + '</div>' : ''}
        ${reviews.length ? '<div class="review-list">' + reviews.map(renderReviewCard).join('') + '</div>' : renderEmpty('No reviews yet', 'Reviews appear after customers buy from this artist.')}
      </div>
      <aside class="side-panel card-body">
        <h3>Listings</h3>
        ${listings.length ? '<div class="artist-listing-stack">' + listings.map(renderArtistProfileListing).join('') + '</div>' : '<p class="muted">No active listings yet.</p>'}
        <button class="secondary wide" data-request-artist="${artistId}">${icon('i-brush')}Request custom commission</button>
      </aside>
    </section>
  `;
}

function renderArtistProfileListing(listing) {
  return `
    <article class="artist-listing-card">
      <img src="${escapeHtml(listing.image_url)}" alt="${escapeHtml(listing.title)}" />
      <div>
        <div class="split-head"><strong>${escapeHtml(listing.title)}</strong><span>${formatMoney(listing.price_cents)}</span></div>
        <p class="muted">${escapeHtml(listing.category)} - ${escapeHtml(listing.listing_type)}</p>
        <button class="primary wide" data-buy-listing="${listing.id}">${icon('i-card')}Buy</button>
      </div>
    </article>
  `;
}

function renderPortfolioCard(item, manage = false) {
  const tags = item.tags || [];
  return `
    <article class="portfolio-card">
      <img src="${escapeHtml(item.media_url)}" alt="${escapeHtml(item.title)}" />
      <div class="card-body">
        <div class="split-head"><h3>${escapeHtml(item.title)}</h3>${item.is_featured ? '<span class="status-pill">Featured</span>' : ''}</div>
        <p>${escapeHtml(item.description || '')}</p>
        ${tags.length ? '<div class="tag-row">' + tags.map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('') + '</div>' : ''}
        ${manage ? '<div class="row-actions"><button class="secondary compact" data-portfolio-feature="' + item.id + '" data-featured="' + (item.is_featured ? 'false' : 'true') + '">' + (item.is_featured ? 'Unfeature' : 'Feature') + '</button><button class="secondary compact" data-portfolio-move="' + item.id + '" data-direction="up">Move up</button><button class="secondary compact" data-portfolio-move="' + item.id + '" data-direction="down">Move down</button><button class="danger compact" data-portfolio-delete="' + item.id + '">Delete</button></div>' : ''}
      </div>
    </article>
  `;
}

function renderRequestForm(prefill = {}) {
  const artistOptions = artistModels().map((item) => '<option value="' + item.profile.id + '">' + escapeHtml(item.profile.display_name) + '</option>').join('');
  return `
    <section class="section-band layout-two">
      <div>
        <p class="eyebrow">Commission request</p>
        <h2>Ask for custom art</h2>
        <p class="section-copy">Customers can request custom work without seeing artist dashboards or admin analytics.</p>
        <form class="form-stack" data-form="commission">
          <div class="form-grid">
            <label>Name<input name="name" value="${escapeHtml(prefill.name || state.profile?.display_name || '')}" required /></label>
            <label>Email<input name="email" type="email" value="${escapeHtml(prefill.email || state.profile?.email || '')}" required /></label>
            <label>Artist<select name="artist_id"><option value="">Match me with someone</option>${artistOptions}</select></label>
            <label>Budget<input name="budget" type="number" min="1" step="1" placeholder="150" /></label>
          </div>
          <label>Project title<input name="title" value="${escapeHtml(prefill.title || '')}" placeholder="Character sheet, pet portrait, logo..." required /></label>
          <label>Brief<textarea name="brief" rows="6" required>${escapeHtml(prefill.brief || '')}</textarea></label>
          <input name="listing_id" type="hidden" value="${escapeHtml(prefill.listing_id || '')}" />
          <button class="primary wide" type="submit">${icon('i-send')}Send request</button>
        </form>
      </div>
      <aside class="side-panel card-body">
        <h3>What happens next</h3>
        <p class="muted">The artist sees the request in their dashboard. You see your own request history after signing in as a customer.</p>
      </aside>
    </section>
  `;
}

function renderSupportPage() {
  return `
    <section class="section-band layout-two">
      <div>
        <p class="eyebrow">Support</p>
        <h1>Need help?</h1>
        <p class="lede">Use this for account trouble, order problems, refunds, suspicious listings, or anything that needs admin attention.</p>
        <form class="form-stack" data-form="support">
          <div class="form-grid">
            <label>Name<input name="name" value="${escapeHtml(state.profile?.display_name || '')}" required /></label>
            <label>Email<input name="email" type="email" value="${escapeHtml(state.profile?.email || '')}" required /></label>
          </div>
          <label>Subject<input name="subject" placeholder="Password issue, order help, report a listing..." required /></label>
          <label>Message<textarea name="message" rows="6" required></textarea></label>
          <button class="primary wide" type="submit">${icon('i-send')}Send support request</button>
        </form>
      </div>
      <aside class="side-panel card-body">
        <h3>Quick fixes</h3>
        <p class="muted">Check spam for verification emails, wait before resending, and use Forgot password if the account already exists.</p>
      </aside>
    </section>
  `;
}

function renderPoliciesPage() {
  return `
    <section class="section-band">
      <p class="eyebrow">Policies</p>
      <h1>Marketplace basics</h1>
      <div class="policy-grid">
        <article class="policy-card"><h3>Terms of Service</h3><p>Users must own or have permission to upload the artwork they post. The Art Department may remove listings, accounts, or content that violates marketplace rules or payment requirements.</p></article>
        <article class="policy-card"><h3>Privacy Policy</h3><p>Account, order, listing, and support information is stored in Supabase. Payment details are handled by Stripe, not stored directly by The Art Department.</p></article>
        <article class="policy-card"><h3>Refund Policy</h3><p>Refunds depend on the listing type, delivery status, and artist agreement. Contact support for order problems so an admin can review the case.</p></article>
      </div>
    </section>
  `;
}

function renderDashboard() {
  if (!state.profile) {
    return `
      <section class="section-band">
        <p class="eyebrow">Dashboard</p>
        <h1>Sign in first</h1>
        <p class="lede">Create a customer or artist account to see the right dashboard.</p>
        <button class="primary" data-auth-open="signin">${icon('i-user')}Sign in</button>
      </section>
    `;
  }

  const role = state.profile.role;
  const tabs = role === 'admin'
    ? ['overview', 'users', 'listings', 'orders', 'requests', 'reports', 'support']
    : role === 'artist'
      ? ['overview', 'profile', 'portfolio', 'listings', 'sales', 'requests', 'reviews', 'payouts']
      : ['overview', 'orders', 'requests', 'profile'];

  if (!tabs.includes(state.dashboardTab)) state.dashboardTab = 'overview';

  return `
    <section class="dashboard-shell">
      <div class="section-band">
        <p class="eyebrow">${escapeHtml(role)} dashboard</p>
        <h1>${escapeHtml(state.profile.display_name)}</h1>
        <p class="lede">${role === 'admin' ? 'You can see platform-wide controls and analytics.' : role === 'artist' ? 'You can manage your own profile, listings, sales, requests, and payout status.' : 'You can see your own orders and requests.'}</p>
      </div>
      <div class="dashboard-grid">
        <nav class="dashboard-menu">${tabs.map((tab) => '<button class="secondary ' + (tab === state.dashboardTab ? 'active' : '') + '" data-dashboard-tab="' + tab + '">' + tabLabel(tab) + '</button>').join('')}</nav>
        <div class="dashboard-panel">${renderDashboardPanel(role, state.dashboardTab)}</div>
      </div>
    </section>
  `;
}

function tabLabel(tab) {
  return tab.charAt(0).toUpperCase() + tab.slice(1);
}

function renderDashboardPanel(role, tab) {
  if (role === 'admin') return renderAdminPanel(tab);
  if (role === 'artist') return renderArtistPanel(tab);
  return renderCustomerPanel(tab);
}

function renderCustomerPanel(tab) {
  const customerOrders = state.orders.filter((order) => order.customer_id === state.profile.id && order.status !== 'cancelled');
  if (tab === 'orders') return renderOrdersTable(customerOrders, 'Purchase library');
  if (tab === 'requests') return renderRequestsTable(state.requests.filter((request) => request.customer_id === state.profile.id), 'Your requests');
  if (tab === 'profile') return renderCustomerProfileArea(customerOrders);
  const paid = customerOrders.filter((order) => order.status === 'paid' || order.status === 'fulfilled');
  const reviewReady = customerOrders.filter((order) => (order.status === 'paid' || order.status === 'fulfilled') && !reviewForOrder(order.id));
  return `
    <div class="metric-grid">
      <div class="metric-card"><span>Orders</span><strong>${customerOrders.length}</strong></div>
      <div class="metric-card"><span>Requests</span><strong>${state.requests.filter((request) => request.customer_id === state.profile.id).length}</strong></div>
      <div class="metric-card"><span>Role</span><strong>Customer</strong></div>
      <div class="metric-card"><span>Ready purchases</span><strong>${paid.length}</strong></div>
    </div>
    ${reviewReady.length ? '<section class="section-band"><div class="split-head"><div><h2>Reviews waiting</h2><p class="muted">A quick review helps good artists stand out.</p></div><button class="secondary" data-dashboard-tab="orders">Open orders</button></div><div class="review-task-list">' + reviewReady.slice(0, 3).map((order) => '<button class="secondary" data-review-order="' + order.id + '">Review ' + escapeHtml((listingFor(order.listing_id) || {}).title || 'order') + '</button>').join('') + '</div></section>' : ''}
  `;
}

function renderArtistPanel(tab) {
  const mine = state.listings.filter((listing) => listing.artist_id === state.profile.id);
  const sales = state.orders.filter((order) => order.artist_id === state.profile.id && order.status !== 'cancelled');
  const requests = state.requests.filter((request) => request.artist_id === state.profile.id);
  if (tab === 'profile') return renderArtistProfileForm();
  if (tab === 'portfolio') return renderPortfolioManager();
  if (tab === 'listings') return renderListingManager();
  if (tab === 'sales') return renderOrdersTable(sales, 'Your sales');
  if (tab === 'requests') return renderRequestsTable(requests, 'Commission requests', 'artist');
  if (tab === 'reviews') return renderArtistReviews();
  if (tab === 'payouts') return renderPayoutPanel();
  const checklist = artistCompletionItems();
  const percent = completionPercent(checklist);
  return `
    ${renderArtistCompletionChecklist()}
    <div class="metric-grid">
      <div class="metric-card"><span>Listings</span><strong>${mine.length}</strong></div>
      <div class="metric-card"><span>Paid sales</span><strong>${sales.filter((order) => order.status === 'paid').length}</strong></div>
      <div class="metric-card"><span>Requests</span><strong>${requests.length}</strong></div>
      <div class="metric-card"><span>Payouts</span><strong>${isArtistReady(state.payoutAccount) ? 'Ready' : 'Needs setup'}</strong></div>
      <div class="metric-card"><span>Profile completion</span><strong>${percent}%</strong></div>
    </div>
  `;
}

function renderAdminPanel(tab) {
  if (tab === 'users') return renderUsersTable();
  if (tab === 'listings') return renderListingsAdmin();
  if (tab === 'orders') return renderOrdersTable(state.orders, 'All orders');
  if (tab === 'requests') return renderRequestsTable(state.requests, 'All requests', 'admin');
  if (tab === 'reports') return renderReportsTable();
  if (tab === 'support') return renderSupportTable();
  const paid = state.orders.filter((order) => order.status === 'paid');
  const volume = paid.reduce((sum, order) => sum + Number(order.amount_cents || 0), 0);
  const fees = paid.reduce((sum, order) => sum + Number(order.platform_fee_cents || 0), 0);
  const pending = state.orders.filter((order) => order.status === 'pending');
  const refundish = state.orders.filter((order) => order.status === 'refunded' || order.status === 'cancelled');
  return `
    <div class="metric-grid">
      <div class="metric-card"><span>Users</span><strong>${state.profiles.length}</strong></div>
      <div class="metric-card"><span>Live listings</span><strong>${state.listings.filter((listing) => listing.status === 'active').length}</strong></div>
      <div class="metric-card"><span>Gross volume</span><strong>${formatMoney(volume)}</strong></div>
      <div class="metric-card"><span>Platform fees</span><strong>${formatMoney(fees)}</strong></div>
      <div class="metric-card"><span>Pending orders</span><strong>${pending.length}</strong></div>
      <div class="metric-card"><span>Refund/cancel records</span><strong>${refundish.length}</strong></div>
      <div class="metric-card"><span>Open reports</span><strong>${state.reports.filter((item) => item.status === 'open').length}</strong></div>
      <div class="metric-card"><span>Open support</span><strong>${state.supportTickets.filter((item) => item.status === 'open').length}</strong></div>
    </div>
  `;
}

function renderProfileForm() {
  return `
    <section class="profile-card">
      <h2>Account profile</h2>
      <form class="form-stack" data-form="profile">
        <label>Display name<input name="display_name" value="${escapeHtml(state.profile.display_name)}" required /></label>
        <label>Avatar URL<input name="avatar_url" value="${escapeHtml(state.profile.avatar_url || '')}" placeholder="https://..." /></label>
        <button class="primary" type="submit">Save profile</button>
      </form>
    </section>
  `;
}

function renderCustomerProfileArea(customerOrders) {
  const requests = state.requests.filter((request) => request.customer_id === state.profile.id);
  const readyDownloads = customerOrders.filter((order) => order.status === 'paid' || order.status === 'fulfilled');
  const pending = customerOrders.filter((order) => order.status === 'pending');
  return `
    <section class="section-band">
      <div class="section-head"><div><h2>Customer profile</h2><p class="muted">Keep your buyer details and purchase history in one place.</p></div></div>
      <div class="customer-profile-grid">
        ${renderProfileForm()}
        <div class="profile-card">
          <h3>Your activity</h3>
          <div class="metric-grid compact-metrics">
            <div class="metric-card"><span>Purchases</span><strong>${customerOrders.length}</strong></div>
            <div class="metric-card"><span>Downloads</span><strong>${readyDownloads.length}</strong></div>
            <div class="metric-card"><span>Requests</span><strong>${requests.length}</strong></div>
            <div class="metric-card"><span>Pending</span><strong>${pending.length}</strong></div>
          </div>
          <div class="row-actions">
            <button class="secondary" data-dashboard-tab="orders">View purchases</button>
            <button class="secondary" data-dashboard-tab="requests">View requests</button>
          </div>
        </div>
      </div>
      ${readyDownloads.length ? '<h3>Recent downloads</h3><div class="order-card-grid">' + readyDownloads.slice(0, 3).map(renderOrderMiniCard).join('') + '</div>' : renderEmpty('No purchases yet', 'When you buy digital art, downloads and reviews will appear here.')}
    </section>
  `;
}

function renderOrderMiniCard(order) {
  const listing = listingFor(order.listing_id);
  return `
    <article class="order-mini-card">
      ${listing && listing.image_url ? '<img src="' + escapeHtml(listing.image_url) + '" alt="' + escapeHtml(listing.title) + '" />' : ''}
      <div>
        <strong>${escapeHtml(listing ? listing.title : 'Order')}</strong>
        <span>${escapeHtml(artistName(order.artist_id))}</span>
        <div class="row-actions">
          <button class="secondary compact" data-download-order="${order.id}">Download</button>
          ${reviewForOrder(order.id) ? '<span class="muted">Reviewed</span>' : '<button class="secondary compact" data-review-order="' + order.id + '">Review</button>'}
        </div>
      </div>
    </article>
  `;
}

function renderArtistCompletionChecklist() {
  const items = artistCompletionItems();
  if (!items.length) return '';
  const percent = completionPercent(items);
  if (percent >= 100) return '';
  return `
    <section class="checklist-card">
      <div class="split-head">
        <div><h2>Profile setup</h2><p class="muted">Finish these basics so customers feel confident buying from you.</p></div>
        <span class="status-pill">${percent}% complete</span>
      </div>
      <div class="progress-bar"><span style="width:${percent}%"></span></div>
      <div class="checklist-grid">
        ${items.map((item) => '<button class="checklist-item ' + (item.done ? 'done' : '') + '" data-dashboard-tab="' + item.tab + '"><span>' + (item.done ? 'Done' : 'Next') + '</span><strong>' + escapeHtml(item.label) + '</strong></button>').join('')}
      </div>
      <div class="row-actions">
        <button class="primary" data-view-artist="${state.profile.id}">${icon('i-image')}Preview public profile</button>
        <button class="secondary" data-copy-profile-link="${state.profile.id}">Copy profile link</button>
      </div>
    </section>
  `;
}

function renderArtistProfileForm() {
  const artist = state.artistProfile || {};
  return `
    <section class="section-band">
      <div class="split-head">
        <div><h2>Artist profile</h2><p class="muted">This is what customers use to decide whether to buy from you.</p></div>
        <div class="row-actions">
          <button class="secondary" type="button" data-view-artist="${state.profile.id}">Preview public profile</button>
          <button class="secondary" type="button" data-copy-profile-link="${state.profile.id}">Copy profile link</button>
        </div>
      </div>
      ${renderArtistCompletionChecklist()}
      <form class="form-stack" data-form="artist-profile">
        <div class="form-grid">
          <label>Display name<input name="display_name" value="${escapeHtml(state.profile.display_name)}" required /></label>
          <label>Handle<input name="handle" value="${escapeHtml(artist.handle || '')}" placeholder="your-studio" /></label>
          <label>Starting price<input name="starting_price" type="number" min="0" step="1" value="${Math.round((artist.starting_price_cents || 0) / 100)}" /></label>
          <label>Categories<input name="categories" value="${escapeHtml((artist.categories || []).join(', '))}" placeholder="Anime, Pets, Emotes" /></label>
          <label>Profile image URL<input name="profile_image_url" value="${escapeHtml(artist.profile_image_url || '')}" placeholder="https://..." /></label>
          <label>Banner image URL<input name="banner_image_url" value="${escapeHtml(artist.banner_image_url || '')}" placeholder="https://..." /></label>
          <label>Website URL<input name="website_url" value="${escapeHtml(artist.website_url || '')}" placeholder="https://..." /></label>
          <label>Instagram URL<input name="instagram_url" value="${escapeHtml(artist.instagram_url || '')}" placeholder="https://instagram.com/..." /></label>
          <label>Turnaround<input name="turnaround" value="${escapeHtml(artist.turnaround || '')}" placeholder="Usually 1-2 weeks" /></label>
        </div>
        <label>Bio<textarea name="bio" rows="5">${escapeHtml(artist.bio || '')}</textarea></label>
        <label>Portfolio summary<textarea name="portfolio_summary" rows="3">${escapeHtml(artist.portfolio_summary || '')}</textarea></label>
        <button class="primary" type="submit">Save artist profile</button>
      </form>
    </section>
  `;
}

function renderPortfolioManager() {
  const mine = portfolioFor(state.profile.id);
  const featured = mine.filter((item) => item.is_featured);
  return `
    <section class="section-band">
      <div class="split-head">
        <div><h2>Portfolio</h2><p class="muted">Featured pieces appear first on your public profile.</p></div>
        <span class="status-pill">${featured.length} featured</span>
      </div>
      <form class="form-stack" data-form="portfolio">
        <div class="form-grid">
          <label>Title<input name="title" required /></label>
          <label>Image file<input name="file" type="file" accept="image/*" required /></label>
          <label>Tags<input name="tags" placeholder="Anime, portrait, pets" /></label>
          <label class="toggle-line"><input name="is_featured" type="checkbox" value="yes" /> Feature this piece</label>
        </div>
        <label>Description<textarea name="description" rows="3"></textarea></label>
        <button class="primary" type="submit">${icon('i-image')}Upload portfolio piece</button>
      </form>
      ${mine.length ? '<div class="portfolio-grid">' + mine.map((item) => renderPortfolioCard(item, true)).join('') + '</div>' : renderEmpty('No portfolio pieces yet', 'Start with 3 strong examples so buyers can quickly judge your style.')}
    </section>
  `;
}

function renderListingManager() {
  const ready = isArtistReady(state.payoutAccount);
  const mine = state.listings.filter((listing) => listing.artist_id === state.profile.id);
  const editing = state.editingListingId ? state.listings.find((listing) => listing.id === state.editingListingId) : null;
  return `
    <section class="section-band">
      <div class="split-head"><div><h2>${editing ? 'Edit listing' : 'Create listing'}</h2><p class="muted">Listings are public immediately. You can pause, edit, or remove them later.</p></div><span class="status-pill ${ready ? '' : 'warn'}">${ready ? 'Payouts ready' : 'Finish payouts first'}</span></div>
      <form class="form-stack" data-form="listing">
        <input type="hidden" name="listing_id" value="${editing ? escapeHtml(editing.id) : ''}" />
        <div class="form-grid">
          <label>Title<input name="title" value="${editing ? escapeHtml(editing.title) : ''}" required /></label>
          <label>Price<input name="price" type="number" min="1" step="1" value="${editing ? Math.round(editing.price_cents / 100) : ''}" required /></label>
          <label>Category<select name="category">${categories.filter((item) => item !== 'All').map((item) => '<option ' + (editing && editing.category === item ? 'selected' : '') + '>' + item + '</option>').join('')}</select></label>
          <label>Type<select name="listing_type">${['Commission slot', 'Digital download', 'Print', 'Sticker', 'Keychain', 'Emote pack', 'Logo'].map((item) => '<option ' + (editing && editing.listing_type === item ? 'selected' : '') + '>' + item + '</option>').join('')}</select></label>
          <label>Format<select name="format">${['Digital', 'Physical', 'Digital and physical', 'Custom service'].map((item) => '<option ' + (editing && editing.format === item ? 'selected' : '') + '>' + item + '</option>').join('')}</select></label>
          <label>Preview URL<input name="image_url" value="${editing ? escapeHtml(editing.image_url) : ''}" placeholder="Optional older/unprotected image URL" /></label>
          <label>Upload artwork<input name="file" type="file" accept="image/*" /></label>
        </div>
        <p class="form-note">Uploaded artwork is protected: shoppers see a watermarked preview, and paid customers download the clean original.</p>
        <label>Description<textarea name="description" rows="5" required>${editing ? escapeHtml(editing.description) : ''}</textarea></label>
        <div class="row-actions">
          <button class="primary" type="submit" ${ready ? '' : 'disabled'}>${icon('i-plus')}${editing ? 'Save listing' : 'Publish listing'}</button>
          ${editing ? '<button class="secondary" type="button" data-cancel-edit-listing>Cancel edit</button>' : ''}
        </div>
      </form>
      <h3>Your listings</h3>
      ${mine.length ? '<div class="table-wrap"><table><thead><tr><th>Listing</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + mine.map(renderManageListingRow).join('') + '</tbody></table></div>' : renderEmpty('No listings yet', 'Create your first listing after payouts are ready.')}
    </section>
  `;
}

function renderManageListingRow(listing) {
  const protection = listing.is_protected ? 'Protected original' : 'Preview only';
  return '<tr><td>' + escapeHtml(listing.title) + '<br><span class="muted">' + escapeHtml(listing.category) + ' - ' + escapeHtml(listing.listing_type) + ' - ' + protection + '</span></td><td>' + formatMoney(listing.price_cents) + '</td><td><span class="status-pill">' + escapeHtml(listing.status) + '</span></td><td><div class="row-actions">' +
    '<button class="secondary compact" data-edit-listing="' + listing.id + '">Edit</button>' +
    '<button class="secondary compact" data-listing-status="' + listing.id + '" data-status="active">Activate</button>' +
    '<button class="secondary compact" data-listing-status="' + listing.id + '" data-status="paused">Pause</button>' +
    '<button class="secondary compact" data-listing-status="' + listing.id + '" data-status="sold_out">Sold out</button>' +
    '<button class="danger compact" data-listing-status="' + listing.id + '" data-status="removed">Remove</button>' +
  '</div></td></tr>';
}

function renderPayoutPanel() {
  const payout = state.payoutAccount || {};
  const ready = isArtistReady(payout);
  return `
    <section class="section-band">
      <p class="eyebrow">Stripe Connect</p>
      <h2>Money and payouts</h2>
      <p class="lede">${ready ? 'Stripe says your account can receive payments and payouts.' : 'Finish Stripe onboarding before posting paid listings.'}</p>
      <div class="metric-grid">
        <div class="metric-card"><span>Details</span><strong>${payout.stripe_details_submitted ? 'Done' : 'Needed'}</strong></div>
        <div class="metric-card"><span>Charges</span><strong>${payout.stripe_charges_enabled ? 'Ready' : 'Needed'}</strong></div>
        <div class="metric-card"><span>Payouts</span><strong>${payout.stripe_payouts_enabled ? 'Ready' : 'Needed'}</strong></div>
        <div class="metric-card"><span>Status</span><strong>${escapeHtml(payout.onboarding_status || 'not_started')}</strong></div>
      </div>
      <div class="row-actions">
        ${payout.stripe_account_id ? '<button class="primary" data-open-payout-dashboard>' + icon('i-wallet') + 'Open Stripe payout dashboard</button>' : ''}
        <button class="primary" data-start-payout>${icon('i-wallet')}Start/continue Stripe onboarding</button>
        <button class="secondary" data-check-payout>${icon('i-search')}Check status</button>
      </div>
    </section>
  `;
}

function renderArtistReviews() {
  const reviews = reviewsForArtist(state.profile.id);
  return `
    <section class="section-band">
      <h2>Reviews</h2>
      <p class="muted">${escapeHtml(ratingText(state.profile.id))}</p>
      ${reviews.length ? '<div class="review-list">' + reviews.map(renderReviewCard).join('') + '</div>' : renderEmpty('No reviews yet', 'Reviews appear after paid customers leave feedback.')}
    </section>
  `;
}

function renderUsersTable() {
  return `
    <section class="table-wrap">
      <h2>Users</h2>
      <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Action</th></tr></thead><tbody>
        ${state.profiles.map((profile) => '<tr><td>' + escapeHtml(profile.display_name) + '</td><td>' + escapeHtml(profile.email) + '</td><td><span class="status-pill">' + escapeHtml(profile.role) + '</span></td><td>' + new Date(profile.created_at).toLocaleDateString() + '</td><td><select class="compact-select" data-user-role="' + profile.id + '"><option value="customer" ' + (profile.role === 'customer' ? 'selected' : '') + '>Customer</option><option value="artist" ' + (profile.role === 'artist' ? 'selected' : '') + '>Artist</option><option value="admin" ' + (profile.role === 'admin' ? 'selected' : '') + '>Admin</option></select></td></tr>').join('')}
      </tbody></table>
    </section>
  `;
}

function renderListingsAdmin() {
  return `
    <section class="table-wrap">
      <h2>Listings</h2>
      <table><thead><tr><th>Title</th><th>Artist</th><th>Price</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${state.listings.map((listing) => '<tr><td>' + escapeHtml(listing.title) + '</td><td>' + escapeHtml(artistName(listing.artist_id)) + '</td><td>' + formatMoney(listing.price_cents) + '</td><td><span class="status-pill">' + escapeHtml(listing.status) + '</span></td><td><div class="row-actions"><button class="secondary compact" data-listing-status="' + listing.id + '" data-status="active">Activate</button><button class="secondary compact" data-listing-status="' + listing.id + '" data-status="paused">Pause</button><button class="danger compact" data-listing-status="' + listing.id + '" data-status="removed">Remove</button></div></td></tr>').join('')}
      </tbody></table>
    </section>
  `;
}

function renderReportsTable() {
  return `
    <section class="table-wrap">
      <h2>Reports</h2>
      ${state.reports.length ? '<table><thead><tr><th>Target</th><th>Reason</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>' +
        state.reports.map((report) => '<tr><td>' + escapeHtml(report.target_type) + '<br><span class="muted">' + escapeHtml(report.target_id) + '</span></td><td>' + escapeHtml(report.reason) + '<br><span class="muted">' + escapeHtml(report.details || '') + '</span></td><td><span class="status-pill">' + escapeHtml(report.status) + '</span></td><td>' + new Date(report.created_at).toLocaleDateString() + '</td><td><button class="secondary compact" data-report-status="' + report.id + '" data-status="reviewing">Reviewing</button><button class="secondary compact" data-report-status="' + report.id + '" data-status="closed">Close</button></td></tr>').join('') +
      '</tbody></table>' : renderEmpty('No reports', 'Reported listings/artists will appear here.')}
    </section>
  `;
}

function renderSupportTable() {
  return `
    <section class="table-wrap">
      <h2>Support tickets</h2>
      ${state.supportTickets.length ? '<table><thead><tr><th>Subject</th><th>User</th><th>Message</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
        state.supportTickets.map((ticket) => '<tr><td>' + escapeHtml(ticket.subject) + '<br><span class="muted">' + new Date(ticket.created_at).toLocaleDateString() + '</span></td><td>' + escapeHtml(ticket.name) + '<br><span class="muted">' + escapeHtml(ticket.email) + '</span></td><td>' + escapeHtml(ticket.message).slice(0, 220) + '</td><td><span class="status-pill">' + escapeHtml(ticket.status) + '</span></td><td><button class="secondary compact" data-support-status="' + ticket.id + '" data-status="reviewing">Reviewing</button><button class="secondary compact" data-support-status="' + ticket.id + '" data-status="closed">Close</button></td></tr>').join('') +
      '</tbody></table>' : renderEmpty('No support tickets', 'Support requests will appear here.')}
    </section>
  `;
}

function renderOrdersTable(orders, title) {
  const hasPending = orders.some((order) => order.status === 'pending');
  return `
    <section class="table-wrap">
      <div class="split-head">
        <h2>${escapeHtml(title)}</h2>
        ${hasPending ? '<button class="secondary compact" data-sync-payments>' + icon('i-refresh') + 'Sync Stripe payments</button>' : ''}
      </div>
      ${orders.length ? '<table><thead><tr><th>Status</th><th>Listing</th><th>Artist</th><th>Amount</th><th>Deliverable</th><th>Date</th><th>Actions</th></tr></thead><tbody>' +
        orders.map(renderOrderRow).join('') +
      '</tbody></table>' : renderEmpty('No orders yet', 'Orders appear here after checkout.')}
    </section>
  `;
}

function renderOrderRow(order) {
  const listing = listingFor(order.listing_id);
  const commissionRequest = order.commission_request_id ? requestFor(order.commission_request_id) : null;
  const orderTitle = listing ? listing.title : commissionRequest ? 'Commission: ' + commissionRequest.title : 'Order';
  const canDownload = order.status === 'paid' && listing && listing.image_url && isDigitalListing(listing);
  const review = reviewForOrder(order.id);
  const isCustomerOrder = state.profile && order.customer_id === state.profile.id;
  const isArtistOrder = state.profile && order.artist_id === state.profile.id;
  const deliverable = canDownload
    ? '<button class="secondary compact" data-download-order="' + order.id + '">' + icon('i-image') + 'Download clean file</button>'
    : commissionRequest
      ? '<button class="secondary compact" data-open-request="' + commissionRequest.id + '">Open commission</button>'
    : order.status === 'paid'
      ? '<span class="muted">Artist delivery</span>'
      : '<span class="muted">Available after payment</span>';
  const customerActions = isCustomerOrder && (order.status === 'paid' || order.status === 'fulfilled')
    ? review
      ? '<span class="muted">Reviewed</span>'
      : '<button class="secondary compact" data-review-order="' + order.id + '">Leave review</button>'
    : '';
  const artistActions = isArtistOrder && order.status === 'paid'
    ? '<button class="secondary compact" data-order-status="' + order.id + '" data-status="fulfilled">Mark fulfilled</button>'
    : '';
  const adminActions = state.profile && state.profile.role === 'admin'
    ? '<button class="secondary compact" data-order-status="' + order.id + '" data-status="paid">Paid</button><button class="secondary compact" data-order-status="' + order.id + '" data-status="fulfilled">Fulfilled</button><button class="danger compact" data-order-status="' + order.id + '" data-status="refunded">Refunded</button><button class="danger compact" data-order-status="' + order.id + '" data-status="cancelled">Cancelled</button>'
    : '';

  return '<tr>' +
    '<td><span class="status-pill">' + escapeHtml(order.status) + '</span></td>' +
    '<td>' + escapeHtml(orderTitle) + '</td>' +
    '<td>' + escapeHtml(artistName(order.artist_id)) + '</td>' +
    '<td>' + formatMoney(order.amount_cents) + '</td>' +
    '<td>' + deliverable + '</td>' +
    '<td>' + new Date(order.created_at).toLocaleDateString() + '</td>' +
    '<td><div class="row-actions">' + (customerActions || artistActions || adminActions || '<span class="muted">No action</span>') + '</div></td>' +
  '</tr>';
}

function renderRequestsTable(requests, title, context = '') {
  return `
    <section class="table-wrap">
      <div class="split-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="muted">Open a request to read the full brief, manage payment, and share drafts.</p>
        </div>
      </div>
      ${requests.length ? '<table><thead><tr><th>Project</th><th>Customer</th><th>Artist</th><th>Budget</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
        requests.map((request) => renderRequestRow(request, context)).join('') +
      '</tbody></table>' : renderEmpty('No requests yet', 'Commission requests appear here.')}
    </section>
  `;
}

function renderRequestRow(request, context) {
  const artistOptions = artistModels().map((item) => '<option value="' + item.profile.id + '" ' + (request.artist_id === item.profile.id ? 'selected' : '') + '>' + escapeHtml(item.profile.display_name) + '</option>').join('');
  const paymentStatus = request.payment_status || 'not_requested';
  const quotedCents = Number(request.quoted_cents || 0);
  const budgetText = quotedCents > 0 ? formatMoney(quotedCents) + '<br><span class="muted">quoted</span>' : formatMoney(request.budget_cents);
  const adminAction = context === 'admin'
    ? '<select class="compact-select" data-assign-request="' + request.id + '"><option value="">Match needed</option>' + artistOptions + '</select><button class="secondary compact" data-request-status="' + request.id + '" data-status="completed">Complete</button><button class="danger compact" data-request-status="' + request.id + '" data-status="declined">Close</button>'
    : '';
  const artistAction = context === 'artist' && request.artist_id === state.profile.id
    ? '<button class="secondary compact" data-request-status="' + request.id + '" data-status="accepted">Accept</button><button class="danger compact" data-decline-request="' + request.id + '">Decline</button><button class="secondary compact" data-request-status="' + request.id + '" data-status="completed">Complete</button>'
    : '';
  const customerAction = !adminAction && !artistAction && request.status === 'declined'
    ? '<span class="muted">Artist declined. Admin can rematch.</span>'
    : '';
  const action = '<div class="row-actions"><button class="primary compact" data-open-request="' + request.id + '">Details</button>' + (adminAction || artistAction || customerAction || '') + '</div>';

  return '<tr><td><button class="link-button request-title-button" data-open-request="' + request.id + '">' + escapeHtml(request.title) + '</button><br><span class="muted">' + escapeHtml(request.brief).slice(0, 120) + '</span>' + (request.declined_reason ? '<br><span class="muted">Declined reason: ' + escapeHtml(request.declined_reason) + '</span>' : '') + '</td><td>' + escapeHtml(request.name) + '<br><span class="muted">' + escapeHtml(request.email) + '</span></td><td>' + escapeHtml(request.artist_id ? artistName(request.artist_id) : 'Match needed') + '</td><td>' + budgetText + '</td><td><span class="status-pill">' + escapeHtml(paymentStatus.replace(/_/g, ' ')) + '</span></td><td><span class="status-pill">' + escapeHtml(request.status) + '</span></td><td>' + action + '</td></tr>';
}

function requestPaymentText(request) {
  const paymentStatus = request.payment_status || 'not_requested';
  if (paymentStatus === 'paid') return 'Paid through Stripe';
  if (paymentStatus === 'requested') return 'Payment requested';
  if (paymentStatus === 'failed') return 'Payment failed or expired';
  return 'Not requested yet';
}

function requestQuoteAmount(request) {
  return Number(request.quoted_cents || request.budget_cents || 0);
}

function renderRequestDetail(request) {
  const isAdmin = state.profile && state.profile.role === 'admin';
  const isArtist = state.profile && request.artist_id === state.profile.id;
  const isCustomer = state.profile && request.customer_id === state.profile.id;
  const canManage = isAdmin || isArtist;
  const paymentStatus = request.payment_status || 'not_requested';
  const quoteCents = requestQuoteAmount(request);
  const quoteValue = Math.max(1, Math.round(quoteCents / 100));
  const canPay = isCustomer && request.artist_id && paymentStatus !== 'paid' && quoteCents >= 100 && !['declined', 'completed'].includes(request.status);
  const paid = paymentStatus === 'paid';
  const requestOrder = state.orders.find((order) => order.commission_request_id === request.id || order.id === request.payment_order_id);

  return `
    <div class="request-detail">
      <div class="split-head">
        <div>
          <p class="eyebrow">Commission request</p>
          <h2>${escapeHtml(request.title)}</h2>
          <p class="muted">${escapeHtml(request.name)} - ${escapeHtml(request.email)}</p>
        </div>
        <div class="status-stack">
          <span class="status-pill">${escapeHtml(request.status)}</span>
          <span class="status-pill">${escapeHtml(paymentStatus.replace(/_/g, ' '))}</span>
        </div>
      </div>

      <div class="request-detail-grid">
        <section class="detail-panel">
          <h3>Brief</h3>
          <p class="long-copy">${escapeHtml(request.brief)}</p>
          ${request.declined_reason ? '<p class="form-note">Declined reason: ' + escapeHtml(request.declined_reason) + '</p>' : ''}
        </section>

        <section class="detail-panel">
          <h3>Commission safety</h3>
          <dl class="detail-list">
            <div><dt>Budget</dt><dd>${formatMoney(request.budget_cents)}</dd></div>
            <div><dt>Quote</dt><dd>${request.quoted_cents ? formatMoney(request.quoted_cents) : 'Not quoted yet'}</dd></div>
            <div><dt>Payment</dt><dd>${escapeHtml(requestPaymentText(request))}</dd></div>
            <div><dt>Artist</dt><dd>${escapeHtml(request.artist_id ? artistName(request.artist_id) : 'Match needed')}</dd></div>
          </dl>
          <p class="form-note">Safest workflow: accept the request, request payment through Stripe, then upload drafts after the payment says paid.</p>
          ${requestOrder ? '<p class="muted">Order record: ' + escapeHtml(requestOrder.status) + ' - ' + formatMoney(requestOrder.amount_cents) + '</p>' : ''}
          ${canPay ? '<button class="primary wide" data-pay-commission="' + request.id + '">' + icon('i-card') + 'Pay commission quote</button>' : ''}
        </section>
      </div>

      ${canManage ? `
        <section class="detail-panel">
          <div class="split-head">
            <div><h3>Quote and status</h3><p class="muted">Send a Stripe payment request before doing serious work.</p></div>
          </div>
          <form class="form-stack compact-form" data-form="commission-quote">
            <input type="hidden" name="request_id" value="${escapeHtml(request.id)}" />
            <div class="form-grid">
              <label>Quote amount<input name="quote" type="number" min="1" step="1" value="${quoteValue}" /></label>
              <label>Status<select name="status"><option value="accepted" ${request.status === 'accepted' ? 'selected' : ''}>Accepted</option><option value="quoted" ${request.status === 'quoted' ? 'selected' : ''}>Quoted / waiting for payment</option><option value="completed" ${request.status === 'completed' ? 'selected' : ''}>Completed</option></select></label>
            </div>
            <button class="primary" type="submit">Save quote / request payment</button>
          </form>
        </section>
      ` : ''}

      <section class="detail-panel">
        <div class="split-head">
          <div><h3>Draft delivery</h3><p class="muted">${paid ? 'Drafts can be shared here because payment is on record.' : 'Draft upload unlocks after the customer pays through Stripe.'}</p></div>
        </div>
        ${request.draft_url ? `
          <div class="draft-preview">
            <img src="${escapeHtml(request.draft_url)}" alt="${escapeHtml(request.title)} draft" />
            <div>
              <strong>Latest draft</strong>
              <p>${escapeHtml(request.draft_note || 'No note added.')}</p>
              <button class="secondary compact" data-download-image="${escapeHtml(request.draft_url)}" data-download-title="${escapeHtml(request.title + ' draft')}">${icon('i-image')}Download draft</button>
            </div>
          </div>
        ` : renderEmpty('No draft uploaded yet', paid ? 'The artist can upload a watermarked draft from this panel.' : 'Payment should be collected before drafts are shared.')}
        ${canManage ? `
          <form class="form-stack compact-form" data-form="commission-draft">
            <input type="hidden" name="request_id" value="${escapeHtml(request.id)}" />
            <label>Draft image<input name="file" type="file" accept="image/*" ${paid ? '' : 'disabled'} required /></label>
            <label>Note to customer<textarea name="draft_note" rows="3" ${paid ? '' : 'disabled'} placeholder="What changed in this draft?">${escapeHtml(request.draft_note || '')}</textarea></label>
            <button class="primary" type="submit" ${paid ? '' : 'disabled'}>${icon('i-send')}Upload draft</button>
          </form>
        ` : ''}
      </section>
    </div>
  `;
}

function renderReviewCard(review) {
  const customer = profileFor(review.customer_id);
  return `
    <article class="review-card">
      <div class="split-head">
        <strong>${Number(review.rating || 0)} / 5 stars</strong>
        <span class="muted">${new Date(review.created_at).toLocaleDateString()}</span>
      </div>
      <p>${escapeHtml(review.body || 'No written review.')}</p>
      <span class="muted">${escapeHtml(customer ? customer.display_name : 'Customer')}</span>
    </article>
  `;
}

function renderEmpty(title, text) {
  return '<div class="empty-state"><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(text) + '</p></div>';
}

function render() {
  updateTopbar();
  const app = qs('#app');
  if (!state.config || !state.config.supabaseUrl || !state.config.supabaseAnonKey) {
    app.innerHTML = renderSetupMissing();
    return;
  }
  if (state.view.startsWith('artist:')) {
    app.innerHTML = renderArtistProfile(state.view.split(':')[1]);
    return;
  }
  if (state.view === 'store') app.innerHTML = renderStore();
  else if (state.view === 'artists') app.innerHTML = renderArtists();
  else if (state.view === 'requests') app.innerHTML = renderRequestForm();
  else if (state.view === 'support') app.innerHTML = renderSupportPage();
  else if (state.view === 'policies') app.innerHTML = renderPoliciesPage();
  else if (state.view === 'dashboard') app.innerHTML = renderDashboard();
  else app.innerHTML = renderHome();
}

function renderKeepingSearchFocus(input) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  render();
  const next = qs('#searchInput');
  if (!next) return;
  next.focus();
  try {
    next.setSelectionRange(start, end);
  } catch (_error) {
    // Some input types do not support selection ranges.
  }
}

function shouldAutoRefreshDashboard() {
  const passiveTabs = ['overview', 'orders', 'sales'];
  return !!(
    state.profile &&
    state.view === 'dashboard' &&
    passiveTabs.includes(state.dashboardTab) &&
    !document.hidden &&
    !(document.activeElement && document.activeElement.closest && document.activeElement.closest('form'))
  );
}

function openAuth(mode) {
  state.authMode = mode || 'signin';
  updateAuthMode();
  const verifyDialog = qs('#verifyDialog');
  if (verifyDialog && verifyDialog.open) verifyDialog.close();
  qs('#authDialog').showModal();
}

function updateAuthMode() {
  const isSignup = state.authMode === 'signup';
  qs('#authTitle').textContent = isSignup ? 'Create account' : 'Sign in';
  qs('#authSubmitLabel').textContent = isSignup ? 'Create account' : 'Sign in';
  qs('#authIntro').textContent = isSignup
    ? 'Choose customer if you want to buy art, or artist if you want to sell work.'
    : 'Enter your email and password to get back into your account.';
  qs('#authPassword').placeholder = isSignup ? 'At least 6 characters' : 'Your password';
  qsa('[data-auth-mode]').forEach((button) => button.classList.toggle('active', button.dataset.authMode === state.authMode));
  qsa('.signup-only').forEach((item) => {
    item.hidden = !isSignup;
    item.style.display = isSignup ? '' : 'none';
  });
  qsa('.signin-only').forEach((item) => {
    item.hidden = isSignup;
    item.style.display = isSignup ? 'none' : '';
  });
  qs('#authName').disabled = !isSignup;
  qs('#authRole').disabled = !isSignup;
  setAuthBusy(false);
}

async function uploadPublicFile(file, folder = 'uploads') {
  const path = state.profile.id + '/' + folder + '/' + Date.now() + '-' + slug(file.name);
  const { error } = await state.supabase.storage.from('portfolio-media').upload(path, file, {
    upsert: false,
    contentType: file.type || undefined
  });
  if (error) throw error;
  const { data } = state.supabase.storage.from('portfolio-media').getPublicUrl(path);
  return data.publicUrl;
}

async function uploadPortfolioPreview(file) {
  const previewFile = await createWatermarkedPreview(file);
  return uploadPublicFile(previewFile, 'portfolio');
}

async function uploadCommissionDraftPreview(file) {
  const previewFile = await createWatermarkedPreview(file);
  return uploadPublicFile(previewFile, 'commission-drafts');
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be read.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.86) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The watermarked preview could not be created.'));
    }, type, quality);
  });
}

async function createWatermarkedPreview(file) {
  const image = await loadImageFile(file);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const fontSize = Math.max(24, Math.round(width / 13));
  const stepX = Math.max(260, Math.round(width / 2.4));
  const stepY = Math.max(160, Math.round(height / 3.5));
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 ' + fontSize + 'px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.lineWidth = Math.max(2, Math.round(fontSize / 18));

  for (let y = -height; y <= height; y += stepY) {
    for (let x = -width; x <= width; x += stepX) {
      ctx.strokeText('THE ART DEPARTMENT', x, y);
      ctx.fillText('THE ART DEPARTMENT', x, y);
    }
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(8, 15, 30, 0.68)';
  ctx.fillRect(0, height - Math.max(44, Math.round(height * 0.07)), width, Math.max(44, Math.round(height * 0.07)));
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 ' + Math.max(16, Math.round(width / 52)) + 'px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('The Art Department preview - clean file unlocks after purchase', 18, height - Math.max(22, Math.round(height * 0.035)));

  const blob = await canvasToBlob(canvas);
  const baseName = slug(file.name.replace(/\.[^.]+$/, '') || 'artwork');
  return new File([blob], baseName + '-watermarked-preview.jpg', { type: 'image/jpeg' });
}

async function uploadProtectedListingImages(file) {
  const previewFile = await createWatermarkedPreview(file);
  const previewUrl = await uploadPublicFile(previewFile, 'listing-previews');
  const originalPath = state.profile.id + '/listing-originals/' + Date.now() + '-' + slug(file.name);
  const { error } = await state.supabase.storage.from('listing-originals').upload(originalPath, file, {
    upsert: false,
    contentType: file.type || undefined
  });
  if (error) throw error;
  return { previewUrl, originalPath };
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (state.authBusy) return;
  setAuthBusy(true);

  const email = qs('#authEmail').value.trim();
  const password = qs('#authPassword').value;
  try {
    if (state.authMode === 'signup') {
      const displayName = qs('#authName').value.trim() || email.split('@')[0];
      const role = qs('#authRole').value;
      const { data, error } = await state.supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: authRedirectUrl(),
          data: { display_name: displayName, role }
        }
      });
      if (error) throw error;
      qs('#authDialog').close();
      if (!data.session) {
        localStorage.setItem(pendingVerificationKey, email);
        showVerificationDialog('pending', email);
        return;
      }
      showToast('Account created.');
    } else {
      const { error } = await state.supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (/confirm|verified|verification/i.test(error.message || '')) {
          localStorage.setItem(pendingVerificationKey, email);
          qs('#authDialog').close();
          showVerificationDialog('pending', email);
          return;
        }
        throw error;
      }
      qs('#authDialog').close();
    }
    await refreshAll();
  } finally {
    setAuthBusy(false);
  }
}

async function resendVerificationEmail() {
  const dialog = qs('#verifyDialog');
  const email = dialog ? dialog.dataset.email : localStorage.getItem(pendingVerificationKey);
  if (!email) {
    showToast('Enter the email again from Create account.');
    openAuth('signup');
    return;
  }

  const resendButton = qs('#verifyResend');
  if (resendButton) resendButton.disabled = true;
  try {
    const { error } = await state.supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirectUrl() }
    });
    if (error) throw error;
    showToast('Verification email resent.');
  } finally {
    if (resendButton) resendButton.disabled = false;
  }
}

async function requestPasswordReset() {
  if (!state.supabase) {
    showToast('Supabase is not connected yet.');
    return;
  }
  const email = qs('#authEmail').value.trim();
  if (!email) {
    showToast('Type your email first, then press Forgot password.');
    return;
  }

  const { error } = await state.supabase.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl('reset')
  });
  if (error) throw error;
  const authDialog = qs('#authDialog');
  if (authDialog.open) authDialog.close();
  showVerificationDialog('reset-sent', email);
}

async function saveNewPassword(event) {
  event.preventDefault();
  const password = qs('#newPassword').value;
  const confirm = qs('#confirmPassword').value;
  if (password.length < 6) {
    showToast('Password needs at least 6 characters.');
    return;
  }
  if (password !== confirm) {
    showToast('The two passwords do not match.');
    return;
  }

  const { error } = await state.supabase.auth.updateUser({ password });
  if (error) throw error;
  qs('#resetDialog').close();
  await state.supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  showToast('Password saved. Sign in with the new password.');
  openAuth('signin');
}

async function handleVerificationReturn(params) {
  const pendingEmail = localStorage.getItem(pendingVerificationKey);
  const looksLikeVerification =
    params.get('auth') === 'verified' ||
    params.get('type') === 'signup' ||
    location.hash.includes('type=signup') ||
    (params.has('code') && !!pendingEmail);

  if (!pendingEmail || !looksLikeVerification || !state.supabase) return;

  localStorage.removeItem(pendingVerificationKey);
  const { data } = await state.supabase.auth.getSession();
  if (data.session) {
    await state.supabase.auth.signOut();
    state.session = null;
    state.profile = null;
  }
  cleanAuthUrl();
  showVerificationDialog('verified', pendingEmail);
}

async function handlePasswordResetReturn(params) {
  const looksLikeReset =
    params.get('auth') === 'reset' ||
    params.get('type') === 'recovery' ||
    location.hash.includes('type=recovery');

  if (!looksLikeReset || !state.supabase) return;
  cleanAuthUrl();
  showResetPasswordDialog();
}

async function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.form;

  if (type === 'profile') {
    await state.supabase.from('profiles').update({
      display_name: data.display_name,
      avatar_url: data.avatar_url || null
    }).eq('id', state.profile.id);
    showToast('Profile saved.');
  }

  if (type === 'artist-profile') {
    await state.supabase.from('profiles').update({ display_name: data.display_name }).eq('id', state.profile.id);
    await state.supabase.from('artist_profiles').upsert({
      user_id: state.profile.id,
      handle: data.handle || slug(data.display_name),
      bio: data.bio || '',
      portfolio_summary: data.portfolio_summary || '',
      categories: String(data.categories || '').split(',').map((item) => item.trim()).filter(Boolean),
      starting_price_cents: Math.round((Number(data.starting_price) || 0) * 100),
      profile_image_url: data.profile_image_url || null,
      banner_image_url: data.banner_image_url || null,
      website_url: data.website_url || null,
      instagram_url: data.instagram_url || null,
      turnaround: data.turnaround || ''
    });
    showToast('Artist profile saved.');
  }

  if (type === 'portfolio') {
    const file = form.elements.file.files[0];
    const mediaUrl = await uploadPortfolioPreview(file);
    const portfolioPayload = {
      artist_id: state.profile.id,
      title: data.title,
      description: data.description || '',
      media_url: mediaUrl,
      tags: String(data.tags || '').split(',').map((item) => item.trim()).filter(Boolean),
      is_featured: data.is_featured === 'yes',
      sort_order: Math.floor(Date.now() / 1000)
    };
    let usedFallback = false;
    let { error } = await state.supabase.from('portfolio_items').insert(portfolioPayload);
    if (error && /tags|is_featured|sort_order|column|out of range|integer/i.test(error.message || '')) {
      const fallbackPayload = {
        artist_id: portfolioPayload.artist_id,
        title: portfolioPayload.title,
        description: portfolioPayload.description,
        media_url: portfolioPayload.media_url
      };
      const retry = await state.supabase.from('portfolio_items').insert(fallbackPayload);
      error = retry.error;
      usedFallback = !error;
    }
    if (error) throw error;
    showToast(usedFallback ? 'Watermarked portfolio preview uploaded. Run the profile QOL SQL to use tags and featured controls.' : 'Watermarked portfolio preview uploaded.');
    form.reset();
  }

  if (type === 'listing') {
    if (!isArtistReady(state.payoutAccount)) {
      showToast('Finish payout setup before posting listings.');
      return;
    }
    const file = form.elements.file.files[0];
    const existingListing = data.listing_id ? state.listings.find((listing) => listing.id === data.listing_id) : null;
    const imageUrl = data.image_url || (existingListing ? existingListing.image_url : '');
    if (!file && !imageUrl) {
      showToast('Upload artwork or add a preview URL.');
      return;
    }
    const payload = {
      title: data.title,
      description: data.description,
      category: data.category,
      listing_type: data.listing_type,
      format: data.format,
      price_cents: Math.round(Number(data.price) * 100),
      image_url: imageUrl
    };

    if (file) {
      const protectedImages = await uploadProtectedListingImages(file);
      payload.image_url = protectedImages.previewUrl;
      payload.preview_image_url = protectedImages.previewUrl;
      payload.original_file_path = protectedImages.originalPath;
      payload.is_protected = true;
      payload.watermark_version = 'v1';
    } else if (!data.listing_id || (data.image_url && (!existingListing || data.image_url !== existingListing.image_url))) {
      payload.preview_image_url = imageUrl;
      payload.original_file_path = null;
      payload.is_protected = false;
      payload.watermark_version = null;
    }

    if (data.listing_id) {
      await state.supabase.from('listings').update(payload).eq('id', data.listing_id);
      state.editingListingId = null;
      showToast('Listing saved.');
    } else {
      await state.supabase.from('listings').insert({
        artist_id: state.profile.id,
        ...payload,
        status: 'active'
      });
      showToast(file ? 'Listing published with a protected original.' : 'Listing published with an unprotected preview URL.');
    }
  }

  if (type === 'commission') {
    await state.supabase.from('commission_requests').insert({
      customer_id: state.profile ? state.profile.id : null,
      artist_id: data.artist_id || null,
      listing_id: data.listing_id || null,
      name: data.name,
      email: data.email,
      title: data.title,
      brief: data.brief,
      budget_cents: Math.round((Number(data.budget) || 0) * 100)
    });
    showToast('Commission request sent.');
  }

  if (type === 'commission-quote') {
    const request = requestFor(data.request_id);
    const quoteCents = Math.round((Number(data.quote) || 0) * 100);
    if (!request) {
      showToast('Request could not be found.');
      return;
    }
    if (quoteCents < 100) {
      showToast('Quote must be at least $1.');
      return;
    }
    await state.supabase.from('commission_requests').update({
      quoted_cents: quoteCents,
      payment_status: request.payment_status === 'paid' ? 'paid' : 'requested',
      status: data.status || 'quoted'
    }).eq('id', data.request_id);
    showToast('Quote saved. The customer can pay from their request details.');
    const dialog = qs('#requestDialog');
    if (dialog && dialog.open) dialog.close();
  }

  if (type === 'commission-draft') {
    const request = requestFor(data.request_id);
    if (!request) {
      showToast('Request could not be found.');
      return;
    }
    if ((request.payment_status || 'not_requested') !== 'paid') {
      showToast('Collect payment through Stripe before uploading drafts.');
      return;
    }
    const file = form.elements.file.files[0];
    if (!file) {
      showToast('Choose a draft image first.');
      return;
    }
    const draftUrl = await uploadCommissionDraftPreview(file);
    await state.supabase.from('commission_requests').update({
      draft_url: draftUrl,
      draft_note: data.draft_note || '',
      draft_uploaded_at: new Date().toISOString()
    }).eq('id', data.request_id);
    showToast('Draft uploaded and visible to the customer.');
    const dialog = qs('#requestDialog');
    if (dialog && dialog.open) dialog.close();
  }

  if (type === 'support') {
    await state.supabase.from('support_tickets').insert({
      customer_id: state.profile ? state.profile.id : null,
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message
    });
    showToast('Support request sent.');
  }

  await refreshAll();
}

async function buyListing(id) {
  if (!state.profile) {
    openAuth('signin');
    showToast('Sign in or create an account first so the download is saved to you.');
    return;
  }
  const data = await callFunction('/.netlify/functions/create-listing-checkout', { listingId: id });
  location.href = data.url;
}

async function syncCheckoutSession(sessionId, orderId) {
  return callFunction('/.netlify/functions/sync-checkout-session', { sessionId, orderId });
}

async function syncPendingOrders(showResult = true) {
  const data = await callFunction('/.netlify/functions/sync-pending-orders');
  if (showResult) {
    if (data.updated) {
      showToast(data.updated + ' paid order' + (data.updated === 1 ? '' : 's') + ' updated.');
    } else if (data.cancelled) {
      showToast(data.cancelled + ' abandoned checkout' + (data.cancelled === 1 ? '' : 's') + ' cleaned up.');
    } else {
      showToast('No new paid orders found yet.');
    }
  }
  return data;
}

function openRequestDetail(id) {
  const request = requestFor(id);
  if (!request) {
    showToast('That request could not be found.');
    return;
  }
  const body = qs('#requestDialogBody');
  body.innerHTML = renderRequestDetail(request);
  const dialog = qs('#requestDialog');
  if (dialog.open) dialog.close();
  dialog.showModal();
}

async function buyCommissionRequest(id) {
  if (!state.profile) {
    openAuth('signin');
    showToast('Sign in first so the commission payment is saved to you.');
    return;
  }
  const data = await callFunction('/.netlify/functions/create-commission-checkout', { requestId: id });
  location.href = data.url;
}

async function startPayout() {
  const data = await callFunction('/.netlify/functions/stripe-connect-start');
  location.href = data.url;
}

async function checkPayout() {
  const data = await callFunction('/.netlify/functions/stripe-connect-status');
  showToast(data.ready ? 'Payouts are ready.' : 'Stripe still needs more onboarding.');
  await refreshAll();
}

async function openPayoutDashboard() {
  const data = await callFunction('/.netlify/functions/stripe-connect-login');
  location.href = data.url;
}

async function downloadImage(url, title) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed.');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const pathname = new URL(url, location.href).pathname;
    const ext = (pathname.match(/\.(png|jpe?g|webp|gif|svg)$/i) || [])[0] || '.jpg';
    link.href = objectUrl;
    link.download = slug(title || 'the-art-dept-download') + ext.toLowerCase();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (_error) {
    window.open(url, '_blank', 'noopener');
  }
}

async function downloadPurchasedOrder(orderId) {
  const data = await callFunction('/.netlify/functions/download-original', { orderId });
  await downloadImage(data.url, data.title || 'the-art-dept-download');
}

async function removeListing(id) {
  await state.supabase.from('listings').update({ status: 'removed' }).eq('id', id);
  showToast('Listing removed.');
  await refreshAll();
}

async function updateListingStatus(id, status) {
  await state.supabase.from('listings').update({ status }).eq('id', id);
  showToast('Listing status updated.');
  await refreshAll();
}

function editListing(id) {
  state.editingListingId = id;
  state.view = 'dashboard';
  state.dashboardTab = 'listings';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEditListing() {
  state.editingListingId = null;
  render();
}

async function assignRequest(id, artistId) {
  await state.supabase.from('commission_requests').update({
    artist_id: artistId || null,
    assigned_by: state.profile.id,
    assigned_at: artistId ? new Date().toISOString() : null,
    status: 'new',
    declined_reason: null,
    declined_at: null
  }).eq('id', id);
  showToast(artistId ? 'Request assigned.' : 'Request returned to match pool.');
  await refreshAll();
}

async function updateRequestStatus(id, status) {
  const request = requestFor(id);
  if (status === 'completed' && request && (request.payment_status || 'not_requested') !== 'paid') {
    showToast('Collect payment through Stripe before marking a commission complete.');
    return;
  }
  await state.supabase.from('commission_requests').update({ status }).eq('id', id);
  showToast('Request updated.');
  await refreshAll();
}

async function declineRequest(id) {
  const reason = prompt('Why are you declining this request? This helps admin rematch it.');
  if (reason === null) return;
  await state.supabase.from('commission_requests').update({
    artist_id: null,
    status: 'new',
    declined_reason: reason.trim() || 'Artist declined this request.',
    declined_at: new Date().toISOString()
  }).eq('id', id);
  showToast('Request declined and sent back for rematching.');
  await refreshAll();
}

async function updateUserRole(id, role) {
  const profile = profileFor(id);
  await state.supabase.from('profiles').update({ role }).eq('id', id);
  if (role === 'artist') {
    await state.supabase.from('artist_profiles').upsert({
      user_id: id,
      handle: slug(profile ? profile.display_name : 'artist')
    });
  }
  showToast('User role updated.');
  await refreshAll();
}

async function updateOrderStatus(id, status) {
  await state.supabase.from('orders').update({ status }).eq('id', id);
  showToast('Order status updated.');
  await refreshAll();
}

async function updatePortfolioFeatured(id, featured) {
  await state.supabase.from('portfolio_items').update({ is_featured: featured }).eq('id', id);
  showToast(featured ? 'Portfolio piece featured.' : 'Portfolio piece unfeatured.');
  await refreshAll();
}

async function movePortfolioItem(id, direction) {
  const mine = portfolioFor(state.profile.id);
  const index = mine.findIndex((item) => item.id === id);
  if (index < 0) return;
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= mine.length) return;
  const current = mine[index];
  const other = mine[swapIndex];
  await Promise.all([
    state.supabase.from('portfolio_items').update({ sort_order: Number(other.sort_order || 0) }).eq('id', current.id),
    state.supabase.from('portfolio_items').update({ sort_order: Number(current.sort_order || 0) }).eq('id', other.id)
  ]);
  showToast('Portfolio order updated.');
  await refreshAll();
}

async function deletePortfolioItem(id) {
  if (!confirm('Remove this portfolio piece?')) return;
  await state.supabase.from('portfolio_items').delete().eq('id', id);
  showToast('Portfolio piece removed.');
  await refreshAll();
}

async function copyProfileLink(id) {
  const url = artistProfileLink(id);
  try {
    await navigator.clipboard.writeText(url);
    showToast('Profile link copied.');
  } catch (_error) {
    showToast(url);
  }
}

function openReviewDialog(id) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;
  const listing = listingFor(order.listing_id);
  qs('#reviewOrderId').value = order.id;
  qs('#reviewTitle').textContent = 'Review ' + artistName(order.artist_id);
  qs('#reviewSubtitle').textContent = listing ? listing.title : 'Your order';
  qs('#reviewRating').value = '5';
  qs('#reviewBody').value = '';
  qs('#reviewDialog').showModal();
}

async function reviewOrder(id, ratingValue, body) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;
  const rating = Math.max(1, Math.min(5, Math.round(Number(ratingValue))));
  if (!Number.isFinite(rating)) {
    showToast('Use a number from 1 to 5.');
    return;
  }
  await state.supabase.from('reviews').insert({
    order_id: order.id,
    customer_id: state.profile.id,
    artist_id: order.artist_id,
    rating,
    body: body || ''
  });
  showToast('Review posted.');
  await refreshAll();
}

async function reportTarget(type, id) {
  const reason = prompt('Why are you reporting this?');
  if (reason === null) return;
  const details = prompt('Any extra details?') || '';
  await state.supabase.from('reports').insert({
    reporter_id: state.profile ? state.profile.id : null,
    target_type: type,
    target_id: id,
    reason: reason.trim() || 'Reported by user',
    details
  });
  showToast('Report sent to admin.');
}

async function updateReportStatus(id, status) {
  await state.supabase.from('reports').update({ status }).eq('id', id);
  showToast('Report updated.');
  await refreshAll();
}

async function updateSupportStatus(id, status) {
  await state.supabase.from('support_tickets').update({ status }).eq('id', id);
  showToast('Support ticket updated.');
  await refreshAll();
}

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const view = event.target.closest('[data-view]');
    const auth = event.target.closest('[data-auth-open]');
    const signOut = event.target.closest('[data-sign-out]');
    const tab = event.target.closest('[data-dashboard-tab]');
    const category = event.target.closest('[data-category]');
    const artist = event.target.closest('[data-view-artist]');
    const requestArtist = event.target.closest('[data-request-artist]');
    const requestListing = event.target.closest('[data-request-listing]');
    const buy = event.target.closest('[data-buy-listing]');
    const payout = event.target.closest('[data-start-payout]');
    const payoutStatus = event.target.closest('[data-check-payout]');
    const payoutDashboard = event.target.closest('[data-open-payout-dashboard]');
    const syncPayments = event.target.closest('[data-sync-payments]');
    const download = event.target.closest('[data-download-image]');
    const downloadOrder = event.target.closest('[data-download-order]');
    const remove = event.target.closest('[data-remove-listing]');
    const editListingButton = event.target.closest('[data-edit-listing]');
    const cancelEdit = event.target.closest('[data-cancel-edit-listing]');
    const listingStatus = event.target.closest('[data-listing-status]');
    const requestStatus = event.target.closest('[data-request-status]');
    const declineButton = event.target.closest('[data-decline-request]');
    const openRequest = event.target.closest('[data-open-request]');
    const payCommission = event.target.closest('[data-pay-commission]');
    const orderStatus = event.target.closest('[data-order-status]');
    const reviewButton = event.target.closest('[data-review-order]');
    const portfolioFeature = event.target.closest('[data-portfolio-feature]');
    const portfolioMove = event.target.closest('[data-portfolio-move]');
    const portfolioDelete = event.target.closest('[data-portfolio-delete]');
    const copyProfile = event.target.closest('[data-copy-profile-link]');
    const reportButton = event.target.closest('[data-report-target]');
    const reportStatus = event.target.closest('[data-report-status]');
    const supportStatus = event.target.closest('[data-support-status]');
    const verifyPrimary = event.target.closest('[data-verify-primary]');
    const verifyResend = event.target.closest('[data-resend-verification]');
    const passwordReset = event.target.closest('[data-password-reset]');

    try {
      if (view) {
        state.view = view.dataset.view;
        if (view.dataset.dashboardTab) state.dashboardTab = view.dataset.dashboardTab;
        render();
      }
      if (auth) openAuth(auth.dataset.authOpen);
      if (signOut) {
        await state.supabase.auth.signOut();
        state.session = null;
        state.profile = null;
        state.view = 'home';
        await refreshAll();
      }
      if (tab) {
        state.dashboardTab = tab.dataset.dashboardTab;
        render();
      }
      if (category) {
        state.category = category.dataset.category;
        render();
      }
      if (artist) {
        state.view = 'artist:' + artist.dataset.viewArtist;
        render();
      }
      if (requestArtist) {
        state.view = 'requests';
        render();
        const select = qs('[name="artist_id"]');
        if (select) select.value = requestArtist.dataset.requestArtist;
      }
      if (requestListing) {
        const listing = state.listings.find((item) => item.id === requestListing.dataset.requestListing);
        state.view = 'requests';
        render();
        if (listing) {
          qs('[name="artist_id"]').value = listing.artist_id;
          qs('[name="listing_id"]').value = listing.id;
          qs('[name="title"]').value = 'Custom request similar to ' + listing.title;
          qs('[name="brief"]').value = 'I am interested in something similar to this listing: ' + listing.title + '.';
          qs('[name="budget"]').value = Math.round(listing.price_cents / 100);
        }
      }
      if (buy) await buyListing(buy.dataset.buyListing);
      if (payout) await startPayout();
      if (payoutStatus) await checkPayout();
      if (payoutDashboard) await openPayoutDashboard();
      if (syncPayments) {
        await syncPendingOrders();
        await refreshAll();
      }
      if (download) await downloadImage(download.dataset.downloadImage, download.dataset.downloadTitle);
      if (downloadOrder) await downloadPurchasedOrder(downloadOrder.dataset.downloadOrder);
      if (remove) await removeListing(remove.dataset.removeListing);
      if (editListingButton) editListing(editListingButton.dataset.editListing);
      if (cancelEdit) cancelEditListing();
      if (listingStatus) await updateListingStatus(listingStatus.dataset.listingStatus, listingStatus.dataset.status);
      if (requestStatus) await updateRequestStatus(requestStatus.dataset.requestStatus, requestStatus.dataset.status);
      if (declineButton) await declineRequest(declineButton.dataset.declineRequest);
      if (openRequest) openRequestDetail(openRequest.dataset.openRequest);
      if (payCommission) await buyCommissionRequest(payCommission.dataset.payCommission);
      if (orderStatus) await updateOrderStatus(orderStatus.dataset.orderStatus, orderStatus.dataset.status);
      if (reviewButton) openReviewDialog(reviewButton.dataset.reviewOrder);
      if (portfolioFeature) await updatePortfolioFeatured(portfolioFeature.dataset.portfolioFeature, portfolioFeature.dataset.featured === 'true');
      if (portfolioMove) await movePortfolioItem(portfolioMove.dataset.portfolioMove, portfolioMove.dataset.direction);
      if (portfolioDelete) await deletePortfolioItem(portfolioDelete.dataset.portfolioDelete);
      if (copyProfile) await copyProfileLink(copyProfile.dataset.copyProfileLink);
      if (reportButton) await reportTarget(reportButton.dataset.reportTarget, reportButton.dataset.reportId);
      if (reportStatus) await updateReportStatus(reportStatus.dataset.reportStatus, reportStatus.dataset.status);
      if (supportStatus) await updateSupportStatus(supportStatus.dataset.supportStatus, supportStatus.dataset.status);
      if (verifyPrimary) openAuth('signin');
      if (verifyResend) await resendVerificationEmail();
      if (passwordReset) await requestPasswordReset();
    } catch (error) {
      showToast(error.message || 'Something went wrong.');
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'searchInput') {
      state.search = event.target.value;
      renderKeepingSearchFocus(event.target);
    }
  });

  document.addEventListener('change', async (event) => {
    const assign = event.target.closest('[data-assign-request]');
    const role = event.target.closest('[data-user-role]');
    if (!assign && !role) return;
    try {
      if (assign) await assignRequest(assign.dataset.assignRequest, assign.value);
      if (role) await updateUserRole(role.dataset.userRole, role.value);
    } catch (error) {
      showToast(error.message || 'Could not save change.');
    }
  });

  document.addEventListener('submit', async (event) => {
    try {
      await handleSubmit(event);
    } catch (error) {
      showToast(error.message || 'Could not save.');
    }
  });

  qs('#authForm').addEventListener('submit', async (event) => {
    try {
      await handleAuthSubmit(event);
    } catch (error) {
      const message = /invalid login/i.test(error.message || '')
        ? 'Could not sign in. Check the password, or verify the email first.'
        : error.message || 'Could not sign in.';
      showToast(message);
    }
  });

  qs('#resetPasswordForm').addEventListener('submit', async (event) => {
    try {
      await saveNewPassword(event);
    } catch (error) {
      showToast(error.message || 'Could not save password.');
    }
  });

  qs('#reviewForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await reviewOrder(qs('#reviewOrderId').value, qs('#reviewRating').value, qs('#reviewBody').value);
      qs('#reviewDialog').close();
    } catch (error) {
      showToast(error.message || 'Could not post review.');
    }
  });

  qsa('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.authMode = button.dataset.authMode;
      updateAuthMode();
    });
  });
}

async function init() {
  bindEvents();
  await loadConfig();
  if (state.supabase) {
    state.supabase.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      await refreshAll();
    });
  }

  setInterval(async () => {
    if (autoRefreshRunning || !shouldAutoRefreshDashboard()) return;
    autoRefreshRunning = true;
    try {
      await refreshAll();
    } catch (_error) {
      // Keep quiet here; the next manual refresh or page load can recover.
    } finally {
      autoRefreshRunning = false;
    }
  }, 15000);

  const params = new URLSearchParams(location.search);
  await handlePasswordResetReturn(params);
  await handleVerificationReturn(params);
  if (params.get('artist')) {
    state.view = 'artist:' + params.get('artist');
  }
  if (params.get('payment') === 'success') {
    state.view = 'dashboard';
    state.dashboardTab = 'orders';
    const sessionId = params.get('session_id');
    const orderId = params.get('order');
    if (sessionId) {
      try {
        const result = await syncCheckoutSession(sessionId, orderId);
        showToast(result.status === 'paid' ? 'Payment complete. Your download is in Orders.' : 'Payment received. Stripe is still processing it.');
      } catch (_error) {
        showToast('Payment returned. Refreshing order status.');
      }
    } else if (orderId && state.session) {
      try {
        await syncPendingOrders(false);
        showToast('Payment returned. Refreshing order status.');
      } catch (_error) {
        showToast('Payment complete. Your download is in Orders.');
      }
    } else {
      showToast('Payment complete. Your download is in Orders.');
    }
    if (history.replaceState) history.replaceState({}, document.title, location.pathname);
  }
  if (params.get('stripe') === 'return') showToast('Stripe returned you to the dashboard. Check payout status.');
  await refreshAll();
}

init();
