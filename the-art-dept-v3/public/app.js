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
  view: new URLSearchParams(location.search).get('view') || 'home',
  dashboardTab: 'overview',
  authMode: 'signin',
  authBusy: false,
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

function authRedirectUrl() {
  return location.origin + location.pathname + '?auth=verified';
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
  qs('#verifyEyebrow').textContent = mode === 'verified' ? 'Email verified' : 'Email verification';
  qs('#verifyTitle').textContent = mode === 'verified' ? 'You may now sign in' : 'Please verify your email';
  qs('#verifyMessage').textContent = mode === 'verified'
    ? 'Your email is confirmed. Close this message or press Sign in to continue.'
    : 'We sent a confirmation link to ' + safeEmail + '. Open that email before signing in.';
  qs('#verifyPrimary').textContent = mode === 'verified' ? 'Sign in' : 'Back to sign in';
  qs('#verifyResend').hidden = mode === 'verified';

  if (dialog.open) dialog.close();
  dialog.showModal();
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
  return state.portfolio.filter((item) => item.artist_id === id);
}

function listingsForArtist(id) {
  return state.listings.filter((listing) => listing.artist_id === id && listing.status === 'active');
}

function listingFor(id) {
  return state.listings.find((listing) => listing.id === id) || null;
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
  const [profiles, artistProfiles, portfolio, listings] = await Promise.all([
    state.supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    state.supabase.from('artist_profiles').select('*'),
    state.supabase.from('portfolio_items').select('*').order('created_at', { ascending: false }),
    state.supabase.from('listings').select('*').order('created_at', { ascending: false })
  ]);

  state.profiles = profiles.data || [];
  state.artistProfiles = artistProfiles.data || [];
  state.portfolio = portfolio.data || [];
  state.listings = listings.data || [];
}

async function loadPrivateData() {
  state.orders = [];
  state.requests = [];
  if (!state.supabase || !state.profile) return;

  const [orders, requests] = await Promise.all([
    state.supabase.from('orders').select('*').order('created_at', { ascending: false }),
    state.supabase.from('commission_requests').select('*').order('created_at', { ascending: false })
  ]);
  state.orders = orders.data || [];
  state.requests = requests.data || [];
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
  dashboardButton.hidden = !state.profile;
  qsa('.main-nav button').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));

  const actions = qs('#accountActions');
  if (!state.profile) {
    actions.innerHTML = '<button class="secondary" data-auth-open="signin">Sign in</button><button class="primary" data-auth-open="signup">' + icon('i-user') + 'Create account</button>';
    return;
  }

  actions.innerHTML =
    '<button class="secondary" data-view="dashboard">' + icon('i-user') + escapeHtml(state.profile.display_name) + '</button>' +
    '<button class="secondary" data-sign-out>' + icon('i-logout') + 'Sign out</button>';
}

