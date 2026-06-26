const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const artists = [
  {
    id: 'mira',
    name: 'Mira Vale',
    handle: '@miravale',
    image: './assets/artist-mira.svg',
    specialty: 'Anime character sheets and expressive portraits',
    bio: 'Clean line work, bright color, and character design packages for streamers, writers, and fandom clients.',
    categories: ['Anime', 'Character Art', 'VTuber', 'Emotes'],
    tags: ['anime', 'character art', 'vtuber', 'emotes'],
    base: 65,
    rating: 4.9,
    reviews: 128,
    responseHours: 4,
    availability: '5 slots open',
    packages: [['Sketch concept', 65], ['Full color portrait', 140], ['Character sheet', 220]],
    reviewQuotes: [['Ari', 'Clear updates and the final sheet was exactly what I needed.'], ['Jules', 'Fast revisions, clean files, and a perfect expression set.']]
  },
  {
    id: 'jo',
    name: 'Jo Rivera',
    handle: '@jorivera',
    image: './assets/artist-jo.svg',
    specialty: 'Realistic pet portraits and warm gift art',
    bio: 'Painterly pet portraits, memorial pieces, and gift prints with optional framing.',
    categories: ['Realism', 'Pets', 'Landscapes'],
    tags: ['pets', 'realism', 'portrait', 'landscape'],
    base: 85,
    rating: 5,
    reviews: 96,
    responseHours: 7,
    availability: '3 slots open',
    packages: [['Digital pet portrait', 85], ['Print-ready portrait', 150], ['Two-pet scene', 245]],
    reviewQuotes: [['Maya', 'The portrait looked like my dog without feeling like a photo filter.'], ['Ken', 'Beautiful print file and a kind process from start to finish.']]
  },
  {
    id: 'rin',
    name: 'Rin Calder',
    handle: '@rincalder',
    image: './assets/artist-rin.svg',
    specialty: 'Fantasy splash art and creature design',
    bio: 'Dramatic fantasy scenes, monsters, tabletop character art, and book-cover style illustrations.',
    categories: ['Fantasy', 'Character Art', 'Landscapes'],
    tags: ['fantasy', 'dragons', 'tabletop', 'landscapes'],
    base: 110,
    rating: 4.8,
    reviews: 74,
    responseHours: 12,
    availability: '2 slots open',
    packages: [['Creature sketch', 110], ['Fantasy character', 260], ['Full scene', 520]],
    reviewQuotes: [['Sam', 'Rin turned a messy campaign idea into a scene with real atmosphere.'], ['Nora', 'The creature design was original, readable, and ready for print.']]
  },
  {
    id: 'sol',
    name: 'Sol Kim',
    handle: '@solmarks',
    image: './assets/artist-sol.svg',
    specialty: 'Logos, icons, and small brand kits',
    bio: 'Simple visual identity work for creators, indie shops, Discord servers, and small product launches.',
    categories: ['Logos', 'Digital Downloads'],
    tags: ['logos', 'brand', 'icons', 'stickers'],
    base: 95,
    rating: 4.7,
    reviews: 58,
    responseHours: 3,
    availability: '8 slots open',
    packages: [['Logo concept', 95], ['Logo and icon set', 190], ['Mini brand kit', 360]],
    reviewQuotes: [['Theo', 'Sol made the mark feel professional without losing the handmade vibe.'], ['Ivy', 'Great files, clear licensing, and quick color variations.']]
  },
  {
    id: 'nova',
    name: 'Nova Ash',
    handle: '@novaash',
    image: './assets/artist-nova.svg',
    specialty: 'VTuber model art, badges, and stream emotes',
    bio: 'Stream-ready art packs with layered files, badge sets, emotes, and mascot expressions.',
    categories: ['VTuber', 'Emotes', 'Anime'],
    tags: ['vtuber', 'emotes', 'badges', 'anime'],
    base: 120,
    rating: 4.9,
    reviews: 112,
    responseHours: 5,
    availability: '4 slots open',
    packages: [['Emote pack', 120], ['Badge set', 150], ['Model art base', 480]],
    reviewQuotes: [['Lux', 'The emotes read clearly even when they were tiny.'], ['Rae', 'Layered files were organized and ready for my rigger.']]
  },
  {
    id: 'eli',
    name: 'Eli Stone',
    handle: '@elistone',
    image: './assets/artist-eli.svg',
    specialty: 'Landscapes, posters, and cinematic backgrounds',
    bio: 'Atmospheric landscapes for posters, albums, games, and personal prints.',
    categories: ['Landscapes', 'Fantasy', 'Realism'],
    tags: ['landscape', 'poster', 'background', 'fantasy'],
    base: 75,
    rating: 4.8,
    reviews: 67,
    responseHours: 9,
    availability: '6 slots open',
    packages: [['Landscape sketch', 75], ['Poster illustration', 180], ['Cinematic background', 320]],
    reviewQuotes: [['Dee', 'The poster felt huge and detailed without getting muddy.'], ['Ren', 'Eli nailed the color mood from a tiny reference board.']]
  }
];

