const API = "https://pokeapi.co/api/v2";
const LIMIT = 12;

const TYPES = {
  normal: ["#a8a77a", "⚪"], fire: ["#ff7a2f", "🔥"], water: ["#3b8bff", "💧"], electric: ["#ffd23f", "⚡"],
  grass: ["#4cc761", "🌿"], ice: ["#6fe3f0", "❄️"], fighting: ["#e0453a", "🥊"], poison: ["#b24dd6", "☠️"],
  ground: ["#d6a85a", "⛰️"], flying: ["#8fa8ff", "🕊️"], psychic: ["#ff5e9c", "🔮"], bug: ["#9bc232", "🐛"],
  rock: ["#b5a45a", "🪨"], ghost: ["#7a5bd6", "👻"], dragon: ["#6a4cff", "🐉"], dark: ["#6b5a52", "🌑"],
  steel: ["#9fb4c4", "⚙️"], fairy: ["#ff9ad5", "✨"],
};
const color = (t) => (TYPES[t] || ["#888"])[0];

const state = { mode: "all", type: null, urls: [], offset: 0, total: 0, shown: [], token: 0 };
const cache = new Map();
const favs = new Set(JSON.parse(localStorage.getItem("pokedex:favs") || "[]"));

const $ = (id) => document.getElementById(id);
const grid = $("grid"), statusEl = $("status"), pageEl = $("page"), prev = $("prev"), next = $("next");
const modal = $("modal"), sheet = $("sheet");

const cap = (s) => s.replace(/-/g, " ");
const art = (p) => p.sprites.other["official-artwork"].front_default || p.sprites.front_default || "";

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? "No encontrado 😢" : "Error de red");
  return res.json();
}
const getPokemon = (url) => {
  if (!cache.has(url)) cache.set(url, getJSON(url).catch((e) => (cache.delete(url), Promise.reject(e))));
  return cache.get(url);
};

/* ---------- render ---------- */
const tag = (t) => `<span class="tag" style="--c:${color(t)}">${TYPES[t] ? TYPES[t][1] : ""} ${t}</span>`;

function cardHTML(p, i) {
  const c = color(p.types[0].type.name);
  return `
  <button class="card3d" data-id="${p.id}" style="--c:${c};animation-delay:${i * 45}ms" aria-label="Ver ${p.name}">
    <span class="num">${String(p.id).padStart(3, "0")}</span>
    <span class="fav absolute right-3 top-3 z-10 text-lg" data-fav="${p.id}">${favs.has(p.id) ? "❤️" : "🤍"}</span>
    <img class="mx-auto h-36 w-36 object-contain" src="${art(p)}" alt="${p.name}" loading="lazy">
    <h2 class="mt-2 font-display text-lg font-bold capitalize">${cap(p.name)}</h2>
    <div class="mt-1">${p.types.map((t) => tag(t.type.name)).join("")}</div>
  </button>`;
}

function renderGrid(list) {
  state.shown = list;
  grid.innerHTML = list.map(cardHTML).join("");
}
const skeletons = () => (grid.innerHTML = Array.from({ length: LIMIT }, () => '<div class="skeleton"></div>').join(""));

function updatePager(label) {
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));
  pageEl.textContent = label ?? `Página ${state.offset / LIMIT + 1} de ${pages}`;
  prev.disabled = state.offset === 0;
  next.disabled = state.offset + LIMIT >= state.total;
}

/* ---------- carga ---------- */
async function loadPage() {
  const token = ++state.token;
  statusEl.textContent = "";
  skeletons();
  try {
    let urls;
    if (state.mode === "all") {
      const list = await getJSON(`${API}/pokemon?limit=${LIMIT}&offset=${state.offset}`);
      state.total = list.count;
      urls = list.results.map((r) => r.url);
    } else {
      state.total = state.urls.length;
      urls = state.urls.slice(state.offset, state.offset + LIMIT);
    }
    if (!urls.length) {
      if (token !== state.token) return;
      grid.innerHTML = "";
      statusEl.textContent = state.mode === "favs" ? "Aún no tienes favoritos. ¡Toca un 🤍!" : "Sin resultados";
      return updatePager("");
    }
    const details = await Promise.all(urls.map(getPokemon));
    if (token !== state.token) return;
    renderGrid(details);
    updatePager();
  } catch (e) {
    if (token === state.token) { grid.innerHTML = ""; statusEl.textContent = e.message; }
  }
}

