(function () {
  if (window.__AI_RECS_WIDGET_INITIALIZED__) {
    return;
  }
  window.__AI_RECS_WIDGET_INITIALIZED__ = true;

  var TRANSPARENT_GIF =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  function toNumber(value, fallback) {
    var num = parseInt(value, 10);
    return isNaN(num) ? fallback : num;
  }

  function buildUrl(base, path, params) {
    var url = base.replace(/\/$/, "") + path;
    var query = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== "") {
        query.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
      }
    });
    return query.length ? url + "?" + query.join("&") : url;
  }

  function request(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 3000;
    options = options || {};

    if (window.fetch) {
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
      return fetch(url, {
        method: options.method || "GET",
        headers: options.headers || { "Content-Type": "application/json" },
        body: options.body,
        signal: controller ? controller.signal : undefined,
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("Request failed: " + response.status);
          }
          return response.json();
        })
        .finally(function () {
          if (timer) {
            clearTimeout(timer);
          }
        });
    }

    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(options.method || "GET", url, true);
      xhr.timeout = timeoutMs;
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error("Request failed: " + xhr.status));
        }
      };
      xhr.onerror = function () { reject(new Error("Network error")); };
      xhr.ontimeout = function () { reject(new Error("Timeout")); };
      xhr.send(options.body || null);
    });
  }

  function matchesSelector(element, selector) {
    var proto = Element.prototype;
    var matcher = proto.matches || proto.msMatchesSelector || proto.webkitMatchesSelector;
    if (!matcher) return false;
    return matcher.call(element, selector);
  }

  function closestElement(element, selector) {
    if (!element) return null;
    if (element.closest) return element.closest(selector);
    var current = element;
    while (current && current.nodeType === 1) {
      if (matchesSelector(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function toArray(nodeList) {
    return Array.prototype.slice.call(nodeList);
  }

  function parseJsonArray(raw) {
    if (!raw || typeof raw !== "string") return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function normalizeId(value) {
    if (value === undefined || value === null) return "";
    var str = String(value).trim();
    if (!str) return "";
    return str;
  }

  function normalizeCartItemProductIds(cartData) {
    if (!cartData || !Array.isArray(cartData.items)) return [];
    var ids = cartData.items
      .map(function (item) {
        if (!item) return "";
        if (item.product_id !== undefined && item.product_id !== null) return normalizeId(item.product_id);
        if (item.product && item.product.id !== undefined && item.product.id !== null) return normalizeId(item.product.id);
        return "";
      })
      .filter(Boolean);
    return ids;
  }

  function getConfiguredCartProductIds(root) {
    var raw = root.dataset.cartProductIds || "";
    var ids = parseJsonArray(raw).map(normalizeId).filter(Boolean);
    return ids;
  }

  function toBool(value, fallback) {
    if (value === undefined || value === null || value === "") return !!fallback;
    var normalized = String(value).toLowerCase().trim();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
    return !!fallback;
  }

  function queryFirst(root, selectors) {
    if (!root || !selectors || !selectors.length) return null;
    for (var i = 0; i < selectors.length; i += 1) {
      var found = root.querySelector(selectors[i]);
      if (found) return found;
    }
    return null;
  }

  var DRAWER_ROOT_SELECTORS = [
    "cart-drawer",
    "#CartDrawer",
    ".cart-drawer",
    ".drawer--cart",
    "[data-cart-drawer]",
    "cart-notification",
    "#CartNotification",
  ];

  var DRAWER_CONTENT_SELECTORS = [
    ".drawer__inner",
    ".cart-drawer__content",
    ".drawer__contents",
    ".drawer__body",
    ".cart-notification",
  ];

  var DRAWER_FOOTER_SELECTORS = [
    ".drawer__footer",
    ".cart-drawer__footer",
    ".cart-notification__footer",
    "cart-drawer-footer",
    ".drawer__header",
  ];

  var DRAWER_CHECKOUT_SELECTORS = [
    "button[name='checkout']",
    "input[name='checkout']",
    ".cart__checkout-button",
    ".drawer__checkout",
    "a[href*='/checkout']",
  ];

  function getDrawerRoots() {
    var all = [];
    DRAWER_ROOT_SELECTORS.forEach(function (selector) {
      var matches = document.querySelectorAll(selector);
      toArray(matches).forEach(function (el) {
        if (all.indexOf(el) === -1) all.push(el);
      });
    });
    return all;
  }

  function createDrawerWidgetRoot(configEl) {
    var root = document.createElement("div");
    root.className = "ai-rec-drawer-root";
    root.setAttribute("data-ai-recommendations", "");
    root.setAttribute("data-ai-auto-drawer", "true");

    root.dataset.apiBase = configEl.dataset.apiBase || "/apps/recommendations";
    root.dataset.merchant = configEl.dataset.merchant || "";
    root.dataset.customerId = configEl.dataset.customerId || "";
    root.dataset.geoLocation = configEl.dataset.geoLocation || "";
    root.dataset.location = "cart_drawer";
    root.dataset.layout = configEl.dataset.layout || "list";
    root.dataset.limit = configEl.dataset.limit || "3";
    root.dataset.title = configEl.dataset.title || "Complete Your Order";
    root.dataset.subtitle = configEl.dataset.subtitle || "Picked for the items in your cart";
    root.dataset.primaryColor = configEl.dataset.primaryColor || "";

    return root;
  }

  function mountDrawerWidget(drawerRoot, configEl) {
    if (!drawerRoot || !configEl) return;

    var existing = drawerRoot.querySelector('[data-ai-recommendations][data-ai-auto-drawer="true"]');
    if (existing) return;

    var widgetRoot = createDrawerWidgetRoot(configEl);
    var content = queryFirst(drawerRoot, DRAWER_CONTENT_SELECTORS) || drawerRoot;
    var checkoutEl = queryFirst(drawerRoot, DRAWER_CHECKOUT_SELECTORS);
    var footer = queryFirst(content, DRAWER_FOOTER_SELECTORS) || queryFirst(drawerRoot, DRAWER_FOOTER_SELECTORS);

    if (checkoutEl && checkoutEl.parentNode) {
      checkoutEl.parentNode.insertBefore(widgetRoot, checkoutEl);
    } else if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(widgetRoot, footer);
    } else {
      content.appendChild(widgetRoot);
    }

    initWidget(widgetRoot);
  }

  function initCartDrawerAuto() {
    var configEl = document.querySelector("[data-ai-recs-cart-drawer-config]");
    if (!configEl) return;
    if (!toBool(configEl.dataset.enabled, true)) return;

    var scanTimer = null;
    function scheduleScan(delayMs) {
      if (scanTimer) return;
      scanTimer = setTimeout(function () {
        scanTimer = null;
        var drawers = getDrawerRoots();
        drawers.forEach(function (drawerRoot) {
          mountDrawerWidget(drawerRoot, configEl);
        });
      }, delayMs || 120);
    }

    scheduleScan(0);
    window.addEventListener("load", function () { scheduleScan(0); });
    document.addEventListener("click", function () { scheduleScan(200); }, true);
    document.addEventListener("shopify:section:load", function () { scheduleScan(0); });
    document.addEventListener("shopify:section:reorder", function () { scheduleScan(0); });
    document.addEventListener("shopify:section:select", function () { scheduleScan(0); });
    document.addEventListener("shopify:section:deselect", function () { scheduleScan(0); });
    document.addEventListener("cart:updated", function () { scheduleScan(0); });
    document.addEventListener("cart:refresh", function () { scheduleScan(0); });
    document.addEventListener("ajaxProduct:added", function () { scheduleScan(150); });
    document.addEventListener("ajaxProduct:updated", function () { scheduleScan(150); });

    if (typeof MutationObserver !== "undefined") {
      var observer = new MutationObserver(function () {
        scheduleScan(80);
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "open", "aria-hidden"],
      });
    }
  }


  function getHistory() {
    try {
      var raw = localStorage.getItem("ai_rec_history");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function addToHistory(productId) {
    if (!productId) return;
    try {
      var history = getHistory();
      history = history.filter(function (id) { return id !== productId; });
      history.unshift(productId);
      localStorage.setItem("ai_rec_history", JSON.stringify(history.slice(0, 5)));
    } catch (e) { }
  }

  function trackEvent(config, payload) {
    if (config.disableTracking) return;
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;

    var url = buildUrl(config.apiBase, "/api/track/event", {});
    var body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(url, blob);
        return;
      } catch (error) {
        // fallback to fetch
      }
    }

    request(url, { method: "POST", body: body }, 2000).catch(function () { });
  }

  function renderSkeleton(root, count, layout) {
    layout = layout || 'grid';
    var skeletons = [];
    for (var i = 0; i < count; i += 1) {
      if (layout === 'list') {
        skeletons.push('<div class="ai-rec-skeleton-list"></div>');
      } else {
        skeletons.push('<div class="ai-rec-skeleton"></div>');
      }
    }
    var wrapperClass = layout === 'carousel' ? 'ai-rec-loading-carousel'
      : layout === 'list' ? 'ai-rec-loading-list'
        : 'ai-rec-loading';
    root.innerHTML =
      '<div class="ai-rec-widget">' +
      '<div class="ai-rec-header">' +
      '<div>' +
      '<div class="ai-rec-title">Loading recommendations</div>' +
      '<div class="ai-rec-subtitle">Personalizing for this shopper</div>' +
      '</div>' +
      '</div>' +
      '<div class="' + wrapperClass + '">' +
      skeletons.join('') +
      '</div>' +
      '</div>';
  }

  function getItemUrl(item) {
    if (!item) return "#";
    if (item.product_url) return item.product_url;
    if (item.handle) return "/products/" + item.handle;
    return "#";
  }

  function buildCard(item, index, config) {
    var priceHtml =
      '<div class="ai-rec-price">$' +
      item.price +
      (item.compare_at_price
        ? '<span class="ai-rec-compare">$' + item.compare_at_price + "</span>"
        : "") +
      "</div>";

    var ratingHtml = item.rating
      ? '<div class="ai-rec-rating">' + item.rating + " stars</div>"
      : "";

    var buttonLabel = item.variant_id ? "Quick add" : "View";

    var itemUrl = getItemUrl(item);

    return (
      '<div class="ai-rec-card ai-rec-carousel-card" data-rec-id="' +
      item.shopify_product_id +
      '" data-position="' +
      (index + 1) +
      '" data-handle="' +
      (item.handle || '') +
      '">' +
      '<a href="' + itemUrl + '" class="ai-rec-image-link">' +
      '<img class="ai-rec-image" data-src="' +
      item.image +
      '" src="' +
      TRANSPARENT_GIF +
      '" alt="' +
      item.title +
      '" />' +
      '</a>' +
      '<div class="ai-rec-info">' +
      '<a href="' + itemUrl + '" class="ai-rec-name-link">' +
      '<div class="ai-rec-name">' +
      item.title +
      "</div>" +
      '</a>' +
      priceHtml +
      ratingHtml +
      (item.reason
        ? '<div class="ai-rec-reason">' + item.reason + "</div>"
        : "") +
      '</div>' +
      '<a href="' + itemUrl + '" class="ai-rec-button" aria-label="View ' +
      item.title +
      '">' +
      'View product' +
      "</a>" +
      "</div>"
    );
  }

  function renderListItem(item, index) {
    var itemUrl = getItemUrl(item);
    return (
      '<div class="ai-rec-list-item" data-rec-id="' +
      item.shopify_product_id +
      '" data-position="' +
      (index + 1) +
      '" data-handle="' +
      (item.handle || '') +
      '">' +
      '<a href="' + itemUrl + '">' +
      '<img data-src="' +
      item.image +
      '" src="' +
      TRANSPARENT_GIF +
      '" alt="' +
      item.title +
      '" />' +
      '</a>' +
      '<div>' +
      '<div class="ai-rec-name">' +
      item.title +
      "</div>" +
      '<div class="ai-rec-reason">' +
      (item.reason || "Popular with similar shoppers") +
      "</div>" +
      "</div>" +
      '<a href="' + itemUrl + '" class="ai-rec-button" aria-label="View ' +
      item.title +
      '">View</a>' +
      "</div>"
    );
  }

  function renderWidget(root, config, items) {
    var title = config.title || "You Might Also Like";
    var subtitle = config.subtitle || "Recommended based on shopper behavior";
    var layout = config.layout || "grid";
    var cardHtml = items
      .map(function (item, index) {
        return layout === "list" ? renderListItem(item, index) : buildCard(item, index, config);
      })
      .join("");

    var contentClass =
      layout === "carousel" ? "ai-rec-carousel" : layout === "list" ? "ai-rec-list" : "ai-rec-grid";

    var trackClass = layout === "carousel" ? "ai-rec-carousel-track" : "";

    var contentHtml;
    if (layout === 'carousel') {
      contentHtml =
        '<div class="' + contentClass + '">' +
        '<button class="ai-rec-carousel-prev" aria-label="Previous">&#8249;</button>' +
        '<div class="' + trackClass + '">' + cardHtml + '</div>' +
        '<button class="ai-rec-carousel-next" aria-label="Next">&#8250;</button>' +
        '</div>';
    } else {
      contentHtml = '<div class="' + contentClass + '">' + cardHtml + '</div>';
    }

    root.innerHTML =
      '<div class="ai-rec-widget">' +
      '<div class="ai-rec-header">' +
      '<div>' +
      '<div class="ai-rec-title">' +
      title +
      "</div>" +
      '<div class="ai-rec-subtitle">' +
      subtitle +
      "</div>" +
      "</div>" +
      "</div>" +
      contentHtml +
      "</div>";

    if (config.primaryColor) {
      var widget = root.querySelector(".ai-rec-widget");
      if (widget) {
        widget.style.setProperty("--ai-rec-primary", config.primaryColor);
      }
    }

    if (config.location === "popup") {
      wrapPopup(root);
    }
  }

  function wrapPopup(root) {
    var popup = document.createElement("div");
    popup.className = "ai-rec-popup";
    var content = document.createElement("div");
    content.className = "ai-rec-popup-content";
    var close = document.createElement("button");
    close.className = "ai-rec-popup-close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "x";
    close.addEventListener("click", function () {
      popup.classList.remove("is-open");
    });

    content.appendChild(close);
    content.appendChild(root.firstChild);
    popup.appendChild(content);
    document.body.appendChild(popup);

    var shownKey = "ai_rec_popup_shown";
    try {
      if (!sessionStorage.getItem(shownKey)) {
        sessionStorage.setItem(shownKey, "true");
        setTimeout(function () {
          popup.classList.add("is-open");
        }, 30000);
      }
    } catch (error) {
      setTimeout(function () {
        popup.classList.add("is-open");
      }, 30000);
    }
  }

  function lazyLoadImages(root) {
    var images = root.querySelectorAll("img[data-src]");
    if (!("IntersectionObserver" in window)) {
      toArray(images).forEach(function (img) {
        img.src = img.getAttribute("data-src");
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          img.src = img.getAttribute("data-src");
          observer.unobserve(img);
        }
      });
    });

    toArray(images).forEach(function (img) {
      observer.observe(img);
    });
  }

  function addToCart(variantId) {
    if (!variantId) return Promise.resolve();
    return request("/cart/add.js", {
      method: "POST",
      body: JSON.stringify({ id: variantId, quantity: 1 }),
    }, 2000);
  }

  function bindInteractions(root, config, items) {
    root.addEventListener("click", function (event) {
      var button = closestElement(event.target, ".ai-rec-button");
      var card = closestElement(event.target, ".ai-rec-card, .ai-rec-list-item");
      if (!card) return;

      var recId = card.getAttribute("data-rec-id");
      var position = toNumber(card.getAttribute("data-position"), 1);

      trackEvent(config, {
        event_type: "recommendation_clicked",
        merchant_id: config.merchant,
        customer_id: config.customerId || "guest",
        recommendation_id: recId,
        position: position,
        location: config.location,
        timestamp: new Date().toISOString(),
      });

      if (button) {
        var variantId = button.getAttribute("data-variant-id");
        if (variantId) {
          button.textContent = "Adding...";
          addToCart(variantId)
            .then(function () {
              button.textContent = "Added";
              trackEvent(config, {
                event_type: "recommendation_added_to_cart",
                merchant_id: config.merchant,
                customer_id: config.customerId || "guest",
                recommendation_id: recId,
                position: position,
                timestamp: new Date().toISOString(),
              });
            })
            .catch(function () {
              button.textContent = "Add";
            });
        } else if (items && items.length) {
          var item = items[position - 1];
          var itemUrl = getItemUrl(item);
          if (itemUrl && itemUrl !== "#") {
            window.location.href = itemUrl;
          }
        }
      }
    });
  }

  function trackImpression(config, items) {
    trackEvent(config, {
      event_type: "recommendation_shown",
      merchant_id: config.merchant,
      customer_id: config.customerId || "guest",
      product_id: config.productId || "",
      recommendations: items.map(function (item) { return item.shopify_product_id; }),
      location: config.location,
      timestamp: new Date().toISOString(),
    });
  }

  function normalizeItems(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.recommendations) return data.recommendations;
    if (data.products) return data.products;
    return [];
  }

  function clearWidget(root) {
    if (!root) return;
    root.innerHTML = "";
    root.setAttribute("data-ai-rec-empty", "true");
  }

  function renderRecommendations(root, config, items) {
    if (!root || !items || !items.length) return;
    root.removeAttribute("data-ai-rec-empty");
    renderWidget(root, config, items);
    lazyLoadImages(root);
    bindInteractions(root, config, items);
    trackImpression(config, items);
    if (config.layout === 'carousel') initCarouselNav(root);
  }

  function initCarouselNav(root) {
    var carousel = root.querySelector('.ai-rec-carousel');
    if (!carousel) return;
    var track = carousel.querySelector('.ai-rec-carousel-track');
    var prev = carousel.querySelector('.ai-rec-carousel-prev');
    var next = carousel.querySelector('.ai-rec-carousel-next');
    if (!track || !prev || !next) return;

    var rafId = null;
    var resizeObserver = null;
    var mutationObserver = null;
    var isPointerDown = false;
    var pointerStartX = 0;
    var startScrollLeft = 0;
    var movedWhileDragging = false;
    var suppressClickUntil = 0;
    var dragPointerId = null;

    function getCarouselCards() {
      return track.querySelectorAll('.ai-rec-carousel-card');
    }

    function hasTrackOverflow() {
      var maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      if (maxScroll > 2) return true;

      var cards = getCarouselCards();
      if (!cards.length) return false;

      var trackRect = track.getBoundingClientRect();
      var firstRect = cards[0].getBoundingClientRect();
      var lastRect = cards[cards.length - 1].getBoundingClientRect();

      var leftOverflow = firstRect.left < trackRect.left - 2;
      var rightOverflow = lastRect.right > trackRect.right + 2;
      return leftOverflow || rightOverflow;
    }

    function updateArrows() {
      rafId = null;
      var maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      var hasOverflow = hasTrackOverflow();
      var scrollLeft = Math.round(track.scrollLeft);
      carousel.classList.toggle('ai-rec-carousel-has-overflow', hasOverflow);

      if (!hasOverflow) {
        prev.classList.add('ai-rec-arrow-hidden');
        next.classList.add('ai-rec-arrow-hidden');
        return;
      }

      var atStart = scrollLeft <= 1;
      var atEnd = scrollLeft >= maxScroll - 1;

      prev.classList.toggle('ai-rec-arrow-hidden', atStart);
      next.classList.toggle('ai-rec-arrow-hidden', atEnd);

      // Guard rail: if overflow exists, never hide both arrows at once.
      if (prev.classList.contains('ai-rec-arrow-hidden') && next.classList.contains('ai-rec-arrow-hidden')) {
        if (atStart) {
          next.classList.remove('ai-rec-arrow-hidden');
        } else {
          prev.classList.remove('ai-rec-arrow-hidden');
        }
      }
    }

    function scheduleArrowUpdate() {
      if (rafId !== null) return;
      if (window.requestAnimationFrame) {
        rafId = window.requestAnimationFrame(updateArrows);
      } else {
        rafId = setTimeout(updateArrows, 16);
      }
    }

    prev.addEventListener('click', function () {
      track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' });
    });
    next.addEventListener('click', function () {
      track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' });
    });

    function onPointerDown(event) {
      // Keep native touch scrolling/taps untouched; use custom drag only for mouse.
      if (event.pointerType && event.pointerType !== 'mouse') return;
      if (event.button !== 0) return;
      if (closestElement(event.target, 'a, button, input, select, textarea, label')) return;
      isPointerDown = true;
      movedWhileDragging = false;
      dragPointerId = event.pointerId;
      pointerStartX = event.clientX;
      startScrollLeft = track.scrollLeft;
      track.classList.add('ai-rec-dragging');
    }

    function onPointerMove(event) {
      if (!isPointerDown || (dragPointerId !== null && event.pointerId !== dragPointerId)) return;
      var deltaX = event.clientX - pointerStartX;
      if (Math.abs(deltaX) > 10) movedWhileDragging = true;
      track.scrollLeft = startScrollLeft - deltaX;
      scheduleArrowUpdate();
    }

    function endPointerDrag(event) {
      if (!isPointerDown || (dragPointerId !== null && event.pointerId !== dragPointerId)) return;
      if (movedWhileDragging) {
        suppressClickUntil = Date.now() + 250;
      }
      isPointerDown = false;
      dragPointerId = null;
      movedWhileDragging = false;
      track.classList.remove('ai-rec-dragging');
      scheduleArrowUpdate();
    }

    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', endPointerDrag);
    track.addEventListener('pointercancel', endPointerDrag);
    track.addEventListener('pointerleave', endPointerDrag);
    track.addEventListener('click', function (event) {
      if (Date.now() >= suppressClickUntil) return;
      // Prevent accidental click-through after drag scrolling.
      event.preventDefault();
      event.stopPropagation();
    }, true);

    track.addEventListener('scroll', scheduleArrowUpdate, { passive: true });
    window.addEventListener('resize', scheduleArrowUpdate);
    window.addEventListener('load', scheduleArrowUpdate);

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleArrowUpdate);
      resizeObserver.observe(track);
      resizeObserver.observe(carousel);
    }

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(scheduleArrowUpdate);
      mutationObserver.observe(track, { childList: true, subtree: true });
    }

    var images = track.querySelectorAll('img');
    toArray(images).forEach(function (img) {
      if (img.complete) return;
      img.addEventListener('load', scheduleArrowUpdate, { once: true });
      img.addEventListener('error', scheduleArrowUpdate, { once: true });
    });

    // Re-check across the first paint cycle; prevents "sometimes hidden" on slow style/layout.
    scheduleArrowUpdate();
    setTimeout(scheduleArrowUpdate, 0);
    setTimeout(scheduleArrowUpdate, 120);
    setTimeout(scheduleArrowUpdate, 350);
  }

  function getOrCreateGuestId() {
    var key = "ai_rec_guest_id";
    try {
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var id = "guest_" + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
      localStorage.setItem(key, id);
      return id;
    } catch (e) {
      return "guest_" + Math.random().toString(36).substr(2, 12);
    }
  }

  function initWidget(root) {
    var rawCustomerId = root.dataset.customerId || "";
    var effectiveCustomerId = rawCustomerId || getOrCreateGuestId();

    var config = {
      apiBase:
        root.dataset.apiBase ||
        root.dataset.apiUrl ||
        (window.AIRecommendationsConfig ? window.AIRecommendationsConfig.apiBase : "") ||
        "/apps/recommendations",
      merchant: root.dataset.merchant || "",
      productId: root.dataset.productId || "",
      customerId: effectiveCustomerId,
      location: root.dataset.location || "product_page",
      geoLocation: root.dataset.geoLocation || "",
      preferences: root.dataset.preferences || "",
      layout: root.dataset.layout || "grid",
      title: root.dataset.title || "You Might Also Like",
      subtitle: root.dataset.subtitle || "Recommended based on shopper behavior",
      primaryColor: root.dataset.primaryColor || "",
      limit: toNumber(root.dataset.limit, 4),
      disableTracking: root.dataset.disableTracking === "true",
      cartProductIds: getConfiguredCartProductIds(root),
    };

    if (!config.apiBase || !config.merchant) {
      return;
    }

    if (typeof Promise === "undefined") {
      root.innerHTML =
        '<div class="ai-rec-widget">' +
        '<div class="ai-rec-title">Recommended products</div>' +
        '<div class="ai-rec-subtitle">Upgrade your browser to see personalized recommendations.</div>' +
        "</div>";
      return;
    }

    // Track current product view for history
    if (config.productId) {
      addToHistory(config.productId);
      trackEvent(config, {
        event_type: "view",
        merchant_id: config.merchant,
        customer_id: config.customerId,
        product_id: config.productId,
        timestamp: new Date().toISOString()
      });
    }

    var history = getHistory();
    var historyStr = history.length ? JSON.stringify(history) : "";


    // Build cart context from liquid first, then fallback to /cart.js.
    var cartIdsFromLiquid = Array.isArray(config.cartProductIds) ? config.cartProductIds : [];
    var isHomepageColdStart = config.location === "homepage" && !config.productId && !historyStr && cartIdsFromLiquid.length === 0;
    if (!isHomepageColdStart) {
      renderSkeleton(root, config.limit, config.layout);
    }

    var cartIdsPromise = cartIdsFromLiquid.length
      ? Promise.resolve(cartIdsFromLiquid)
      : request("/cart.js", { method: "GET" }).then(normalizeCartItemProductIds).catch(function () { return []; });

    cartIdsPromise
      .then(function (cartData) {
        var cartProductIds = Array.isArray(cartData) ? cartData : [];
        var cartStr = cartProductIds.length ? JSON.stringify(cartProductIds) : "";

        var requestUrl = buildUrl(
          config.apiBase,
          (config.productId || historyStr || cartStr) ? "/api/recommend" : "/api/popular",
          {
            shop: config.merchant,
            productId: config.productId || "",
            customerId: config.customerId,
            location: config.location,
            geoLocation: config.geoLocation,
            preferences: config.preferences,
            history: historyStr,
            cart: cartStr,
            k: config.limit,
          }
        );

        console.log("🚀 ~ widget.js ~ requestUrl:", requestUrl)

        return request(requestUrl, { method: "GET" }, 3000);
      })
      .then(function (data) {
        var items = normalizeItems(data);
        if (!items.length) {
          throw new Error("No recommendations");
        }

        renderRecommendations(root, config, items);
      })
      .catch(function (err) {
        console.warn("Recommendation fetch failed, trying popular:", err.message);
        var fallbackUrl = buildUrl(config.apiBase, "/api/popular", {
          shop: config.merchant,
          customerId: config.customerId,
          geoLocation: config.geoLocation,
          preferences: config.preferences,
          k: config.limit,
        });
        request(fallbackUrl, { method: "GET" }, 3000)
          .then(function (data) {
            var items = normalizeItems(data);
            if (!items.length) {
              clearWidget(root);
              return;
            }
            renderRecommendations(root, config, items);
          })
          .catch(function () {
            clearWidget(root);
          });
      });
  }

  function initAll() {
    var widgets = document.querySelectorAll("[data-ai-recommendations]");
    toArray(widgets).forEach(function (root) {
      initWidget(root);
    });
    initCartDrawerAuto();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