function renderSetupMissing() {
  return `
    <section class="section-band">
      <p class="eyebrow">Setup needed</p>
      <h1>The Art Dept V3</h1>
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
        <h1>The Art Dept</h1>
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
        <img src="./assets/hero-market.svg" alt="The Art Dept marketplace preview" />
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
  return `
    <article class="product-card">
      <img src="${escapeHtml(listing.image_url)}" alt="${escapeHtml(listing.title)}" />
      <div class="card-body">
        <div class="card-title"><div><h3>${escapeHtml(listing.title)}</h3><span>${escapeHtml(artist)}</span></div><strong>${formatMoney(listing.price_cents)}</strong></div>
        <p>${escapeHtml(listing.description)}</p>
        <div class="tag-row"><span>${escapeHtml(listing.category)}</span><span>${escapeHtml(listing.listing_type)}</span><span>${escapeHtml(listing.format)}</span></div>
        <div class="card-actions">
          <button class="primary" data-buy-listing="${listing.id}">${icon('i-card')}Buy now</button>
          <button class="secondary" data-request-listing="${listing.id}">${icon('i-brush')}Request similar</button>
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
  const cover = (item.portfolio[0] && item.portfolio[0].media_url) || (item.listings[0] && item.listings[0].image_url) || './assets/hero-market.svg';
  return `
    <article class="artist-card">
      <img src="${escapeHtml(cover)}" alt="${escapeHtml(item.profile.display_name)} portfolio" />
      <div class="card-body">
        <div class="card-title"><div><h3>${escapeHtml(item.profile.display_name)}</h3><span>@${escapeHtml(item.artist.handle || 'artist')}</span></div><span class="status-pill">${item.listings.length} listings</span></div>
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
  return `
    <section class="section-band layout-two">
      <div>
        <p class="eyebrow">Artist profile</p>
        <h1>${escapeHtml(profile.display_name)}</h1>
        <p class="lede">${escapeHtml(artist.bio || 'Artist profile coming soon.')}</p>
        <div class="tag-row">${(artist.categories || []).map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('')}</div>
        <h2>Portfolio</h2>
        ${items.length ? '<div class="portfolio-grid">' + items.map(renderPortfolioCard).join('') + '</div>' : renderEmpty('No portfolio yet', 'This artist has not uploaded portfolio pieces yet.')}
      </div>
      <aside class="side-panel card-body">
        <h3>Listings</h3>
        ${listings.length ? listings.map((listing) => '<div class="split-head"><span>' + escapeHtml(listing.title) + '</span><strong>' + formatMoney(listing.price_cents) + '</strong></div><button class="primary wide" data-buy-listing="' + listing.id + '">' + icon('i-card') + 'Buy</button>').join('') : '<p class="muted">No active listings yet.</p>'}
        <button class="secondary wide" data-request-artist="${artistId}">${icon('i-brush')}Request custom commission</button>
      </aside>
    </section>
  `;
}

function renderPortfolioCard(item) {
  return `
    <article class="portfolio-card">
      <img src="${escapeHtml(item.media_url)}" alt="${escapeHtml(item.title)}" />
      <div class="card-body"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || '')}</p></div>
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
    ? ['overview', 'users', 'listings', 'orders', 'requests']
    : role === 'artist'
      ? ['overview', 'profile', 'portfolio', 'listings', 'sales', 'requests', 'payouts']
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
  if (tab === 'orders') return renderOrdersTable(state.orders.filter((order) => order.customer_id === state.profile.id), 'Your orders');
  if (tab === 'requests') return renderRequestsTable(state.requests.filter((request) => request.customer_id === state.profile.id), 'Your requests');
  if (tab === 'profile') return renderProfileForm();
  return `
    <div class="metric-grid">
      <div class="metric-card"><span>Orders</span><strong>${state.orders.filter((order) => order.customer_id === state.profile.id).length}</strong></div>
      <div class="metric-card"><span>Requests</span><strong>${state.requests.filter((request) => request.customer_id === state.profile.id).length}</strong></div>
      <div class="metric-card"><span>Role</span><strong>Customer</strong></div>
      <div class="metric-card"><span>Saved profiles</span><strong>Soon</strong></div>
    </div>
  `;
}

function renderArtistPanel(tab) {
  const mine = state.listings.filter((listing) => listing.artist_id === state.profile.id);
  const sales = state.orders.filter((order) => order.artist_id === state.profile.id);
  const requests = state.requests.filter((request) => request.artist_id === state.profile.id);
  if (tab === 'profile') return renderArtistProfileForm();
  if (tab === 'portfolio') return renderPortfolioManager();
  if (tab === 'listings') return renderListingManager();
  if (tab === 'sales') return renderOrdersTable(sales, 'Your sales');
  if (tab === 'requests') return renderRequestsTable(requests, 'Commission requests');
  if (tab === 'payouts') return renderPayoutPanel();
  return `
    <div class="metric-grid">
      <div class="metric-card"><span>Listings</span><strong>${mine.length}</strong></div>
      <div class="metric-card"><span>Paid sales</span><strong>${sales.filter((order) => order.status === 'paid').length}</strong></div>
      <div class="metric-card"><span>Requests</span><strong>${requests.length}</strong></div>
      <div class="metric-card"><span>Payouts</span><strong>${isArtistReady(state.payoutAccount) ? 'Ready' : 'Needs setup'}</strong></div>
    </div>
  `;
}

