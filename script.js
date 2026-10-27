// Цены, радиусы и услуги лежат в prices.js, их правит admin.html.
// Подключаем скриптом, а не fetch: так сайт работает и при открытии файла с диска.
// ?t= — чтобы браузер не показывал старые цены из кэша.
const loadPrices = () => new Promise((ok, fail) => {
  const s = document.createElement("script");
  s.src = `prices.js?t=${Date.now()}`;
  s.onload = ok;
  s.onerror = fail;
  document.head.append(s);
}).then(() => {
  const P = window.PRICES;
  window.SITE.calc.types.forEach((t) => {
    const rows = P.types[t.id] || [];
    t.prices = Object.fromEntries(rows.map((x) => [x.r, x.price]));
    t.tires = Object.fromEntries(rows.map((x) => [x.r, x.tire]));
  });
  window.SITE.services.items = P.services;
});

loadPrices().then(() => {
  const S = window.SITE;
  const $ = (sel) => document.querySelector(sel);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // Неразрывные пробелы: предлоги не висят в конце строки, число не отрывается от единицы (BRK-05)
  const typo = (s) => esc(s)
    .replace(/(?<=^|[\s(«])(в|во|на|с|со|к|ко|у|о|об|и|а|но|из|за|по|до|от|не|для)\s+/gi, "$1 ")
    .replace(/(\d)\s+(?=\d{3}(?!\d))/g, "$1 ")
    .replace(/(\d)\s+(?=[₽%а-яё])/gi, "$1 ");
  const lines = (arr) => arr.map(typo).join("<br>");
  const rub = (n) => n.toLocaleString("ru-RU");

  const tel = "tel:" + S.phone.replace(/[^\d+]/g, "");
  const wa = (text) => `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(text)}`;

  const ARROW = '<svg class="btn__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>';
  const button = (label, href, kind = "solid") => {
    const ext = /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : "";
    return `<a class="btn btn--${kind}" href="${esc(href)}"${ext}><span class="btn__fill"></span><span class="btn__label">${typo(label)}</span>${ARROW}</a>`;
  };
  const note = (text) => `<span class="cta__note">${typo(text)}</span>`;
  const chip = (label, attrs) => `<button class="chip" type="button" ${attrs}><span class="btn__fill"></span><span class="btn__label">${label}</span></button>`;

  // Шапка и первый экран
  document.title = S.title;
  $('meta[name="description"]').content = S.description;
  const logo = $("#logo");
  if (S.logo) {
    logo.innerHTML = `<img src="${S.logo}" alt="${S.name}">`;
  } else {
    logo.textContent = S.name;
  }
  $("#nav-call").href = tel;
  const video = $("#hero-video");
  video.poster = S.hero.poster;
  video.src = matchMedia("(max-width: 720px)").matches ? S.hero.videoMobile : S.hero.video;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    video.removeAttribute("autoplay");
    video.pause();
  }
  $("#hero-title").innerHTML = lines(S.hero.title);
  $("#hero-lead").innerHTML = typo(S.hero.lead);
  $("#hero-cta").innerHTML = button(S.hero.cta, wa("Здравствуйте! Хочу записаться на переобувку.")) + note(S.hero.note);

  // Калькулятор
  const C = S.calc;
  const allRadii = [...new Set(C.types.flatMap((t) => Object.keys(t.prices).map(Number)))].sort((a, b) => a - b);
  let type = C.types.find((t) => t.id === C.start.type) || C.types[0];
  let radius = C.start.radius;
  let angle = 0;

  $("#calc-title").innerHTML = lines(C.title);
  $("#calc-service").innerHTML = typo(C.service);
  $("#calc-types").innerHTML = C.types.map((t) => chip(typo(t.label), `data-type="${t.id}"`)).join("");
  $("#calc-radii").innerHTML = allRadii.map((r) => chip(`R${r}`, `data-radius="${r}"`)).join("");

  // Смена огромной цифры: уходит в размытие и возвращается с новым значением
  const swap = (el, text, instant) => {
    clearTimeout(el._t);
    if (instant) { el.textContent = text; return; }
    if (el.textContent === text) return;
    el.classList.add("is-swap");
    el._t = setTimeout(() => {
      el.textContent = text;
      el.classList.remove("is-swap");
    }, 260);
  };

  // Колесо: фото диска внутри нарисованной шины
  const wheel = $("#wheel");
  const rimBox = $("#rim");
  const rimImg = $("#rim-img");
  C.types.forEach((t) => { new Image().src = t.rim.src; });

  // Подгоняем фото так, чтобы обод диска совпал с краем круга
  const placeRim = (rim) => {
    const k = 50 / rim.r;
    Object.assign(rimImg.style, {
      width: `${k * rim.sx}%`,
      height: `${k * rim.a}%`,
      left: `${50 - rim.cx * rim.sx * k}%`,
      top: `${50 - rim.cy * k}%`,
      filter: `grayscale(1) contrast(1.15) brightness(${rim.light || 1.25})`
    });
    rimImg.src = rim.src;
  };

  let shownRim = null;
  const showRim = (rim, instant) => {
    if (rim === shownRim) return;
    shownRim = rim;
    clearTimeout(rimBox._t);
    if (instant) { placeRim(rim); return; }
    rimBox.classList.add("is-swap");
    rimBox._t = setTimeout(() => {
      placeRim(rim);
      const done = () => rimBox.classList.remove("is-swap");
      if (rimImg.complete) done();
      else {
        rimImg.addEventListener("load", done, { once: true });
        rimImg.addEventListener("error", done, { once: true });
      }
    }, 260);
  };

  const update = (instant = false) => {
    const prices = type.prices;
    if (!(radius in prices)) {
      const avail = Object.keys(prices).map(Number);
      radius = avail.reduce((best, r) => (Math.abs(r - radius) < Math.abs(best - radius) ? r : best), avail[0]);
    }
    const price = prices[radius];

    document.querySelectorAll("[data-type]").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.type === type.id);
    });
    document.querySelectorAll("[data-radius]").forEach((b) => {
      const r = Number(b.dataset.radius);
      b.disabled = !(r in prices);
      b.setAttribute("aria-pressed", r === radius);
    });

    swap($("#big-r"), `R${radius}`, instant);
    swap($("#big-p"), rub(price), instant);
    // Чем больше радиус, тем больше диск и тоньше боковина шины
    const k = 0.63 + (radius - 13) * 0.022 - (type.sidewall || 0);
    wheel.style.setProperty("--k", k.toFixed(3));
    wheel.style.transform = `rotate(${angle}deg)`;
    wheel.parentElement.style.setProperty("--s", (0.86 + (radius - 13) * 0.02).toFixed(3));
    showRim(type.rim, instant);

    const tire = `${type.tires[radius]} R${radius}`;
    document.querySelectorAll(".js-tire").forEach((t) => { t.textContent = `${S.name.toUpperCase()}   ${tire}`; });

    $("#spec-type").innerHTML = typo(type.label);
    $("#spec-r").textContent = tire;
    $("#spec-p").innerHTML = typo(`${rub(price)} ₽`);
    $("#calc-cta").innerHTML =
      button(`Записаться на R${radius}`, wa(`Здравствуйте! Хочу записаться на переобувку: ${type.one}, R${radius}.`)) +
      button("Позвонить мастеру", tel, "ghost") +
      note(C.note);
  };

  $("#calc-types").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b) return;
    const next = C.types.find((t) => t.id === b.dataset.type);
    if (next === type) return;
    type = next;
    angle += 120;
    update();
  });

  $("#calc-radii").addEventListener("click", (e) => {
    const b = e.target.closest("[data-radius]");
    if (!b || b.disabled) return;
    const r = Number(b.dataset.radius);
    if (r === radius) return;
    angle += (r - radius) * 45;
    radius = r;
    update();
  });

  update(true);

  // Лента фото
  $("#gallery-title").innerHTML = lines(S.gallery.title);
  $("#gallery-track").innerHTML = S.gallery.items.map((it) => `
    <figure class="shot rise">
      <div class="shot__img"><img src="${esc(it.src)}" alt="${esc(it.caption)}" loading="lazy"></div>
      <figcaption>${typo(it.caption)}</figcaption>
    </figure>`).join("");

  // Услуги
  $("#services-title").innerHTML = lines(S.services.title);
  $("#services-list").innerHTML = S.services.items.map((it, i) => `
    <li class="row rise">
      <span class="row__num">${String(i + 1).padStart(2, "0")}</span>
      <div>
        <h3 class="row__name">${typo(it.name)}</h3>
        <p class="row__text">${typo(it.text)}</p>
      </div>
      <span class="row__price">${typo(it.price)}</span>
    </li>`).join("");

  // Контакты
  $("#contacts-title").innerHTML = lines(S.contacts.title);
  $("#contacts-address").innerHTML = typo(S.address);
  $("#contacts-hours").innerHTML = typo(S.hours);
  $("#contacts-phone").href = tel;
  $("#contacts-phone").textContent = S.phone;
  $("#contacts-img").src = S.contacts.image;
  $("#contacts-img").alt = S.contacts.alt;
  $("#contacts-cta").innerHTML =
    button("Позвонить мастеру", tel) +
    note(S.contacts.note) +
    button("Написать в WhatsApp", wa("Здравствуйте! Хочу записаться на шиномонтаж."), "ghost") +
    button("Открыть в 2ГИС", S.gis, "ghost");

  $("#foot-name").textContent = S.name;
  $("#foot-year").textContent = `${S.address.split(",")[0]} / ${new Date().getFullYear()}`;

  // Задержки появления: 100 мс между смысловыми группами, 50 мс между однотипными элементами
  document.querySelectorAll(".reveal").forEach((sec) => {
    let t = 0;
    sec.querySelectorAll(".rise").forEach((el) => {
      el.style.setProperty("--d", `${t}ms`);
      t += el.matches(".shot, .row") ? 50 : 100;
    });
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("is-in");
      io.unobserve(en.target);
    });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((s) => io.observe(s));

  const start = () => $(".hero").classList.add("is-in");
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(start));
  setTimeout(start, 1500);
});
