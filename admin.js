// Окно администратора: правит prices.js прямо в репозитории на GitHub.
// После сохранения GitHub Pages пересобирает сайт, новые цены видны примерно через минуту.
(() => {
  const S = window.SITE;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // На своём компьютере (localhost или файл с диска) ключ не нужен: берём цены из prices.js рядом, сохранить нельзя
  const LOCAL = location.protocol === "file:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API = `https://api.github.com/repos/${S.repo}/contents/prices.js`;
  const HEAD = "// Цены, радиусы и услуги. Этот файл переписывает admin.html — руками лучше не править.\nwindow.PRICES = ";
  const KEY = `admin-token:${S.repo}`;

  const store = {
    get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
    set: (v) => { try { localStorage.setItem(KEY, v); } catch {} },
    del: () => { try { localStorage.removeItem(KEY); } catch {} }
  };

  // GitHub отдаёт файл в base64, а в ценах кириллица — кодируем через байты UTF-8
  const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const toB64 = (str) => {
    let bin = "";
    new TextEncoder().encode(str).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  };

  let token = store.get();
  let sha = null;
  let data = null;
  let typeId = S.calc.types[0].id;
  let dirty = false;

  const headers = () => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`
  });

  const load = async () => {
    if (LOCAL) return structuredClone(window.PRICES);
    const r = await fetch(`${API}?ref=${S.branch}&t=${Date.now()}`, { headers: headers(), cache: "no-store" });
    if (r.status === 401) throw new Error("Ключ не подошёл. Проверьте, что он вставлен целиком.");
    if (r.status === 403 || r.status === 404) throw new Error("У этого ключа нет доступа к сайту.");
    if (!r.ok) throw new Error(`GitHub не ответил (${r.status}). Попробуйте ещё раз.`);
    const file = await r.json();
    sha = file.sha;
    const text = fromB64(file.content);
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  };

  const msg = (el, text, kind = "") => {
    el.textContent = text;
    el.className = `msg${kind ? ` is-${kind}` : ""}`;
  };

  const setDirty = (v) => {
    dirty = v;
    if (v) msg($("#save-msg"), "Есть несохранённые изменения");
  };

  $("#logo").src = S.logo;
  $("#logo").alt = S.name;

  // Вход
  const showEditor = () => {
    $("#login").hidden = true;
    $("#editor").hidden = false;
    $("#save-bar").hidden = false;
    $("#logout").hidden = LOCAL;
    renderTypes();
    renderRows();
    renderServices();
    if (LOCAL) msg($("#save-msg"), "Локальный просмотр: сохранение работает только на сайте");
  };

  const start = async () => {
    try {
      data = await load();
      showEditor();
    } catch (e) {
      store.del();
      token = null;
      $("#login").hidden = false;
      msg($("#login-msg"), e.message, "bad");
    }
  };

  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    token = $("#token").value.trim();
    store.set(token);
    msg($("#login-msg"), "Проверяем ключ…");
    start();
  });

  $("#logout").addEventListener("click", () => {
    if (dirty && !confirm("Изменения не сохранены. Всё равно выйти?")) return;
    store.del();
    location.reload();
  });

  // Радиусы: вкладка на каждый тип машины
  const renderTypes = () => {
    $("#types").innerHTML = S.calc.types.map((t) =>
      `<button class="tab" type="button" role="tab" data-type="${t.id}" aria-selected="${t.id === typeId}">${esc(t.label)}</button>`).join("");
  };

  $("#types").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b) return;
    typeId = b.dataset.type;
    renderTypes();
    renderRows();
  });

  const rows = () => data.types[typeId] || (data.types[typeId] = []);

  const renderRows = () => {
    $("#rows").innerHTML = rows().map((x, i) => `
      <div class="row" data-i="${i}">
        <label class="cell"><span>Радиус</span><input data-k="r" type="number" inputmode="numeric" min="10" max="26" value="${esc(x.r)}"></label>
        <label class="cell"><span>Шина</span><input data-k="tire" type="text" placeholder="205/55" value="${esc(x.tire)}"></label>
        <label class="cell cell--price"><span>Цена, ₽</span><input data-k="price" type="number" inputmode="numeric" min="0" step="50" value="${esc(x.price)}"></label>
        <button class="del" type="button" data-del aria-label="Удалить R${esc(x.r)}">×</button>
      </div>`).join("");
  };

  $("#rows").addEventListener("input", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const x = rows()[e.target.closest(".row").dataset.i];
    x[k] = k === "tire" ? e.target.value.trim() : (e.target.value === "" ? "" : Number(e.target.value));
    e.target.classList.remove("is-bad");
    setDirty(true);
  });

  $("#rows").addEventListener("click", (e) => {
    if (!e.target.closest("[data-del]")) return;
    rows().splice(e.target.closest(".row").dataset.i, 1);
    renderRows();
    setDirty(true);
  });

  $("#add-row").addEventListener("click", () => {
    const list = rows();
    const last = list[list.length - 1];
    list.push({ r: last ? last.r + 1 : 16, tire: "", price: last ? last.price : "" });
    renderRows();
    $("#rows .row:last-child input[data-k='tire']").focus();
    setDirty(true);
  });

  // Услуги
  const renderServices = () => {
    const n = data.services.length;
    $("#services").innerHTML = data.services.map((s, i) => `
      <li class="service" data-i="${i}">
        <div class="service__head">
          <label class="cell"><span>Название</span><input data-k="name" type="text" value="${esc(s.name)}"></label>
          <button class="move" type="button" data-move="-1" aria-label="Выше" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="move" type="button" data-move="1" aria-label="Ниже" ${i === n - 1 ? "disabled" : ""}>↓</button>
          <button class="del" type="button" data-del aria-label="Удалить услугу">×</button>
        </div>
        <label class="cell"><span>Описание</span><textarea data-k="text" rows="3">${esc(s.text)}</textarea></label>
        <label class="cell"><span>Цена</span><input data-k="price" type="text" placeholder="от 300 ₽" value="${esc(s.price)}"></label>
      </li>`).join("");
  };

  $("#services").addEventListener("input", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    data.services[e.target.closest(".service").dataset.i][k] = e.target.value;
    e.target.classList.remove("is-bad");
    setDirty(true);
  });

  $("#services").addEventListener("click", (e) => {
    const li = e.target.closest(".service");
    if (!li) return;
    const i = Number(li.dataset.i);
    const list = data.services;
    if (e.target.closest("[data-del]")) {
      if (!confirm(`Удалить «${list[i].name || "услугу"}»?`)) return;
      list.splice(i, 1);
    } else if (e.target.closest("[data-move]")) {
      const j = i + Number(e.target.closest("[data-move]").dataset.move);
      [list[i], list[j]] = [list[j], list[i]];
    } else return;
    renderServices();
    setDirty(true);
  });

  $("#add-service").addEventListener("click", () => {
    data.services.push({ name: "", text: "", price: "" });
    renderServices();
    $("#services .service:last-child input").focus();
    setDirty(true);
  });

  // Проверка перед сохранением: возвращает текст ошибки и подсвечивает поле
  const validate = () => {
    for (const t of S.calc.types) {
      const list = data.types[t.id] || [];
      const bad = (i, k, text) => {
        typeId = t.id;
        renderTypes();
        renderRows();
        $(`#rows .row[data-i="${i}"] [data-k="${k}"]`).classList.add("is-bad");
        return `${t.label}: ${text}`;
      };
      if (!list.length) return `${t.label}: нужен хотя бы один радиус`;
      const seen = new Set();
      for (const [i, x] of list.entries()) {
        if (!Number.isInteger(x.r) || x.r < 10 || x.r > 26) return bad(i, "r", "радиус — целое число от 10 до 26");
        if (seen.has(x.r)) return bad(i, "r", `R${x.r} указан дважды`);
        seen.add(x.r);
        if (!/^\d{3}\/\d{2}$/.test(x.tire)) return bad(i, "tire", `у R${x.r} размер шины пишется так: 205/55`);
        if (!Number.isFinite(x.price) || x.price <= 0) return bad(i, "price", `у R${x.r} не указана цена`);
      }
    }
    for (const [i, s] of data.services.entries()) {
      for (const k of ["name", "price"]) {
        if (!String(s[k]).trim()) {
          $(`#services .service[data-i="${i}"] [data-k="${k}"]`).classList.add("is-bad");
          return `Услуга №${i + 1}: заполните ${k === "name" ? "название" : "цену"}`;
        }
      }
    }
    return "";
  };

  $("#save").addEventListener("click", async () => {
    const err = validate();
    if (err) { msg($("#save-msg"), err, "bad"); return; }

    Object.values(data.types).forEach((list) => list.sort((a, b) => a.r - b.r));
    data.services.forEach((s) => { s.name = s.name.trim(); s.text = s.text.trim(); s.price = s.price.trim(); });
    renderRows();
    const json = HEAD + JSON.stringify(data, null, 2) + ";\n";

    if (LOCAL) {
      console.log(json);
      msg($("#save-msg"), "Локальный просмотр: проверка пройдена, но сохранить можно только на сайте", "ok");
      return;
    }

    $("#save").disabled = true;
    msg($("#save-msg"), "Сохраняем…");
    try {
      const r = await fetch(API, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ message: "Цены из окна администратора", content: toB64(json), sha, branch: S.branch })
      });
      if (r.status === 409) throw new Error("Цены уже поменяли с другого устройства. Обновите страницу.");
      if (!r.ok) throw new Error(`Не сохранилось (${r.status}). Попробуйте ещё раз.`);
      sha = (await r.json()).content.sha;
      setDirty(false);
      msg($("#save-msg"), "Сохранено. На сайте обновится примерно через минуту", "ok");
    } catch (e) {
      msg($("#save-msg"), e.message, "bad");
    } finally {
      $("#save").disabled = false;
    }
  });

  addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault();
  });

  if (LOCAL || token) start();
  else $("#login").hidden = false;
})();