function renderAdminPanel(tab) {
  if (tab === 'users') return renderUsersTable();
  if (tab === 'listings') return renderListingsAdmin();
  if (tab === 'orders') return renderOrdersTable(state.orders, 'All orders');
  if (tab === 'requests') return renderRequestsTable(state.requests, 'All requests');
  const paid = state.orders.filter((order) => order.status === 'paid');
  const volume = paid.reduce((sum, order) => sum + Number(order.amount_cents || 0), 0);
  const fees = paid.reduce((sum, order) => sum + Number(order.platform_fee_cents || 0), 0);
  return `
    <div class="metric-grid">
      <div class="metric-card"><span>Users</span><strong>${state.profiles.length}</strong></div>
      <div class="metric-card"><span>Live listings</span><strong>${state.listings.filter((listing) => listing.status === 'active').length}</strong></div>
      <div class="metric-card"><span>Gross volume</span><strong>${formatMoney(volume)}</strong></div>
      <div class="metric-card"><span>Platform fees</span><strong>${formatMoney(fees)}</strong></div>
    </div>
  `;
}

function renderProfileForm() {
  return `
    <section class="section-band">
      <h2>Account profile</h2>
      <form class="form-stack" data-form="profile">
        <label>Display name<input name="display_name" value="${escapeHtml(state.profile.display_name)}" required /></label>
        <label>Avatar URL<input name="avatar_url" value="${escapeHtml(state.profile.avatar_url || '')}" placeholder="https://..." /></label>
        <button class="primary" type="submit">Save profile</button>
      </form>
    </section>
  `;
}

