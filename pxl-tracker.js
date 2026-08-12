(function (window) {
  function detectApiBase() {
    try {
      var script = document.currentScript;
      if (!script || !script.src) {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i].src && scripts[i].src.indexOf('/static/pxl-tracker.js') !== -1) {
            script = scripts[i];
            break;
          }
        }
      }

      if (script && script.src) {
        return script.src.replace(/\/static\/pxl-tracker\.js(?:\?.*)?$/, '');
      }
    } catch (e) {}

    return window.location.origin || '';
  }

  var API_BASE = String(window.PXL_API_BASE || detectApiBase()).replace(/\/+$/, '');
  var DEVICE_KEY = 'pxl_device_uid';
  var MEMBER_PROFILE_KEY = window.PXL_MEMBER_PROFILE_KEY || 'tilda_members_profile5153698';
  var CART_DEBOUNCE_MS = Number(window.PXL_CART_DEBOUNCE_MS) || 8000;
  var CART_SAME_HASH_TTL_MS = Number(window.PXL_CART_SAME_HASH_TTL_MS) || 10 * 60 * 1000;
  var IDENTITY_TTL_MS = Number(window.PXL_IDENTITY_TTL_MS) || 6 * 60 * 60 * 1000;
  var VISIT_TTL_MS = Number(window.PXL_VISIT_TTL_MS) || 30 * 60 * 1000;
  var PRODUCT_VIEW_TTL_MS = Number(window.PXL_PRODUCT_VIEW_TTL_MS) || 6 * 60 * 60 * 1000;
  var PRODUCT_VIEW_MAX_STORED_KEYS = Number(window.PXL_PRODUCT_VIEW_MAX_STORED_KEYS) || 80;
  var POST_MIN_INTERVAL_MS = Number(window.PXL_POST_MIN_INTERVAL_MS) || 500;
  var PRODUCT_RECORD_ID = window.PXL_PRODUCT_RECORD_ID || 'rec2319776031';
  var CHECKOUT_RECORD_ID = window.PXL_CHECKOUT_RECORD_ID || 'rec2297224411';
  var FORM_INJECT_MAX_ATTEMPTS = Number(window.PXL_FORM_INJECT_MAX_ATTEMPTS) || 8;
  var FORM_INJECT_INTERVAL_MS = Number(window.PXL_FORM_INJECT_INTERVAL_MS) || 1000;
  var DEBUG = window.PXL_DEBUG === true || window.PXL_DEBUG === '1';
  var siteCode = window.PXL_SITE_CODE || 'default';
  var CART_CACHE_KEY = DEVICE_KEY + ':cart_state';
  var IDENTITY_CACHE_KEY = DEVICE_KEY + ':identity_state';
  var VISIT_CACHE_KEY = DEVICE_KEY + ':visit_state';
  var PRODUCT_VIEW_CACHE_KEY = DEVICE_KEY + ':product_view_state';

  function debugLog() {
    if (!DEBUG || !window.console || !console.log) return;
    console.log.apply(console, arguments);
  }

  function debugWarn() {
    if (!DEBUG || !window.console || !console.warn) return;
    console.warn.apply(console, arguments);
  }

  function getMemberEmailFromLS() {
    try {
      var raw = localStorage.getItem(MEMBER_PROFILE_KEY);
      if (!raw) return null;

      var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      var email = obj && typeof obj.login === 'string' ? obj.login.trim() : null;
      return normalizeEmail(email);
    } catch (e) {
      return null;
    }
  }

  function normalizeEmail(value) {
    if (typeof value !== 'string') return null;
    var email = value.replace(/\s+/g, '').trim().toLowerCase();
    if (!email) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return email;
  }

  function readJsonStorage(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function getMetaContent(selector) {
    try {
      var node = document.querySelector(selector);
      return node ? (node.getAttribute('content') || node.getAttribute('href') || '').trim() : '';
    } catch (e) {
      return '';
    }
  }

  function getText(selector, root) {
    try {
      var scope = root && root.querySelector ? root : document;
      var node = scope.querySelector(selector);
      return node ? (node.textContent || node.value || '').replace(/\s+/g, ' ').trim() : '';
    } catch (e) {
      return '';
    }
  }

  function parsePrice(value) {
    if (value == null || value === '') return null;
    var numeric = Number(String(value).replace(/\s+/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  }

  function isProductPageUrl(value) {
    if (!value) return false;
    try {
      return /\/tproduct\//.test(new URL(value, window.location.href).pathname);
    } catch (e) {
      return /\/tproduct\//.test(String(value));
    }
  }

  function getProductPageUrl() {
    var urls = [
      getMetaContent('link[rel="canonical"]'),
      getMetaContent('meta[property="og:url"]'),
      window.location.href || ''
    ];

    for (var i = 0; i < urls.length; i++) {
      if (!isProductPageUrl(urls[i])) continue;
      try {
        return new URL(urls[i], window.location.href).href;
      } catch (e) {
        return urls[i];
      }
    }

    return '';
  }

  function post(path, data) {
    var url = API_BASE + path;
    var payload = Object.assign({ site_code: siteCode }, data || {});
    var payloadText = JSON.stringify(payload);
    var now = Date.now();
    var delay = Math.max(0, nextPostAt - now);

    nextPostAt = Math.max(nextPostAt, now) + POST_MIN_INTERVAL_MS;

    debugLog('[pxl] POST', url, payload);

    return new Promise(function (resolve) {
      setTimeout(function () {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: payloadText,
          credentials: 'omit',
          cache: 'no-store'
        })
          .then(function (res) {
            debugLog('[pxl] Response', url, res.status);
            resolve(res);
          })
          .catch(function (e) {
            debugWarn('[pxl] request error', e);
            resolve();
          });
      }, delay);
    });
  }

  function postImmediately(path, data) {
    var url = API_BASE + path;
    var payload = Object.assign({ site_code: siteCode }, data || {});

    debugLog('[pxl] immediate POST', url, payload);

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true
    }).catch(function (e) {
      debugWarn('[pxl] immediate request error', e);
    });
  }

  function normalizeUrlForKey(value) {
    if (!value) return '';
    try {
      var url = new URL(value, window.location.href);
      url.hash = '';
      [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
        'fbclid',
        'yclid',
        'gclid'
      ].forEach(function (key) {
        url.searchParams.delete(key);
      });
      return url.href;
    } catch (e) {
      return String(value || '').split('#')[0];
    }
  }

  function generateUid() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'pxl_' + Math.random().toString(36).slice(2) + Date.now();
  }

  function getDeviceUid() {
    try {
      var uid = localStorage.getItem(DEVICE_KEY);
      if (!uid) {
        uid = generateUid();
        localStorage.setItem(DEVICE_KEY, uid);
        debugLog('[pxl] New deviceUid generated and saved:', uid);
      } else {
        debugLog('[pxl] Existing deviceUid from localStorage:', uid);
      }
      return uid;
    } catch (e) {
      debugWarn('[pxl] getDeviceUid error, using fallback uid', e);
      var tmp = generateUid();
      debugLog('[pxl] Fallback deviceUid:', tmp);
      return tmp;
    }
  }

  var deviceUid = getDeviceUid();
  var lastIdentifiedEmail = null;
  var cartTimer = null;
  var nextPostAt = 0;

  function trackVisit(options) {
    var now = Date.now();
    var state = readJsonStorage(VISIT_CACHE_KEY) || {};

    if (state.sentAt && now - Number(state.sentAt || 0) < VISIT_TTL_MS && !(options && options.force)) {
      debugLog('[pxl] skip duplicate visit ping');
      return Promise.resolve();
    }

    writeJsonStorage(VISIT_CACHE_KEY, {
      sentAt: now,
      path: window.location.pathname || '/'
    });

    return post('/visit', {
      deviceUid: deviceUid,
      site_code: siteCode,
      path: window.location.pathname || '/',
      url: window.location.href || '',
      referrer: document.referrer || '',
      title: document.title || ''
    });
  }

  function injectTrackingMetaIntoCart() {
    var MAX_ATTEMPTS = FORM_INJECT_MAX_ATTEMPTS;
    var attempts = 0;

    function pushUnique(list, node) {
      if (!node || list.indexOf(node) !== -1) return;
      list.push(node);
    }

    function getTrackingContainers() {
      var containers = [];

      [
        '.t706__cartwin form',
        '.t706__cartwin .t-form',
        '.t706__cartwin'
      ].forEach(function (selector) {
        try {
          var found = document.querySelectorAll(selector);
          Array.prototype.forEach.call(found, function (node) {
            pushUnique(containers, node);
          });
        } catch (e) {}
      });

      try {
        var forms = document.querySelectorAll('form');
        Array.prototype.forEach.call(forms, function (form) {
          var submitLike = form.querySelector('button[type="submit"], input[type="submit"], .t-submit');
          if (form.closest('.t706__cartwin') || isCheckoutSubmitButton(submitLike)) {
            pushUnique(containers, form);
          }
        });
      } catch (e) {}

      return containers;
    }

    function ensureHiddenInput(container, name, value) {
      if (!container || !container.querySelector || !container.appendChild) return null;

      var input = null;
      try {
        input = container.querySelector('input[name="' + name + '"]');
      } catch (e) {}

      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.setAttribute('data-pxl-created', '1');
        container.appendChild(input);
      }

      input.value = value;
      return input;
    }

    function setValueIfFound() {
      var uidInputs = document.querySelectorAll('input[name="pxl_device_uid"]');
      var siteInputs = document.querySelectorAll('input[name="site_code"]');
      var found = false;

      if (uidInputs && uidInputs.length) {
        uidInputs.forEach(function (input) {
        input.value = deviceUid;
        });
        found = true;
        debugLog('[pxl] pxl_device_uid attached to', uidInputs.length, 'inputs');
      }

      if (siteInputs && siteInputs.length) {
        siteInputs.forEach(function (input) {
        input.value = siteCode;
        });
        found = true;
        debugLog('[pxl] site_code attached to', siteInputs.length, 'inputs');
      }

      getTrackingContainers().forEach(function (container) {
        if (ensureHiddenInput(container, 'pxl_device_uid', deviceUid)) found = true;
        if (ensureHiddenInput(container, 'site_code', siteCode)) found = true;
      });

      return found;
    }

    function tryAttach() {
      var found = setValueIfFound();
      attempts++;
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(tryAttach, FORM_INJECT_INTERVAL_MS);
      } else {
        if (!found) debugWarn('[pxl] tracking inputs not found after', MAX_ATTEMPTS, 'attempts');
      }
    }

    tryAttach();
  }

  function trackProductView(product) {
    var payload = {
      deviceUid: deviceUid,
      site_code: siteCode,
      product: product || {}
    };
    debugLog('[pxl] trackProductView', payload);
    return post('/product/view', payload);
  }

  function getImageUrlFromNode(node) {
    if (!node) return '';

    var url =
      node.getAttribute('data-original') ||
      node.getAttribute('data-img-zoom-url') ||
      node.getAttribute('content') ||
      node.getAttribute('src') ||
      node.getAttribute('data-src') ||
      '';

    if (url) return url.trim();

    var backgroundImage = '';
    try {
      backgroundImage = (node.style && node.style.backgroundImage) || window.getComputedStyle(node).backgroundImage || '';
    } catch (e) {}

    var match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
    return match && match[2] ? match[2].trim() : '';
  }

  function getProductImageFromDom(root) {
    var scope = root && root.querySelector ? root : document;
    var selectors = [
      '.t-slds__item_active .js-product-img',
      '.t-slds__item_active .t-slds__bgimg[data-original]',
      '.t-slds__item_active [itemprop="image"][content]',
      '.t-store__prod-popup__slider .js-product-img',
      '.t-store__prod-popup__gallery .js-product-img',
      '.t-slds__bgimg[data-original]',
      '.t-slds__imgwrapper[data-img-zoom-url]',
      '.t-store__prod-popup__slider img[src]',
      '.t-store__prod-popup__gallery img[src]',
      '.t-store__prod-popup__img[src]',
      '.js-product-img[data-original]',
      '.js-product-img[src]',
      '[itemprop="image"][content]',
      '[itemprop="image"][src]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var node = scope.querySelector(selectors[i]);
        if (!node) continue;
        var url = getImageUrlFromNode(node);
        if (url) return url.trim();
      } catch (e) {}
    }

    return '';
  }

  function getProductPriceFromDom(root) {
    var scope = root && root.querySelector ? root : document;
    var selectors = [
      '.js-product-price',
      '.js-store-prod-price-val',
      '.t-store__prod-popup__price-value',
      '[itemprop="price"][content]',
      '[itemprop="lowPrice"][content]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var node = scope.querySelector(selectors[i]);
        if (!node) continue;
        var value =
          node.getAttribute('data-product-price-def') ||
          node.getAttribute('content') ||
          node.textContent ||
          '';
        var price = parsePrice(value);
        if (price != null) return price;
      } catch (e) {}
    }

    return null;
  }

  function isLikelyProductPage() {
    return !!getProductPageUrl();
  }

  function getProductRoot() {
    try {
      var record = document.getElementById(PRODUCT_RECORD_ID);
      if (record) {
        return record.querySelector('.t-store__product-snippet, .t-store__product-popup, .js-product') || record;
      }
    } catch (e) {}

    try {
      return document.querySelector('.t-store__product-snippet, .t-store__product-popup, .js-product');
    } catch (e) {
      return null;
    }
  }

  function detectProductFromPage() {
    if (!isLikelyProductPage()) return null;

    var productRoot = getProductRoot();

    var name =
      getText('.js-store-prod-name', productRoot) ||
      getText('.js-product-name', productRoot) ||
      getText('[itemprop="name"]', productRoot) ||
      getMetaContent('meta[property="og:title"]') ||
      (document.title || '').replace(/\s+/g, ' ').trim();
    var url = getProductPageUrl();
    var img = getProductImageFromDom(productRoot) || getMetaContent('meta[property="og:image"]') || getMetaContent('meta[name="twitter:image"]');
    var price = getProductPriceFromDom(productRoot);

    if (!name || !url) return null;

    return {
      name: name,
      price: price,
      url: url,
      img: img || null
    };
  }

  function shouldSendProductView(product) {
    var now = Date.now();
    var key = normalizeUrlForKey(product.url) || [product.name || '', product.price || ''].join('|');
    var state = readJsonStorage(PRODUCT_VIEW_CACHE_KEY) || {};
    var sent = state.sent || {};

    Object.keys(sent).forEach(function (storedKey) {
      if (now - Number(sent[storedKey] || 0) > PRODUCT_VIEW_TTL_MS) {
        delete sent[storedKey];
      }
    });

    if (sent[key] && now - Number(sent[key] || 0) < PRODUCT_VIEW_TTL_MS) {
      debugLog('[pxl] skip duplicate product view');
      return false;
    }

    sent[key] = now;

    var keys = Object.keys(sent).sort(function (a, b) {
      return Number(sent[b] || 0) - Number(sent[a] || 0);
    });

    if (keys.length > PRODUCT_VIEW_MAX_STORED_KEYS) {
      keys.slice(PRODUCT_VIEW_MAX_STORED_KEYS).forEach(function (oldKey) {
        delete sent[oldKey];
      });
    }

    writeJsonStorage(PRODUCT_VIEW_CACHE_KEY, {
      sent: sent,
      lastKey: key,
      sentAt: now
    });

    return true;
  }

  function trackProductPageView(options) {
    var product = detectProductFromPage();
    if (product && !product.img && !(options && options.allowWithoutImage)) {
      debugLog('[pxl] product view waits for image');
      return Promise.resolve();
    }
    if (!product || !shouldSendProductView(product)) return Promise.resolve();
    return trackProductView(product);
  }

  function initProductViewTracking() {
    setTimeout(trackProductPageView, 1200);
    setTimeout(function () {
      trackProductPageView({ allowWithoutImage: true });
    }, 3500);

    document.addEventListener('tStoreRendered', function () {
      setTimeout(trackProductPageView, 300);
    }, true);
  }

  function cartHash(items) {
    return JSON.stringify(items || []);
  }

  function shouldSendCart(normalized, options) {
    var hash = cartHash(normalized);
    var hasItems = normalized.length > 0;
    var now = Date.now();
    var state = readJsonStorage(CART_CACHE_KEY) || {};

    if (!hasItems && !state.hadItems && !(options && options.force)) {
      debugLog('[pxl] skip empty cart without previous cart');
      return null;
    }

    if (state.hash === hash && now - Number(state.sentAt || 0) < CART_SAME_HASH_TTL_MS && !(options && options.force)) {
      debugLog('[pxl] skip duplicate cart hash');
      return null;
    }

    writeJsonStorage(CART_CACHE_KEY, {
      hash: hash,
      sentAt: now,
      hadItems: hasItems
    });

    return hash;
  }

  function normalizeTrackedCartItems(items) {
    return (items || []).map(function (item) {
      return {
        name: item.name,
        price: item.price,
        url: item.url,
        img: item.img,
        quantity: item.quantity || 1
      };
    }).filter(function (item) {
      return !!item.name;
    });
  }

  function trackCart(items, options) {
    var normalized = normalizeTrackedCartItems(items);

    if (!shouldSendCart(normalized, options || {})) return Promise.resolve();

    var payload = {
      deviceUid: deviceUid,
      site_code: siteCode,
      items: normalized
    };
    debugLog('[pxl] trackCart', payload);
    return post('/cart/update', payload);
  }

  function getTildaCartItems() {
    if (window.tcart && Array.isArray(window.tcart.products)) {
      return window.tcart.products.slice();
    }
    debugWarn('[pxl] tcart.products not found, cannot send cart');
    return [];
  }

  function scheduleCartSend(options) {
    if (cartTimer) clearTimeout(cartTimer);
    cartTimer = setTimeout(function () {
      var items = getTildaCartItems();
      if (!window.tcart) {
        debugLog('[pxl] tcart missing, skip trackCart');
        return;
      }
      debugLog('[pxl] trackCart after debounce, items:', items);
      trackCart(items || [], options || {});
    }, CART_DEBOUNCE_MS);
  }

  function initCartButtonsTracking() {
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;

      var plus = target.closest('.t706__product-plus');
      var minus = target.closest('.t706__product-minus');
      var del = target.closest('.t706__product-del');
      var add = target.closest('[href*="/cart/add"], [onclick*="cart"], .t-store__card__btn, .t-store__prod-popup__btn, .t1002__addBtn');

      if (plus || minus || del || add) {
        debugLog('[pxl] cart action detected');
        scheduleCartSend();
      }
    });
  }

  function identifyEmail(email, source) {
    var normalized = normalizeEmail(email);
    if (!normalized) return Promise.resolve();
    if (lastIdentifiedEmail === normalized) return Promise.resolve();

    var state = readJsonStorage(IDENTITY_CACHE_KEY) || {};
    if (state.email === normalized && Date.now() - Number(state.sentAt || 0) < IDENTITY_TTL_MS) {
      lastIdentifiedEmail = normalized;
      debugLog('[pxl] skip duplicate identity for', normalized);
      return Promise.resolve();
    }

    lastIdentifiedEmail = normalized;
    writeJsonStorage(IDENTITY_CACHE_KEY, {
      email: normalized,
      sentAt: Date.now()
    });

    var payload = {
      deviceUid: deviceUid,
      site_code: siteCode,
      email: normalized
    };

    debugLog('[pxl] identifyEmail (' + (source || 'unknown') + ') -> /identity payload', payload);
    return post('/identity', payload);
  }

  function getCandidateEmailInputs(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = [];
    var seen = [];

    function pushNode(node) {
      if (!node || node.tagName !== 'INPUT') return;
      if (seen.indexOf(node) !== -1) return;
      seen.push(node);
      nodes.push(node);
    }

    var selectors = [
      'input[type="email"]',
      'input[name="email" i]',
      'input[name*="email" i]',
      'input[name*="mail" i]',
      'input[id*="email" i]',
      'input[id*="mail" i]',
      'input[data-field-name*="email" i]',
      'input[data-field-name*="mail" i]',
      'input[data-tilda-name*="email" i]',
      'input[data-tilda-name*="mail" i]',
      'input[placeholder*="email" i]',
      'input[placeholder*="mail" i]',
      'input[autocomplete="email" i]'
    ];

    selectors.forEach(function (selector) {
      try {
        var found = scope.querySelectorAll(selector);
        if (found && found.length) {
          Array.prototype.forEach.call(found, pushNode);
        }
      } catch (e) {}
    });

    if (root && root.tagName === 'INPUT') {
      var type = (root.getAttribute('type') || '').toLowerCase();
      var name = (root.getAttribute('name') || '').toLowerCase();
      var id = (root.getAttribute('id') || '').toLowerCase();
      var placeholder = (root.getAttribute('placeholder') || '').toLowerCase();
      var autocomplete = (root.getAttribute('autocomplete') || '').toLowerCase();
      if (
        type === 'email' ||
        name.indexOf('email') !== -1 ||
        id.indexOf('email') !== -1 ||
        placeholder.indexOf('mail') !== -1 ||
        autocomplete === 'email'
      ) {
        pushNode(root);
      }
    }

    return nodes;
  }

  function findTrackedEmailInDom(root) {
    var inputs = getCandidateEmailInputs(root);
    for (var i = 0; i < inputs.length; i++) {
      var normalized = normalizeEmail(inputs[i].value);
      if (normalized) return normalized;
    }

    var scope = root && root.querySelectorAll ? root : document;
    try {
      var allInputs = scope.querySelectorAll('input');
      for (var j = 0; j < allInputs.length; j++) {
        var fallbackEmail = normalizeEmail(allInputs[j].value);
        if (fallbackEmail) return fallbackEmail;
      }
    } catch (e) {}

    return null;
  }

  function isCheckoutSubmitButton(node) {
    if (!node || !node.closest) return false;

    var record = node.closest('#' + CHECKOUT_RECORD_ID);
    var submitContainer = node.closest('.t-form__submit');
    if (!record || !submitContainer || !record.contains(submitContainer)) return false;

    var text = '';
    try {
      var label = node.querySelector('.t-btnflex__text');
      text = ((label && label.textContent) || node.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    } catch (e) {}

    return text === 'оформить заказ';
  }

  function getCheckoutRoot(node) {
    if (!node || !node.closest) return document;
    return (
      node.closest('#' + CHECKOUT_RECORD_ID) ||
      node.form ||
      node.closest('form') ||
      node.closest('.t706__cartwin') ||
      node.closest('.t-popup') ||
      node.closest('.t-form') ||
      document
    );
  }

  function isCheckoutPolicyChecked(root) {
    var scope = root && root.querySelector ? root : document;
    var checkbox = null;

    try {
      checkbox =
        scope.querySelector('.t-input-group[data-input-lid="6722972214916"] input[type="checkbox"][name="policy"]') ||
        scope.querySelector('input[type="checkbox"][name="policy"]');
    } catch (e) {}

    return !!(checkbox && checkbox.checked);
  }

  function recordCheckoutAttempt(sourceNode) {
    injectTrackingMetaIntoCart();

    var root = getCheckoutRoot(sourceNode);
    if (!isCheckoutPolicyChecked(root)) {
      debugLog('[pxl] checkout email skipped: policy checkbox is not checked');
      return;
    }

    var email = findTrackedEmailInDom(root) || getMemberEmailFromLS();
    if (!email) {
      debugWarn('[pxl] checkout email not found in form');
      return;
    }

    var items = normalizeTrackedCartItems(getTildaCartItems());
    if (!items.length) {
      debugWarn('[pxl] checkout attempt skipped: cart is empty');
      return;
    }

    postImmediately('/checkout/attempt', {
      deviceUid: deviceUid,
      email: email,
      items: items,
      policyAccepted: true,
      source: 'checkout-button-click'
    });
  }

  function initEmailTracking() {
    var loginEmail = getMemberEmailFromLS();
    if (loginEmail) {
      identifyEmail(loginEmail, 'members-localstorage');
    }

    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;

      var submitLike = target.closest('button[type="submit"], input[type="submit"], .t-submit');
      if (!submitLike || !isCheckoutSubmitButton(submitLike)) return;

      recordCheckoutAttempt(submitLike);
    }, true);
  }

  function pxl() {
    var args = Array.prototype.slice.call(arguments);
    var cmd = args[0];
    var payload = args[1];

    try {
      switch (cmd) {
        case 'getDeviceUid':
          return deviceUid;

        case 'getSiteCode':
          return siteCode;

        case 'injectDeviceUidIntoCart':
        case 'injectTrackingMetaIntoCart':
          injectTrackingMetaIntoCart();
          break;

        case 'trackProductView':
          if (payload && shouldSendProductView(payload)) {
            trackProductView(payload);
          }
          break;

        case 'trackVisit':
          trackVisit({ force: true });
          break;

        case 'trackCart':
          trackCart(payload || []);
          break;

        case 'identifyEmail':
          debugWarn('[pxl] identifyEmail command is disabled; email is collected only from LK or checkout submit');
          break;

        default:
          debugWarn('[pxl] Unknown command', cmd);
      }
    } catch (e) {
      if (console && console.error) {
        console.error('[pxl] command error', cmd, e);
      }
    }
  }

  var q = (window.pxl && window.pxl.q) || [];
  window.pxl = pxl;
  pxl.q = [];

  q.forEach(function (args) {
    pxl.apply(null, args);
  });

  function initPxl() {
    debugLog('[pxl] init site_code =', siteCode);
    trackVisit();
    injectTrackingMetaIntoCart();
    initCartButtonsTracking();
    initEmailTracking();
    initProductViewTracking();

    setTimeout(function () {
      if (!window.tcart) return;
      try {
        var items = getTildaCartItems() || [];
        if (items.length) {
          trackCart(items, { source: 'initial-non-empty-cart' });
        }
      } catch (e) {}
    }, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPxl);
  } else {
    initPxl();
  }
})(window);