function setMode(mode, type = null) {
  state.mode = mode; state.type = type; state.offset = 0;
  document.querySelectorAll(".chip").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
}

async function showType(type) {
  if (state.type === type) { setMode("all"); return loadPage(); }
  setMode("type", type);
  skeletons();
  try {
    const data = await getJSON(`${API}/type/${type}`);
    state.urls = data.pokemon.map((p) => p.pokemon.url).filter((u) => +u.split("/").at(-2) <= 1025);
    loadPage();
  } catch (e) { statusEl.textContent = e.message; }
}

function showFavs() {
  setMode("favs");
  state.urls = [...favs].sort((a, b) => a - b).map((id) => `${API}/pokemon/${id}/`);
  loadPage();
}

async function searchOne(q) {
  setMode("search");
  state.token++;
  statusEl.textContent = "Buscando…";
  skeletons();
  try {
    const p = await getPokemon(`${API}/pokemon/${encodeURIComponent(q)}`);
    renderGrid([p]);
    statusEl.textContent = "";
    state.total = 1;
    updatePager("1 resultado");
  } catch (err) {
    grid.innerHTML = "";
    statusEl.textContent = `${err.message} — prueba con “pikachu” o “25”`;
    updatePager("");
  }
}

/* ---------- modal ---------- */
const STAT = { hp: "HP", attack: "ATQ", defense: "DEF", "special-attack": "ATQ ESP", "special-defense": "DEF ESP", speed: "VEL" };
let shiny = false;

function openModal(id) {
  const idx = state.shown.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const p = state.shown[idx];
  const c = color(p.types[0].type.name);
  const img = (s) => p.sprites.other["official-artwork"][s] || art(p);
  shiny = false;
  sheet.style.setProperty("--c", c);
  sheet.innerHTML = `
    <div class="relative p-6 sm:p-8" style="background:radial-gradient(circle at 25% 15%, ${c}66, transparent 55%)">
      <button data-close class="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl hover:bg-white/20" aria-label="Cerrar">✕</button>
      <div class="grid items-center gap-6 sm:grid-cols-2">
        <div class="relative text-center">
          <span class="absolute inset-x-0 top-0 font-display text-[7rem] font-bold leading-none opacity-20" style="color:${c}">${String(p.id).padStart(3, "0")}</span>
          <img id="mImg" src="${img("front_default")}" alt="${p.name}" class="relative mx-auto h-64 w-64 animate-float object-contain drop-shadow-[0_25px_25px_rgba(0,0,0,.6)]">
          <div class="mt-2 flex justify-center gap-2">
            <button id="shinyBtn" class="glass rounded-full px-4 py-1.5 text-sm hover:bg-white/15">✨ Shiny</button>
            <button id="cryBtn" class="glass rounded-full px-4 py-1.5 text-sm hover:bg-white/15">🔊 Grito</button>
            <button id="favBtn" class="glass rounded-full px-4 py-1.5 text-sm hover:bg-white/15">${favs.has(p.id) ? "❤️" : "🤍"}</button>
          </div>
        </div>
        <div>
          <h2 class="font-display text-4xl font-bold capitalize">${cap(p.name)}</h2>
          <div class="mt-2">${p.types.map((t) => tag(t.type.name)).join("")}</div>
          <div class="mt-4 grid grid-cols-2 gap-3 text-center text-sm">
            <div class="glass rounded-2xl p-3"><div class="text-slate-400">Altura</div><b class="text-lg">${p.height / 10} m</b></div>
            <div class="glass rounded-2xl p-3"><div class="text-slate-400">Peso</div><b class="text-lg">${p.weight / 10} kg</b></div>
          </div>
          <p class="mt-4 text-sm text-slate-400">Habilidades</p>
          <div class="mt-1 flex flex-wrap gap-2">${p.abilities.map((a) => `<span class="glass rounded-full px-3 py-1 text-xs capitalize">${cap(a.ability.name)}${a.is_hidden ? " ✦" : ""}</span>`).join("")}</div>
        </div>
      </div>
      <div class="mt-8 space-y-3">
        ${p.stats.map((s) => `
          <div class="flex items-center gap-3 text-sm">
            <span class="w-20 shrink-0 text-slate-400">${STAT[s.stat.name] || s.stat.name}</span>
            <b class="w-9 text-right">${s.base_stat}</b>
            <div class="bar flex-1"><i data-w="${Math.min(100, (s.base_stat / 180) * 100)}%"></i></div>
          </div>`).join("")}
      </div>
      <div class="mt-6 flex justify-between">
        <button data-nav="-1" class="glass rounded-full px-5 py-2 hover:bg-white/15 ${idx === 0 ? "invisible" : ""}">← Anterior</button>
        <button data-nav="1" class="glass rounded-full px-5 py-2 hover:bg-white/15 ${idx === state.shown.length - 1 ? "invisible" : ""}">Siguiente →</button>
      </div>
    </div>`;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => requestAnimationFrame(() =>
    sheet.querySelectorAll(".bar i").forEach((i) => (i.style.width = i.dataset.w))));

  $("shinyBtn").onclick = () => { shiny = !shiny; $("mImg").src = img(shiny ? "front_shiny" : "front_default"); };
  $("cryBtn").onclick = () => p.cries?.latest && new Audio(p.cries.latest).play().catch(() => {});
  $("favBtn").onclick = () => { toggleFav(p.id); $("favBtn").textContent = favs.has(p.id) ? "❤️" : "🤍"; };
  sheet.dataset.id = id;
}
const closeModal = () => { modal.classList.remove("open"); document.body.style.overflow = ""; };
const stepModal = (d) => {
  const i = state.shown.findIndex((p) => p.id === +sheet.dataset.id) + d;
  if (state.shown[i]) openModal(state.shown[i].id);
};