function renderArtistProfileForm() {
  const artist = state.artistProfile || {};
  return `
    <section class="section-band">
      <h2>Artist profile</h2>
      <form class="form-stack" data-form="artist-profile">
        <div class="form-grid">
          <label>Display name<input name="display_name" value="${escapeHtml(state.profile.display_name)}" required /></label>
          <label>Handle<input name="handle" value="${escapeHtml(artist.handle || '')}" placeholder="your-studio" /></label>
          <label>Starting price<input name="starting_price" type="number" min="0" step="1" value="${Math.round((artist.starting_price_cents || 0) / 100)}" /></label>
          <label>Categories<input name="categories" value="${escapeHtml((artist.categories || []).join(', '))}" placeholder="Anime, Pets, Emotes" /></label>
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
  return `
    <section class="section-band">
      <h2>Portfolio</h2>
      <form class="form-stack" data-form="portfolio">
        <div class="form-grid">
          <label>Title<input name="title" required /></label>
          <label>Image file<input name="file" type="file" accept="image/*" required /></label>
        </div>
        <label>Description<textarea name="description" rows="3"></textarea></label>
        <button class="primary" type="submit">${icon('i-image')}Upload portfolio piece</button>
      </form>
      ${mine.length ? '<div class="portfolio-grid">' + mine.map(renderPortfolioCard).join('') + '</div>' : renderEmpty('No portfolio pieces yet', 'Upload your best work so buyers can judge your style.')}
    </section>
  `;
}

function renderListingManager() {
  const ready = isArtistReady(state.payoutAccount);
  const mine = state.listings.filter((listing) => listing.artist_id === state.profile.id);
  return `
    <section class="section-band">
      <div class="split-head"><div><h2>Create listing</h2><p class="muted">Listings are public immediately. Only you and admins can edit your listings.</p></div><span class="status-pill ${ready ? '' : 'warn'}">${ready ? 'Payouts ready' : 'Finish payouts first'}</span></div>
      <form class="form-stack" data-form="listing">
        <div class="form-grid">
          <label>Title<input name="title" required /></label>
          <label>Price<input name="price" type="number" min="1" step="1" required /></label>
          <label>Category<select name="category">${categories.filter((item) => item !== 'All').map((item) => '<option>' + item + '</option>').join('')}</select></label>
          <label>Type<select name="listing_type"><option>Commission slot</option><option>Digital download</option><option>Print</option><option>Sticker</option><option>Keychain</option><option>Emote pack</option><option>Logo</option></select></label>
          <label>Format<select name="format"><option>Digital</option><option>Physical</option><option>Digital and physical</option><option>Custom service</option></select></label>
          <label>Image URL or upload<input name="image_url" placeholder="https://..." /></label>
          <label>Upload image<input name="file" type="file" accept="image/*" /></label>
        </div>
        <label>Description<textarea name="description" rows="5" required></textarea></label>
        <button class="primary" type="submit" ${ready ? '' : 'disabled'}>${icon('i-plus')}Publish listing</button>
      </form>
      <h3>Your listings</h3>
      ${mine.length ? '<div class="product-grid">' + mine.map(renderListingCard).join('') + '</div>' : renderEmpty('No listings yet', 'Create your first listing after payouts are ready.')}
    </section>
  `;
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

function renderUsersTable() {
  return `
    <section class="table-wrap">
      <h2>Users</h2>
      <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>
        ${state.profiles.map((profile) => '<tr><td>' + escapeHtml(profile.display_name) + '</td><td>' + escapeHtml(profile.email) + '</td><td><span class="status-pill">' + escapeHtml(profile.role) + '</span></td><td>' + new Date(profile.created_at).toLocaleDateString() + '</td></tr>').join('')}
      </tbody></table>
    </section>
  `;
}

function renderListingsAdmin() {
  return `
    <section class="table-wrap">
      <h2>Listings</h2>
      <table><thead><tr><th>Title</th><th>Artist</th><th>Price</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${state.listings.map((listing) => '<tr><td>' + escapeHtml(listing.title) + '</td><td>' + escapeHtml(artistName(listing.artist_id)) + '</td><td>' + formatMoney(listing.price_cents) + '</td><td><span class="status-pill">' + escapeHtml(listing.status) + '</span></td><td><button class="danger" data-remove-listing="' + listing.id + '">Remove</button></td></tr>').join('')}
      </tbody></table>
    </section>
  `;
}

function renderOrdersTable(orders, title) {
  return `
    <section class="table-wrap">
      <h2>${escapeHtml(title)}</h2>
      ${orders.length ? '<table><thead><tr><th>Status</th><th>Listing</th><th>Artist</th><th>Amount</th><th>Deliverable</th><th>Date</th></tr></thead><tbody>' +
        orders.map(renderOrderRow).join('') +
      '</tbody></table>' : renderEmpty('No orders yet', 'Orders appear here after checkout.')}
    </section>
  `;
}

function renderOrderRow(order) {
  const listing = listingFor(order.listing_id);
  const canDownload = order.status === 'paid' && listing && listing.image_url && isDigitalListing(listing);
  const deliverable = canDownload
    ? '<button class="secondary compact" data-download-image="' + escapeHtml(listing.image_url) + '" data-download-title="' + escapeHtml(listing.title) + '">' + icon('i-image') + 'Download</button>'
    : order.status === 'paid'
      ? '<span class="muted">Artist delivery</span>'
      : '<span class="muted">Available after payment</span>';

  return '<tr>' +
    '<td><span class="status-pill">' + escapeHtml(order.status) + '</span></td>' +
    '<td>' + escapeHtml(listing ? listing.title : 'Listing') + '</td>' +
    '<td>' + escapeHtml(artistName(order.artist_id)) + '</td>' +
    '<td>' + formatMoney(order.amount_cents) + '</td>' +
    '<td>' + deliverable + '</td>' +
    '<td>' + new Date(order.created_at).toLocaleDateString() + '</td>' +
  '</tr>';
}

function renderRequestsTable(requests, title) {
  return `
    <section class="table-wrap">
      <h2>${escapeHtml(title)}</h2>
      ${requests.length ? '<table><thead><tr><th>Project</th><th>Customer</th><th>Artist</th><th>Budget</th><th>Status</th></tr></thead><tbody>' +
        requests.map((request) => '<tr><td>' + escapeHtml(request.title) + '<br><span class="muted">' + escapeHtml(request.brief).slice(0, 120) + '</span></td><td>' + escapeHtml(request.name) + '</td><td>' + escapeHtml(request.artist_id ? artistName(request.artist_id) : 'Match needed') + '</td><td>' + formatMoney(request.budget_cents) + '</td><td><span class="status-pill">' + escapeHtml(request.status) + '</span></td></tr>').join('') +
      '</tbody></table>' : renderEmpty('No requests yet', 'Commission requests appear here.')}
    </section>
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
  else if (state.view === 'dashboard') app.innerHTML = renderDashboard();
  else app.innerHTML = renderHome();
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
  qs('#authName').disabled = !isSignup;
  qs('#authRole').disabled = !isSignup;
  setAuthBusy(false);
}

