/* Igor For Men — interactions */
(function () {
  'use strict';

  // --- Year ---
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // --- Nav scroll state ---
  const nav = document.getElementById('nav');
  const onScroll = () => {
    if (!nav) return;
    if (window.scrollY > 8) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // --- Mobile nav ---
  const toggle = document.getElementById('navToggle');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('.nav__mobile a').forEach((a) =>
      a.addEventListener('click', () => {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      })
    );
  }

  // --- Scroll reveal ---
  const revealSelectors = [
    '.hero__title',
    '.hero__lede',
    '.hero__cta',
    '.hero__meta',
    '.section__head',
    '.about__copy',
    '.about__card',
    '.service',
    '.care__col',
    '.faq__item',
    '.visit__copy',
    '.visit__form',
  ];
  const targets = document.querySelectorAll(revealSelectors.join(','));
  targets.forEach((t) => t.classList.add('reveal'));

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    targets.forEach((t) => io.observe(t));
  } else {
    targets.forEach((t) => t.classList.add('is-visible'));
  }

  // --- FAQ: one-at-a-time accordion ---
  const faqItems = document.querySelectorAll('.faq__item');
  faqItems.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (item.open) {
        faqItems.forEach((other) => {
          if (other !== item) other.open = false;
        });
      }
    });
  });

  // --- Contact form (local demo — replace with real endpoint) ---
  const form = document.getElementById('contactForm');
  const note = document.getElementById('formNote');
  if (form && note) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.name || !data.email) {
        note.textContent = 'Please add a name and an email.';
        note.classList.remove('is-success');
        return;
      }
      note.textContent = 'Thanks — your note is queued. Igor will follow up within one business day.';
      note.classList.add('is-success');
      form.reset();
    });
  }

  // --- Smooth in-page anchor offset (accounts for sticky nav) ---
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const navH = nav ? nav.offsetHeight : 0;
      const y = target.getBoundingClientRect().top + window.scrollY - navH + 1;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });
  });
})();