function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  localStorage.setItem("pokedex:favs", JSON.stringify([...favs]));
  $("favCount").textContent = favs.size;
  document.querySelectorAll(`[data-fav="${id}"]`).forEach((el) => (el.textContent = favs.has(id) ? "❤️" : "🤍"));
}

/* ---------- eventos ---------- */
$("types").innerHTML = Object.keys(TYPES)
  .map((t) => `<button class="chip" data-type="${t}" style="--c:${color(t)}">${TYPES[t][1]} ${t}</button>`).join("");
$("types").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) showType(b.dataset.type); });

$("search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("q").value.trim().toLowerCase();
  if (!q) { setMode("all"); return loadPage(); }
  searchOne(q);
});
$("random").onclick = () => searchOne(Math.floor(Math.random() * 1025) + 1);
$("favsBtn").onclick = showFavs;

grid.addEventListener("click", (e) => {
  const f = e.target.closest("[data-fav]");
  if (f) { e.stopPropagation(); return toggleFav(+f.dataset.fav); }
  const c = e.target.closest(".card3d");
  if (c) openModal(+c.dataset.id);
});
grid.addEventListener("pointermove", (e) => {
  const c = e.target.closest(".card3d");
  if (!c || e.pointerType === "touch") return;
  const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  c.style.setProperty("--ry", `${(x - 0.5) * 18}deg`);
  c.style.setProperty("--rx", `${(0.5 - y) * 18}deg`);
  c.style.setProperty("--mx", `${x * 100}%`);
  c.style.setProperty("--my", `${y * 100}%`);
});
grid.addEventListener("pointerout", (e) => {
  const c = e.target.closest(".card3d");
  if (c) { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); }
});

modal.addEventListener("click", (e) => {
  if (e.target.id === "backdrop" || e.target.closest("[data-close]")) return closeModal();
  const n = e.target.closest("[data-nav]");
  if (n) stepModal(+n.dataset.nav);
});
document.addEventListener("keydown", (e) => {
  const open = modal.classList.contains("open");
  if (e.key === "Escape") closeModal();
  else if (open && e.key === "ArrowLeft") stepModal(-1);
  else if (open && e.key === "ArrowRight") stepModal(1);
  else if (e.key === "/" && !open && document.activeElement !== $("q")) { e.preventDefault(); $("q").focus(); }
});

prev.onclick = () => { state.offset -= LIMIT; loadPage(); scrollTo({ top: 0, behavior: "smooth" }); };
next.onclick = () => { state.offset += LIMIT; loadPage(); scrollTo({ top: 0, behavior: "smooth" }); };

$("favCount").textContent = favs.size;
loadPage();