async function uploadFile(file) {
  const path = state.profile.id + '/' + Date.now() + '-' + slug(file.name);
  const { error } = await state.supabase.storage.from('portfolio-media').upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = state.supabase.storage.from('portfolio-media').getPublicUrl(path);
  return data.publicUrl;
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
      starting_price_cents: Math.round((Number(data.starting_price) || 0) * 100)
    });
    showToast('Artist profile saved.');
  }

  if (type === 'portfolio') {
    const file = form.elements.file.files[0];
    const mediaUrl = await uploadFile(file);
    await state.supabase.from('portfolio_items').insert({
      artist_id: state.profile.id,
      title: data.title,
      description: data.description || '',
      media_url: mediaUrl
    });
    showToast('Portfolio uploaded.');
  }

  if (type === 'listing') {
    if (!isArtistReady(state.payoutAccount)) {
      showToast('Finish payout setup before posting listings.');
      return;
    }
    const file = form.elements.file.files[0];
    const imageUrl = file ? await uploadFile(file) : data.image_url;
    if (!imageUrl) {
      showToast('Add an image URL or upload an image.');
      return;
    }
    await state.supabase.from('listings').insert({
      artist_id: state.profile.id,
      title: data.title,
      description: data.description,
      category: data.category,
      listing_type: data.listing_type,
      format: data.format,
      price_cents: Math.round(Number(data.price) * 100),
      image_url: imageUrl,
      status: 'active'
    });
    showToast('Listing published.');
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

async function removeListing(id) {
  await state.supabase.from('listings').update({ status: 'removed' }).eq('id', id);
  showToast('Listing removed.');
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
    const download = event.target.closest('[data-download-image]');
    const remove = event.target.closest('[data-remove-listing]');
    const verifyPrimary = event.target.closest('[data-verify-primary]');
    const verifyResend = event.target.closest('[data-resend-verification]');

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
      if (download) await downloadImage(download.dataset.downloadImage, download.dataset.downloadTitle);
      if (remove) await removeListing(remove.dataset.removeListing);
      if (verifyPrimary) openAuth('signin');
      if (verifyResend) await resendVerificationEmail();
    } catch (error) {
      showToast(error.message || 'Something went wrong.');
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'searchInput') {
      state.search = event.target.value;
      render();
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
  await handleVerificationReturn(params);
  if (params.get('payment') === 'success') {
    state.view = 'dashboard';
    state.dashboardTab = 'orders';
    showToast('Payment complete. Your download is in Orders.');
  }
  if (params.get('stripe') === 'return') showToast('Stripe returned you to the dashboard. Check payout status.');
  await refreshAll();
}

init();
