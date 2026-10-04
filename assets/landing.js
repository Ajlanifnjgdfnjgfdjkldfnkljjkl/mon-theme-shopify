/**
 * Landing produit — JavaScript (vanilla, chargé en `defer` par layout/landing.liquid).
 *
 * Custom elements (réinitialisés automatiquement quand l'éditeur de thème recharge une section) :
 *   <lp-countdown>   compte à rebours HH:MM:SS (minuit heure locale ou date fixe)
 *   <lp-header>      menu burger mobile
 *   <lp-product>     galerie, coloris, packs, prix, stock, ajout au panier AJAX, barre CTA mobile
 *   <lp-cart-drawer> panier coulissant (AJAX API : /cart/add.js, /cart.js, /cart/change.js)
 *   <lp-video>       vidéo muette chargée au scroll, lecture/pause selon la visibilité
 *   <lp-carousel>    flèches du carrousel de témoignages
 *   <lp-accordion>   FAQ (transition max-height)
 *
 * Événements document :
 *   lp:cart:open                      ouvre le panier
 *   lp:cart:refresh { open: bool }    recharge /cart.js puis (option) ouvre le panier
 *   lp:variant:change { variant }     variante sélectionnée modifiée
 */
(() => {
  'use strict';

  const CONFIG = window.LP_CONFIG || {};
  const ROUTES = Object.assign(
    { cartAdd: '/cart/add.js', cartChange: '/cart/change.js', cart: '/cart', cartJs: '/cart.js' },
    CONFIG.routes
  );
  const STR = Object.assign(
    {
      addToCart: 'Ajouter au panier',
      soldOut: 'Épuisé',
      unavailable: 'Indisponible',
      adding: 'Ajout en cours…',
      error: 'Une erreur est survenue. Merci de réessayer.',
    },
    CONFIG.strings
  );
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ======================================================================
   * Utilitaires
   * ==================================================================== */

  const pad = (n) => String(n).padStart(2, '0');

  /** Formate un montant en centimes selon le format monétaire de la boutique (shop.money_format). */
  function formatMoney(cents, format) {
    const template = String(format || CONFIG.moneyFormat || '{{amount_with_comma_separator}}€').replace(/<[^>]*>/g, '');
    const value = Number(cents) || 0;
    const placeholder = /\{\{\s*(\w+)\s*\}\}/;

    const fmt = (precision, thousands = ',', decimal = '.') => {
      const [int, dec] = (value / 100).toFixed(precision).split('.');
      const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return dec ? withSep + decimal + dec : withSep;
    };

    const match = template.match(placeholder);
    if (!match) return fmt(2);

    const formats = {
      amount: () => fmt(2),
      amount_no_decimals: () => fmt(0),
      amount_with_comma_separator: () => fmt(2, '.', ','),
      amount_no_decimals_with_comma_separator: () => fmt(0, '.', ','),
      amount_with_apostrophe_separator: () => fmt(2, "'", '.'),
      amount_no_decimals_with_space_separator: () => fmt(0, ' ', ','),
      amount_with_space_separator: () => fmt(2, ' ', ','),
      amount_with_period_and_space_separator: () => fmt(2, ' ', '.'),
    };
    return template.replace(placeholder, (formats[match[1]] || formats.amount)());
  }

  /** Équivalent JS du filtre Liquid `handleize`. */
  function handleize(str) {
    return String(str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const storage = {
    get(key) {
      try {
        return window.sessionStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        window.sessionStorage.setItem(key, value);
      } catch (e) {
        /* stockage indisponible (navigation privée…) */
      }
    },
    remove(key) {
      try {
        window.sessionStorage.removeItem(key);
      } catch (e) {
        /* noop */
      }
    },
  };

  /** Une seule horloge (1 s) partagée par tous les comptes à rebours. */
  const Ticker = {
    subscribers: new Set(),
    timer: null,
    add(fn) {
      this.subscribers.add(fn);
      fn();
      if (!this.timer && this.subscribers.size) {
        this.timer = window.setInterval(() => this.subscribers.forEach((cb) => cb()), 1000);
      }
    },
    remove(fn) {
      this.subscribers.delete(fn);
      if (!this.subscribers.size && this.timer) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
    },
  };

  /** Verrouillage du scroll partagé entre le menu et le panier. */
  const ScrollLock = {
    count: 0,
    lock() {
      if (this.count++ === 0) document.body.classList.add('lp-scroll-lock');
    },
    unlock() {
      this.count = Math.max(0, this.count - 1);
      if (!this.count) document.body.classList.remove('lp-scroll-lock');
    },
  };

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  /** Garde le focus clavier à l'intérieur d'un tiroir ouvert. */
  function trapFocus(container, event) {
    const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Exécute `callback` à la fin d'une transition (avec filet de sécurité). */
  function afterTransition(element, callback, timeout = 450) {
    let done = false;
    const finish = (event) => {
      if (done || (event && event.target !== element)) return;
      done = true;
      element.removeEventListener('transitionend', finish);
      callback();
    };
    element.addEventListener('transitionend', finish);
    window.setTimeout(finish, timeout);
  }

  async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(options.headers || {}) },
    });
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      /* réponse vide */
    }
    if (!response.ok || (data && data.status && data.status >= 400)) {
      const message = (data && (data.description || data.message)) || STR.error;
      throw new Error(typeof message === 'string' ? message : STR.error);
    }
    return data;
  }

  const ICONS = {
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 10.5v6M14 10.5v6"/></svg>',
  };

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function define(name, constructor) {
    if (!window.customElements.get(name)) window.customElements.define(name, constructor);
  }

  /* ======================================================================
   * <lp-countdown>
   * ==================================================================== */

  class LpCountdown extends HTMLElement {
    connectedCallback() {
      this.tick = () => {
        const ms = this.remaining();
        this.textContent = LpCountdown.format(ms);
        this.toggleAttribute('data-expired', ms <= 0);
      };
      Ticker.add(this.tick);
    }

    disconnectedCallback() {
      Ticker.remove(this.tick);
    }

    remaining() {
      const now = new Date();
      if (this.dataset.mode === 'date' && this.dataset.end) {
        const end = new Date(this.dataset.end);
        if (!Number.isNaN(end.getTime())) return Math.max(0, end - now);
      }
      // Jusqu'à minuit, heure locale du visiteur.
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      return midnight - now;
    }

    static format(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const days = Math.floor(total / 86400);
      const hours = Math.floor((total % 86400) / 3600);
      const time = `${pad(hours)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
      return days > 0 ? `${days}j ${time}` : time;
    }
  }

  /* ======================================================================
   * <lp-header> — menu mobile
   * ==================================================================== */

  class LpHeader extends HTMLElement {
    connectedCallback() {
      this.menu = this.querySelector('.lp-menu');
      this.layer = this.querySelector('[data-lp-menu-layer]');
      this.openButton = this.querySelector('[data-lp-menu-open]');
      this.onKeydown = (event) => {
        if (event.key === 'Escape') this.close();
        else if (event.key === 'Tab' && this.menu) trapFocus(this.menu, event);
      };
      this.onClick = (event) => {
        if (event.target.closest('[data-lp-menu-open]')) this.open();
        else if (event.target.closest('[data-lp-menu-link]')) this.close(false);
        else if (event.target.closest('[data-lp-menu-close]')) this.close();
      };
      this.addEventListener('click', this.onClick);
    }

    disconnectedCallback() {
      if (this.classList.contains('is-menu-open')) ScrollLock.unlock();
      document.removeEventListener('keydown', this.onKeydown);
    }

    open() {
      if (!this.menu || this.classList.contains('is-menu-open')) return;
      this.classList.add('is-menu-open');
      this.layer?.classList.add('is-open');
      this.openButton?.setAttribute('aria-expanded', 'true');
      ScrollLock.lock();
      document.addEventListener('keydown', this.onKeydown);
      window.requestAnimationFrame(() => this.menu.focus());
    }

    close(restoreFocus = true) {
      if (!this.classList.contains('is-menu-open')) return;
      this.classList.remove('is-menu-open');
      this.layer?.classList.remove('is-open');
      this.openButton?.setAttribute('aria-expanded', 'false');
      ScrollLock.unlock();
      document.removeEventListener('keydown', this.onKeydown);
      if (restoreFocus) this.openButton?.focus();
    }
  }

  /* ======================================================================
   * <lp-product> — section produit
   * ==================================================================== */

  class LpProduct extends HTMLElement {
    connectedCallback() {
      const json = this.querySelector('[data-lp-product-json]');
      if (!json) return;
      try {
        this.data = JSON.parse(json.textContent);
      } catch (e) {
        return;
      }

      this.colorIndex = this.data.colorIndex;
      this.packIndex = this.data.packIndex;
      this.variants = this.data.variants || [];
      this.threshold = Number(this.dataset.stockThreshold) || 20;

      this.form = this.querySelector('form.lp-form');
      this.idInput = this.querySelector('[data-lp-variant-id]');
      this.track = this.querySelector('[data-lp-gallery-track]');
      this.atcButton = this.querySelector('[data-lp-atc]');
      this.errorEl = this.querySelector('[data-lp-atc-error]');

      const initial = this.variants.find((v) => String(v.id) === String(this.idInput?.value)) || this.variants[0];
      this.variant = initial;
      this.options = initial ? [...initial.options] : [];

      this.onClick = this.onClick.bind(this);
      this.onKeydown = this.onKeydown.bind(this);
      this.onSubmit = this.onSubmit.bind(this);
      this.addEventListener('click', this.onClick);
      this.addEventListener('keydown', this.onKeydown);
      this.form?.addEventListener('submit', this.onSubmit);

      if (this.track) {
        let frame = null;
        this.onTrackScroll = () => {
          if (frame) return;
          frame = window.requestAnimationFrame(() => {
            frame = null;
            this.syncThumbs();
          });
        };
        this.track.addEventListener('scroll', this.onTrackScroll, { passive: true });
      }

      this.updateAvailability();
      this.initStickyBar();
    }

    disconnectedCallback() {
      this.stickyObserver?.disconnect();
      this.form?.removeEventListener('submit', this.onSubmit);
    }

    /* ---------- Interactions ---------- */

    onClick(event) {
      const color = event.target.closest('[data-lp-color]');
      if (color) return this.selectOption(this.colorIndex, color.dataset.value);

      const pack = event.target.closest('[data-lp-pack]');
      if (pack) return this.selectOption(this.packIndex, pack.dataset.value);

      const thumb = event.target.closest('[data-lp-thumb]');
      if (thumb) return this.goToMedia(thumb.dataset.mediaId);

      if (event.target.closest('[data-lp-sticky-atc-button]')) {
        if (!this.form) return;
        if (typeof this.form.requestSubmit === 'function') this.form.requestSubmit();
        else this.form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }

    /** Flèches clavier dans les groupes de boutons radio (coloris, packs). */
    onKeydown(event) {
      const radio = event.target.closest('[role="radio"]');
      if (!radio) return;
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(event.key in keys)) return;
      const group = [...radio.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]')];
      const next = group[(group.indexOf(radio) + keys[event.key] + group.length) % group.length];
      event.preventDefault();
      next.focus();
      next.click();
    }

    selectOption(index, value) {
      if (index < 0 || value == null || this.options[index] === value) return;
      const options = [...this.options];
      options[index] = value;
      const variant = this.resolveVariant(options, index);
      if (!variant) return;
      const colorChanged = index === this.colorIndex || variant.options[this.colorIndex] !== this.options[this.colorIndex];
      this.setVariant(variant, colorChanged);
    }

    /** Variante exacte, sinon la plus proche qui conserve l'option modifiée (de préférence disponible). */
    resolveVariant(options, changedIndex) {
      const exact = this.variants.find((v) => v.options.every((opt, i) => opt === options[i]));
      if (exact) return exact;
      const candidates = this.variants.filter((v) => v.options[changedIndex] === options[changedIndex]);
      const score = (v) => v.options.reduce((acc, opt, i) => acc + (opt === options[i] ? 1 : 0), 0) + (v.available ? 0.5 : 0);
      return candidates.sort((a, b) => score(b) - score(a))[0];
    }

    /* ---------- Rendu ---------- */

    setVariant(variant, colorChanged) {
      this.variant = variant;
      this.options = [...variant.options];
      if (this.idInput) this.idInput.value = variant.id;

      this.updateOptionsUI();
      this.updatePrices();
      this.updateStock();
      this.updateButtons();
      this.updateAvailability();
      if (colorChanged) this.updateGallery();
      this.hideError();

      if (window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url.toString());
      }
      document.dispatchEvent(new CustomEvent('lp:variant:change', { detail: { variant } }));
    }

    updateOptionsUI() {
      const color = this.options[this.colorIndex];
      const pack = this.options[this.packIndex];

      this.querySelectorAll('[data-lp-color]').forEach((btn) => {
        btn.setAttribute('aria-checked', String(btn.dataset.value === color));
      });
      this.querySelectorAll('[data-lp-color-name]').forEach((el) => (el.textContent = color || ''));

      this.querySelectorAll('[data-lp-pack]').forEach((card) => {
        card.setAttribute('aria-checked', String(card.dataset.value === pack));
        // Prix de chaque pack pour le coloris actif.
        const match = this.variants.find(
          (v) => v.options[this.packIndex] === card.dataset.value && (this.colorIndex < 0 || v.options[this.colorIndex] === color)
        );
        if (!match) return;
        const priceEl = card.querySelector('[data-lp-pack-price]');
        const compareEl = card.querySelector('[data-lp-pack-compare]');
        if (priceEl) priceEl.textContent = formatMoney(match.price);
        if (compareEl) {
          compareEl.hidden = !(match.compare > match.price);
          compareEl.textContent = formatMoney(match.compare);
        }
      });
      this.querySelectorAll('[data-lp-pack-name]').forEach((el) => (el.textContent = pack || ''));
    }

    updatePrices() {
      const { price, compare } = this.variant;
      const hasCompare = compare > price;
      const pct = hasCompare ? Math.round(((compare - price) * 100) / compare) : 0;

      this.querySelectorAll('[data-lp-price]').forEach((el) => (el.textContent = formatMoney(price)));
      this.querySelectorAll('[data-lp-compare-value]').forEach((el) => (el.textContent = formatMoney(compare)));
      this.querySelectorAll('[data-lp-compare]').forEach((el) => (el.hidden = !hasCompare));
      this.querySelectorAll('[data-lp-discount]').forEach((el) => (el.textContent = pct));
      this.querySelectorAll('[data-lp-pct], [data-lp-discount-badge]').forEach((el) => (el.hidden = pct <= 0));
    }

    updateStock() {
      const stockEl = this.querySelector('[data-lp-stock]');
      if (!stockEl) return;
      const { inventory } = this.variant;
      let count = null;
      if (inventory !== null && inventory !== undefined) {
        // Inventaire Shopify suivi : on n'affiche que le stock réel, sous le seuil.
        if (inventory > 0 && inventory <= this.threshold) count = inventory;
      } else if (this.data.metafieldStock !== null && this.data.metafieldStock !== undefined) {
        count = this.data.metafieldStock;
      }
      stockEl.hidden = count === null;
      const countEl = stockEl.querySelector('[data-lp-stock-count]');
      if (countEl && count !== null) countEl.textContent = count;
    }

    updateButtons() {
      const { available, price } = this.variant;
      const priceText = formatMoney(price);
      const render = (button, labelSelector, separator) => {
        if (!button) return;
        const label = button.querySelector(labelSelector);
        button.disabled = !available;
        if (!label) return;
        label.textContent = '';
        if (!available) {
          label.textContent = STR.soldOut;
          return;
        }
        const priceSpan = createEl('span', null, priceText);
        priceSpan.setAttribute('data-lp-atc-price', '');
        label.append(document.createTextNode(`${button.dataset.atcText || STR.addToCart}${separator}`), priceSpan);
      };
      render(this.atcButton, '[data-lp-atc-label]', this.atcButton?.dataset.atcSeparator ?? ' — ');
      render(this.querySelector('[data-lp-sticky-atc-button]'), '[data-lp-sticky-label]', ' ');
    }

    /** Barre un coloris si aucune variante de ce coloris n'est disponible (pour le pack actif). */
    updateAvailability() {
      if (this.colorIndex < 0) return;
      const pack = this.options[this.packIndex];
      this.querySelectorAll('[data-lp-color]').forEach((btn) => {
        const available = this.variants.some(
          (v) => v.available && v.options[this.colorIndex] === btn.dataset.value && (this.packIndex < 0 || v.options[this.packIndex] === pack)
        );
        btn.classList.toggle('is-unavailable', !available);
      });
    }

    /* ---------- Galerie ---------- */

    visibleSlides() {
      return [...this.querySelectorAll('[data-lp-slide]')].filter((slide) => !slide.hidden);
    }

    updateGallery() {
      if (this.colorIndex < 0 || !this.track) return;
      const handle = handleize(this.options[this.colorIndex]);
      const slides = [...this.querySelectorAll('[data-lp-slide]')];
      const thumbs = [...this.querySelectorAll('[data-lp-thumb]')];
      const hasMatch = slides.some((s) => s.dataset.color === handle);
      const isVisible = (el) => !hasMatch || el.dataset.color === handle || el.dataset.color === '_';

      slides.forEach((slide) => (slide.hidden = !isVisible(slide)));
      thumbs.forEach((thumb) => (thumb.hidden = !isVisible(thumb)));

      // Charge en priorité la première image du nouveau coloris.
      const first = this.visibleSlides()[0];
      const img = first?.querySelector('img');
      if (img) img.loading = 'eager';

      this.track.scrollTo({ left: 0, behavior: 'auto' });
      this.syncThumbs();
    }

    goToMedia(mediaId) {
      const slide = this.querySelector(`[data-lp-slide][data-media-id="${mediaId}"]`);
      if (!slide || !this.track) return;
      this.track.scrollTo({ left: slide.offsetLeft, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
      this.setCurrentThumb(mediaId);
    }

    syncThumbs() {
      if (!this.track) return;
      const slides = this.visibleSlides();
      const index = Math.round(this.track.scrollLeft / Math.max(1, this.track.clientWidth));
      const slide = slides[Math.min(index, slides.length - 1)];
      if (slide) this.setCurrentThumb(slide.dataset.mediaId);
    }

    setCurrentThumb(mediaId) {
      this.querySelectorAll('[data-lp-thumb]').forEach((thumb) => {
        const current = thumb.dataset.mediaId === String(mediaId);
        thumb.setAttribute('aria-current', String(current));
        if (current && !thumb.hidden) {
          const strip = thumb.parentElement;
          const left = thumb.offsetLeft - strip.offsetLeft;
          if (left < strip.scrollLeft || left + thumb.offsetWidth > strip.scrollLeft + strip.clientWidth) {
            strip.scrollTo({ left: left - 8, behavior: 'smooth' });
          }
        }
      });
    }

    /* ---------- Ajout au panier ---------- */

    async onSubmit(event) {
      event.preventDefault();
      if (this.busy || !this.variant || !this.variant.available) return;

      // Sans panier coulissant sur la page : comportement natif du formulaire (/cart/add).
      if (!document.querySelector('lp-cart-drawer')) {
        this.form.submit();
        return;
      }

      this.busy = true;
      this.hideError();
      const buttons = [this.atcButton, this.querySelector('[data-lp-sticky-atc-button]')].filter(Boolean);
      buttons.forEach((btn) => {
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
      });
      const label = this.atcButton?.querySelector('[data-lp-atc-label]');
      if (label) label.textContent = STR.adding;

      try {
        await fetchJSON(ROUTES.cartAdd, {
          method: 'POST',
          body: JSON.stringify({ items: [{ id: Number(this.variant.id), quantity: 1 }] }),
        });
        document.dispatchEvent(new CustomEvent('lp:cart:refresh', { detail: { open: true } }));
      } catch (error) {
        this.showError(error.message);
      } finally {
        this.busy = false;
        buttons.forEach((btn) => {
          btn.classList.remove('is-loading');
          btn.removeAttribute('aria-busy');
        });
        this.updateButtons();
      }
    }

    showError(message) {
      if (!this.errorEl) return;
      this.errorEl.textContent = message || STR.error;
      this.errorEl.hidden = false;
    }

    hideError() {
      if (this.errorEl) this.errorEl.hidden = true;
    }

    /* ---------- Barre CTA sticky (mobile) ---------- */

    initStickyBar() {
      const bar = this.querySelector('[data-lp-sticky-atc]');
      const target = this.querySelector('[data-lp-atc-wrapper]');
      if (!bar || !target || !('IntersectionObserver' in window)) return;
      const button = bar.querySelector('button');
      document.body.classList.add('lp-has-sticky-atc');

      // La zone observée est prolongée très loin vers le bas : le CTA n'en « sort » que par le haut.
      // La barre apparaît donc une fois le CTA principal dépassé, et disparaît dès qu'on remonte
      // (y compris après un saut instantané, ex. retour en haut de page).
      this.stickyObserver = new IntersectionObserver(
        ([entry]) => {
          const show = !entry.isIntersecting;
          bar.classList.toggle('is-visible', show);
          bar.setAttribute('aria-hidden', String(!show));
          if (button) button.tabIndex = show ? 0 : -1;
        },
        { rootMargin: '0px 0px 100000px 0px' }
      );
      this.stickyObserver.observe(target);
    }
  }

  /* ======================================================================
   * <lp-cart-drawer>
   * ==================================================================== */

  const RESERVE_KEY = 'lp-cart-reserve-end';

  class LpCartDrawer extends HTMLElement {
    connectedCallback() {
      this.panel = this.querySelector('[data-lp-cart-panel]');
      this.itemsEl = this.querySelector('[data-lp-cart-items]');
      this.emptyEl = this.querySelector('[data-lp-cart-empty]');
      this.footerEl = this.querySelector('[data-lp-cart-footer]');
      this.subtotalEl = this.querySelector('[data-lp-cart-subtotal]');
      this.reserveEl = this.querySelector('[data-lp-cart-reserve]');
      this.timerEl = this.querySelector('[data-lp-cart-timer]');
      this.reserveMinutes = Number(this.dataset.reserveMinutes) || 15;
      this.itemCount = this.itemsEl ? this.itemsEl.children.length : 0;

      this.onOpenEvent = () => this.open();
      this.onRefreshEvent = (event) => {
        this.refresh().then(() => {
          if (event.detail && event.detail.open) this.open();
        });
      };
      this.onKeydown = (event) => {
        if (event.key === 'Escape') this.close();
        else if (event.key === 'Tab') trapFocus(this.panel, event);
      };
      this.onClick = this.onClick.bind(this);
      this.tick = () => this.updateReserve();

      document.addEventListener('lp:cart:open', this.onOpenEvent);
      document.addEventListener('lp:cart:refresh', this.onRefreshEvent);
      this.addEventListener('click', this.onClick);
      this.syncReserve();
    }

    disconnectedCallback() {
      document.removeEventListener('lp:cart:open', this.onOpenEvent);
      document.removeEventListener('lp:cart:refresh', this.onRefreshEvent);
      document.removeEventListener('keydown', this.onKeydown);
      Ticker.remove(this.tick);
      if (this.classList.contains('is-open')) ScrollLock.unlock();
    }

    get isOpen() {
      return this.classList.contains('is-open');
    }

    open() {
      if (this.isOpen) return;
      this.lastFocus = document.activeElement;
      this.classList.add('is-open');
      ScrollLock.lock();
      document.addEventListener('keydown', this.onKeydown);
      window.requestAnimationFrame(() => this.panel?.focus());
      // Le rendu serveur peut provenir d'un cache : on resynchronise à la première ouverture.
      if (!this.synced) this.refresh();
    }

    close(restoreFocus = true) {
      if (!this.isOpen) return;
      this.classList.remove('is-open');
      ScrollLock.unlock();
      document.removeEventListener('keydown', this.onKeydown);
      if (restoreFocus && this.lastFocus && typeof this.lastFocus.focus === 'function') this.lastFocus.focus();
    }

    onClick(event) {
      if (event.target.closest('[data-lp-cart-close]')) {
        this.close(false);
        return;
      }
      const item = event.target.closest('.lp-cart-item');
      if (!item) return;

      const qtyButton = event.target.closest('[data-lp-qty]');
      if (qtyButton) {
        const current = Number(item.querySelector('.lp-qty__value')?.textContent) || 0;
        this.change(item.dataset.key, Math.max(0, current + Number(qtyButton.dataset.lpQty)));
        return;
      }
      if (event.target.closest('[data-lp-remove]')) this.change(item.dataset.key, 0);
    }

    setLoading(loading) {
      this.panel?.classList.toggle('is-loading', loading);
      this.panel?.setAttribute('aria-busy', String(loading));
    }

    async refresh() {
      try {
        const cart = await fetchJSON(ROUTES.cartJs);
        this.render(cart);
      } catch (error) {
        /* garde l'état affiché */
      }
    }

    async change(key, quantity) {
      this.setLoading(true);
      try {
        const cart = await fetchJSON(ROUTES.cartChange, { method: 'POST', body: JSON.stringify({ id: key, quantity }) });
        this.render(cart);
      } catch (error) {
        await this.refresh();
      } finally {
        this.setLoading(false);
      }
    }

    render(cart) {
      if (!cart) return;
      this.synced = true;
      this.itemCount = cart.item_count;

      if (this.itemsEl) this.itemsEl.replaceChildren(...cart.items.map((item) => this.renderItem(item)));
      if (this.emptyEl) this.emptyEl.hidden = cart.item_count > 0;
      if (this.footerEl) this.footerEl.hidden = cart.item_count === 0;
      if (this.subtotalEl) this.subtotalEl.textContent = formatMoney(cart.total_price);
      document.querySelectorAll('[data-lp-cart-count]').forEach((el) => (el.textContent = cart.item_count));

      this.syncReserve();
    }

    /** ⚠️ Même balisage que snippets/lp-cart-item.liquid. */
    renderItem(item) {
      const li = createEl('li', 'lp-cart-item');
      li.dataset.key = item.key;

      const media = createEl('a', 'lp-cart-item__media');
      media.href = item.url;
      media.tabIndex = -1;
      media.setAttribute('aria-hidden', 'true');
      if (item.image) {
        const img = new Image(80, 80);
        img.src = `${item.image}${item.image.includes('?') ? '&' : '?'}width=160`;
        img.alt = '';
        img.loading = 'lazy';
        media.append(img);
      }

      const info = createEl('div', 'lp-cart-item__info');
      info.append(createEl('p', 'lp-cart-item__title', item.product_title));
      if (!item.product_has_only_default_variant && item.variant_title) {
        info.append(createEl('p', 'lp-cart-item__variant', item.variant_title));
      }
      const qty = createEl('div', 'lp-qty');
      qty.setAttribute('role', 'group');
      qty.setAttribute('aria-label', 'Quantité');
      const minus = createEl('button', 'lp-qty__btn');
      minus.type = 'button';
      minus.dataset.lpQty = '-1';
      minus.setAttribute('aria-label', 'Diminuer la quantité');
      minus.innerHTML = ICONS.minus;
      const value = createEl('span', 'lp-qty__value', item.quantity);
      value.setAttribute('aria-live', 'polite');
      const plus = createEl('button', 'lp-qty__btn');
      plus.type = 'button';
      plus.dataset.lpQty = '1';
      plus.setAttribute('aria-label', 'Augmenter la quantité');
      plus.innerHTML = ICONS.plus;
      qty.append(minus, value, plus);
      info.append(qty);

      const side = createEl('div', 'lp-cart-item__side');
      side.append(createEl('span', 'lp-cart-item__price', formatMoney(item.final_line_price)));
      if (item.original_line_price > item.final_line_price) {
        side.append(createEl('s', 'lp-cart-item__compare', formatMoney(item.original_line_price)));
      }
      const remove = createEl('button', 'lp-cart-item__remove');
      remove.type = 'button';
      remove.dataset.lpRemove = '';
      remove.setAttribute('aria-label', `Supprimer ${item.product_title}`);
      remove.innerHTML = ICONS.trash;
      side.append(remove);

      li.append(media, info, side);
      return li;
    }

    /* ---------- Minuteur de réservation ---------- */

    syncReserve() {
      if (!this.reserveEl) return;
      if (this.itemCount > 0) {
        if (!storage.get(RESERVE_KEY)) storage.set(RESERVE_KEY, String(Date.now() + this.reserveMinutes * 60000));
        Ticker.add(this.tick);
      } else {
        storage.remove(RESERVE_KEY);
        Ticker.remove(this.tick);
        this.reserveEl.hidden = true;
      }
    }

    updateReserve() {
      const end = Number(storage.get(RESERVE_KEY)) || 0;
      const remaining = end - Date.now();
      if (!end || remaining <= 0 || this.itemCount === 0) {
        // Minuteur écoulé : on masque simplement le message (pas de remise à zéro artificielle).
        this.reserveEl.hidden = true;
        Ticker.remove(this.tick);
        return;
      }
      const seconds = Math.ceil(remaining / 1000);
      this.reserveEl.hidden = false;
      if (this.timerEl) this.timerEl.textContent = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
    }
  }

  /* ======================================================================
   * <lp-video> — chargement au scroll + lecture selon la visibilité
   * ==================================================================== */

  class LpVideo extends HTMLElement {
    connectedCallback() {
      this.video = this.querySelector('video');
      if (!this.video) return;

      if (REDUCED_MOTION) {
        // Pas de lecture automatique : la vidéo reste à la demande.
        this.video.controls = true;
        this.video.preload = 'none';
        this.load();
        return;
      }

      if (!('IntersectionObserver' in window)) {
        this.play();
        return;
      }

      this.loadObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.load();
            this.loadObserver.disconnect();
          }
        },
        { rootMargin: '300px 0px' }
      );
      this.loadObserver.observe(this);

      this.playObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) this.play();
          else this.video.pause();
        },
        { threshold: 0.25 }
      );
      this.playObserver.observe(this);
    }

    disconnectedCallback() {
      this.loadObserver?.disconnect();
      this.playObserver?.disconnect();
    }

    load() {
      if (this.loaded) return;
      this.loaded = true;
      this.video.querySelectorAll('source[data-src]').forEach((source) => {
        source.src = source.dataset.src;
        source.removeAttribute('data-src');
      });
      this.video.load();
    }

    play() {
      this.load();
      this.video.muted = true;
      const promise = this.video.play();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    }
  }

  /* ======================================================================
   * <lp-carousel>
   * ==================================================================== */

  class LpCarousel extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-lp-carousel-track]');
      this.prev = this.querySelector('[data-lp-carousel-prev]');
      this.next = this.querySelector('[data-lp-carousel-next]');
      if (!this.track) return;

      this.update = this.update.bind(this);
      this.onClick = (event) => {
        if (event.target.closest('[data-lp-carousel-prev]')) this.scrollByItem(-1);
        else if (event.target.closest('[data-lp-carousel-next]')) this.scrollByItem(1);
      };
      this.addEventListener('click', this.onClick);
      this.track.addEventListener('scroll', this.update, { passive: true });
      window.addEventListener('resize', this.update, { passive: true });
      this.update();
    }

    disconnectedCallback() {
      window.removeEventListener('resize', this.update);
    }

    step() {
      const item = this.track.firstElementChild;
      if (!item) return this.track.clientWidth;
      const gap = parseFloat(window.getComputedStyle(this.track).columnGap) || 0;
      return item.getBoundingClientRect().width + gap;
    }

    scrollByItem(direction) {
      this.track.scrollBy({ left: direction * this.step(), behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    }

    update() {
      const max = this.track.scrollWidth - this.track.clientWidth - 2;
      if (this.prev) this.prev.disabled = this.track.scrollLeft <= 2;
      if (this.next) this.next.disabled = this.track.scrollLeft >= max;
    }
  }

  /* ======================================================================
   * <lp-accordion> — FAQ
   * ==================================================================== */

  class LpAccordion extends HTMLElement {
    connectedCallback() {
      this.single = this.hasAttribute('data-single');
      this.onClick = (event) => {
        const trigger = event.target.closest('.lp-accordion__trigger');
        if (!trigger || !this.contains(trigger)) return;
        const item = trigger.closest('.lp-accordion__item');
        this.toggle(item, trigger.getAttribute('aria-expanded') !== 'true');
      };
      this.addEventListener('click', this.onClick);
    }

    toggle(item, open) {
      const trigger = item.querySelector('.lp-accordion__trigger');
      const panel = item.querySelector('.lp-accordion__panel');
      if (!trigger || !panel) return;

      if (open && this.single) {
        this.querySelectorAll('.lp-accordion__item.is-open').forEach((other) => {
          if (other !== item) this.toggle(other, false);
        });
      }

      trigger.setAttribute('aria-expanded', String(open));
      item.classList.toggle('is-open', open);

      if (open) {
        panel.hidden = false;
        panel.style.maxHeight = '0px';
        const height = panel.scrollHeight; // force le calcul de la hauteur de départ
        panel.style.maxHeight = `${height}px`;
        afterTransition(panel, () => {
          if (item.classList.contains('is-open')) panel.style.maxHeight = 'none';
        });
      } else {
        panel.style.maxHeight = `${panel.scrollHeight}px`;
        void panel.offsetHeight; // reflow avant la transition de fermeture
        panel.style.maxHeight = '0px';
        afterTransition(panel, () => {
          if (!item.classList.contains('is-open')) panel.hidden = true;
        });
      }
    }
  }

  /* ======================================================================
   * Initialisation globale
   * ==================================================================== */

  define('lp-countdown', LpCountdown);
  define('lp-header', LpHeader);
  define('lp-product', LpProduct);
  define('lp-cart-drawer', LpCartDrawer);
  define('lp-video', LpVideo);
  define('lp-carousel', LpCarousel);
  define('lp-accordion', LpAccordion);

  /** Hauteur du bloc sticky (annonce + header) → --lp-top-height (ancres, galerie sticky). */
  function initStickyTop() {
    const top = document.querySelector('[data-lp-top]');
    if (!top) return;
    const setHeight = () => document.documentElement.style.setProperty('--lp-top-height', `${top.offsetHeight}px`);
    setHeight();
    if ('ResizeObserver' in window) new ResizeObserver(setHeight).observe(top);
    else window.addEventListener('resize', setHeight, { passive: true });

    const onScroll = () => top.classList.toggle('is-scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /** Tout élément [data-lp-cart-open] ouvre le panier (ou redirige vers /cart sans panier coulissant). */
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-lp-cart-open]');
    if (!trigger) return;
    event.preventDefault();
    if (document.querySelector('lp-cart-drawer')) document.dispatchEvent(new CustomEvent('lp:cart:open'));
    else window.location.href = ROUTES.cart;
  });

  /* Éditeur de thème : ouvre le panier quand sa section est sélectionnée. */
  document.addEventListener('shopify:section:select', (event) => {
    event.target.querySelector?.('lp-cart-drawer')?.open();
  });
  document.addEventListener('shopify:section:deselect', (event) => {
    event.target.querySelector?.('lp-cart-drawer')?.close(false);
  });

  initStickyTop();
})();
