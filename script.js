(() => {
  'use strict';

  /*
   * إعداد مرة واحدة:
   * 1) أنشئ مشروع Supabase.
   * 2) ضع Project URL و anon/publishable key أدناه.
   * 3) نفّذ ملف supabase-setup.sql في SQL Editor داخل Supabase.
   *
   * لا تضع أبدًا service_role key داخل ملفات الواجهة الأمامية.
   */
  const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE';
  const SUPABASE_ANON_KEY = 'PASTE_YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY_HERE';
  const SUPABASE_CONFIGURED =
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('PASTE_YOUR') &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes('PASTE_YOUR');

  const root = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const menuToggle = document.getElementById('menuToggle');
  const navLinks = document.getElementById('navLinks');
  const countEl = document.getElementById('sebhaCount');
  const ring = document.getElementById('sebhaRing');
  const toast = document.getElementById('toast');
  const statsStatus = document.getElementById('statsStatus');
  let toastTimer;
  let supabase = null;
  let visitorId = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function setTheme(theme) {
    root.dataset.theme = theme;
    const dark = theme === 'dark';
    if (themeToggle) {
      themeToggle.innerHTML = dark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
      themeToggle.setAttribute('aria-label', dark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن');
    }
    if (themeMeta) themeMeta.setAttribute('content', dark ? '#0b1518' : '#f5f7f1');
    try { localStorage.setItem('athar-theme', theme); } catch (_) {}
  }

  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('athar-theme') || 'light'; } catch (_) {}
  setTheme(savedTheme === 'dark' ? 'dark' : 'light');
  themeToggle?.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

  menuToggle?.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
  });
  navLinks?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    if (menuToggle) menuToggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
  }));

  // The local sebha count is kept on the current browser, as before.
  let sebhaCount = 0;
  try {
    const stored = Number.parseInt(localStorage.getItem('athar-sebha-count') || '0', 10);
    sebhaCount = Number.isFinite(stored) && stored >= 0 ? stored : 0;
  } catch (_) {}

  function renderSebha() {
    if (countEl) countEl.textContent = sebhaCount.toLocaleString('ar-EG');
  }
  function saveSebha() {
    try { localStorage.setItem('athar-sebha-count', String(sebhaCount)); }
    catch (_) { showToast('تعذّر حفظ العدد على هذا المتصفح.'); }
  }

  // A shared Supabase RPC is used for collective counts. The local counter remains usable offline.
  function setStatsStatus(message, state) {
    if (!statsStatus) return;
    statsStatus.className = 'stats-status' + (state ? ' ' + state : '');
    statsStatus.textContent = message;
  }

  function getOrCreateVisitorId() {
    const key = 'athar-anonymous-visitor-id';
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        if (window.crypto?.randomUUID) id = window.crypto.randomUUID();
        else id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        localStorage.setItem(key, id);
      }
      return id;
    } catch (_) {
      // Session-only fallback if browser storage is blocked.
      return window.crypto?.randomUUID ? window.crypto.randomUUID() :
        'session-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('ar-EG') : '—';
  }

  function renderStats(stats) {
    const visitorsEl = document.getElementById('statVisitors');
    const tasbeehEl = document.getElementById('statTasbeeh');
    const quranEl = document.getElementById('statQuran');
    if (visitorsEl) visitorsEl.textContent = formatNumber(stats.unique_visitors);
    if (tasbeehEl) tasbeehEl.textContent = formatNumber(stats.total_tasbeeh);
    if (quranEl) quranEl.textContent = formatNumber(stats.total_quran_reads);
  }

  async function refreshStats() {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('get_public_stats');
    if (error) {
      console.error('Could not load public stats:', error.message);
      setStatsStatus('تعذّر تحميل الإحصائيات؛ راجع إعداد Supabase.', 'offline');
      return;
    }
    const stats = Array.isArray(data) ? data[0] : data;
    if (stats) renderStats(stats);
    setStatsStatus('الإحصائيات متصلة ومحدّثة', 'connected');
  }

  async function registerVisitor() {
    if (!supabase || !visitorId) return;
    const { error } = await supabase.rpc('register_visitor', { p_visitor_id: visitorId });
    if (error) console.warn('Visitor registration failed:', error.message);
  }

  async function recordTasbeeh() {
    if (!supabase || !visitorId) return;
    const { error } = await supabase.rpc('increment_tasbeeh', { p_visitor_id: visitorId });
    if (error) {
      console.warn('Shared tasbeeh increment failed:', error.message);
      showToast('تم التسبيح محليًا، لكن تعذّر تسجيله في الإحصائيات العامة.');
      return;
    }
    refreshStats();
  }

  async function recordQuranRead(surahNumber, surahName, button) {
    if (!supabase || !visitorId) {
      showToast('الإحصائيات الجماعية غير مفعّلة بعد. أضف إعدادات Supabase أولًا.');
      return;
    }
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'جارٍ التسجيل...';
    const { error } = await supabase.rpc('record_quran_read', {
      p_visitor_id: visitorId,
      p_surah_number: Number(surahNumber)
    });
    button.disabled = false;
    button.textContent = oldText;
    if (error) {
      console.warn('Quran read logging failed:', error.message);
      showToast(error.message.includes('daily limit')
        ? 'وصلت إلى الحد اليومي لتسجيل القراءات من هذا المتصفح.'
        : 'تعذّر تسجيل القراءة. تحقق من اتصال الإحصائيات.');
      return;
    }
    showToast('تم تسجيل إتمام قراءة سورة ' + surahName + '. تقبّل الله منك.');
    refreshStats();
  }

  document.getElementById('tasbeehBtn')?.addEventListener('click', () => {
    sebhaCount += 1;
    renderSebha();
    saveSebha();
    ring?.classList.remove('pulse');
    requestAnimationFrame(() => {
      ring?.classList.add('pulse');
      setTimeout(() => ring?.classList.remove('pulse'), 160);
    });
    // The shared count is recorded per tap only when Supabase is configured.
    recordTasbeeh();
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    if (sebhaCount === 0) { showToast('العدّاد بالفعل عند الصفر.'); return; }
    if (window.confirm('هل تريد تصفير عدّاد التسبيح على هذا الجهاز؟')) {
      sebhaCount = 0;
      renderSebha();
      saveSebha();
      showToast('تم تصفير العدّاد المحلي. الإحصائيات العامة لا تُحذف.');
    }
  });
  renderSebha();

  // Azkar card counters are session-based and reset when the page reloads.
  document.querySelectorAll('[data-azkar-card]').forEach(card => {
    const total = Number(card.dataset.count) || 1;
    let remaining = total;
    const number = card.querySelector('.remaining-count');
    const button = card.querySelector('.count-btn');
    button?.addEventListener('click', event => {
      if (remaining <= 0) {
        remaining = total;
        number.textContent = String(remaining);
        button.classList.remove('done');
        button.innerHTML = 'تم الذكر <i class="fa-solid fa-check"></i>';
        showToast('بدأت العدّة من جديد.');
        return;
      }
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (event.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (event.clientY - rect.top - size / 2) + 'px';
      button.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
      remaining -= 1;
      number.textContent = String(remaining);
      if (remaining === 0) {
        button.classList.add('done');
        button.innerHTML = 'اكتمل الورد <i class="fa-solid fa-check-double"></i>';
        showToast('تقبّل الله منك.');
      }
    });
  });

  document.querySelectorAll('.surah-read-btn').forEach(button => {
    button.addEventListener('click', () => recordQuranRead(
      button.dataset.surah, button.dataset.surahName, button
    ));
  });

  // Reveal elements as they enter the viewport.
  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    revealItems.forEach(item => observer.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('visible'));
  }

  document.getElementById('year').textContent = new Date().getFullYear();
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', event => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Initialize Supabase only after credentials are added.
  if (SUPABASE_CONFIGURED && window.supabase?.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    visitorId = getOrCreateVisitorId();
    setStatsStatus('جاري الاتصال بالإحصائيات...', '');
    (async () => {
      await registerVisitor();
      await refreshStats();
    })();
  } else {
    setStatsStatus('الإحصائيات الجماعية تحتاج إعداد Supabase', 'offline');
    ['statVisitors', 'statTasbeeh', 'statQuran'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
  }
})();