const products = [
  { title: 'Fantasy print set', artist: 'Rin Calder', type: 'Print', price: 34, image: './assets/product-print.svg' },
  { title: 'Streamer emote pack', artist: 'Nova Ash', type: 'Digital download', price: 18, image: './assets/artist-nova.svg' },
  { title: 'Pet sticker sheet', artist: 'Jo Rivera', type: 'Stickers', price: 12, image: './assets/product-stickers.svg' },
  { title: 'Logo starter kit', artist: 'Sol Kim', type: 'Digital download', price: 28, image: './assets/artist-sol.svg' },
  { title: 'Character keychain', artist: 'Mira Vale', type: 'Keychain', price: 16, image: './assets/product-keychain.svg' },
  { title: 'Landscape wallpaper pack', artist: 'Eli Stone', type: 'Digital download', price: 9, image: './assets/artist-eli.svg' }
];

const categories = ['All', 'Anime', 'Realism', 'Fantasy', 'Character Art', 'Logos', 'VTuber', 'Pets', 'Landscapes', 'Emotes'];
const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));

let selectedCategory = 'All';
let selectedArtistId = 'mira';
let artistApplications = [
  ['Lena Park', 'Fantasy', 90, 'Portfolio review'],
  ['Marco Reed', 'Logos', 120, 'Portfolio review']
];
let orders = [
  ['Taylor', 'Mira Vale', 'Character sheet', 'In review', 220],
  ['Morgan', 'Jo Rivera', 'Pet portrait', 'Quoted', 150],
  ['Chris', 'Nova Ash', 'Emote pack', 'Sketching', 120]
];

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
  return artists.find((artist) => artist.id === artistId) || artists[0];
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
  qs('#emptyState').hidden = list.length > 0;
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
    ['Response time', artist.responseHours + ' hours'],
    ['Reviews', artist.reviews + ' reviews'],
    ['Rating', artist.rating.toFixed(1) + ' out of 5']
  ].map((row) => '<div class="fact-row"><span>' + escapeHtml(row[0]) + '</span><strong>' + escapeHtml(row[1]) + '</strong></div>').join('');
  qs('#profilePrices').innerHTML = artist.packages.map((row) => '<div class="price-row"><span>' + escapeHtml(row[0]) + '</span><strong>' + formatMoney(row[1]) + '</strong></div>').join('');
  qs('#profileReviews').innerHTML = artist.reviewQuotes.map((row) => '<div class="review-card"><strong>' + escapeHtml(row[0]) + '</strong><p>' + escapeHtml(row[1]) + '</p></div>').join('');
  const gallery = [artist.image].concat(artists.filter((item) => item.id !== artist.id).slice(0, 2).map((item) => item.image));
  qs('#profileGallery').innerHTML = gallery.map((src, index) => '<img src="' + src + '" alt="' + escapeHtml(artist.name) + ' gallery sample ' + (index + 1) + '" />').join('');
}

function renderProducts() {
  qs('#productGrid').innerHTML = products.map((product) => (
    '<article class="product-card">' +
      '<img src="' + product.image + '" alt="' + escapeHtml(product.title) + '" />' +
      '<div class="product-card-body">' +
        '<div class="product-title"><div><h3>' + escapeHtml(product.title) + '</h3><span>' + escapeHtml(product.artist) + '</span></div><strong>' + formatMoney(product.price) + '</strong></div>' +
        '<div class="tag-row"><span>' + escapeHtml(product.type) + '</span></div>' +
        '<button class="secondary" type="button">' + icon('i-cart') + 'Save item</button>' +
      '</div>' +
    '</article>'
  )).join('');
}

function populateArtistSelect() {
  qs('#artistSelect').innerHTML = artists.map((artist) => '<option value="' + artist.id + '">' + escapeHtml(artist.name) + ' - from ' + formatMoney(artist.base) + '</option>').join('');
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
    ['Applications', String(artistApplications.length)]
  ];
  qs('#metricGrid').innerHTML = metrics.map((row) => '<div class="metric-card"><span>' + row[0] + '</span><strong>' + row[1] + '</strong></div>').join('');
  qs('#ordersTable').innerHTML = orders.map((order) => (
    '<tr><td>' + escapeHtml(order[0]) + '</td><td>' + escapeHtml(order[1]) + '</td><td>' + escapeHtml(order[2]) + '</td><td><span class="status-pill">' + escapeHtml(order[3]) + '</span></td><td>' + formatMoney(order[4]) + '</td></tr>'
  )).join('');
  qs('#listingHealth').innerHTML = artists.slice(0, 4).map((artist) => '<div class="listing-row"><span>' + escapeHtml(artist.name) + '</span><strong>' + escapeHtml(artist.availability) + '</strong></div>').join('');
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

  qs('#commissionForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const artist = findArtist(qs('#artistSelect').value);
    const typeLabel = qs('#commissionType').selectedOptions[0].textContent;
    const quote = currentQuote();
    orders = [[qs('#clientName').value || 'New customer', artist.name, typeLabel, 'New request', quote]].concat(orders);
    renderDashboard();
    showToast('Commission request added to the dashboard preview.');
  });

  qs('#depositButton').addEventListener('click', () => showToast('Payments are paused for this clean version. Get the site live first, then add Stripe.'));
  qs('#sendMessageButton').addEventListener('click', () => {
    const input = qs('#messageInput');
    const text = input.value.trim();
    if (!text) return;
    qs('#messageList').insertAdjacentHTML('beforeend', '<div class="message customer">' + escapeHtml(text) + '</div>');
    input.value = '';
    qs('#messageList').scrollTop = qs('#messageList').scrollHeight;
  });
  qs('#addListingButton').addEventListener('click', () => showToast('Listing creation will come after artist applications are live.'));

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
}

init();
