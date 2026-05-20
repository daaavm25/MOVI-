function getApiBase() {
	const custom = localStorage.getItem("movieplus:apiUrl");
	if (custom && custom.trim()) {
		return custom.trim().replace(/\/$/, "");
	}
	if (window.location.port && window.location.port !== "8000") {
		return `${window.location.protocol}//${window.location.hostname}:8000`;
	}
	return `${window.location.protocol}//${window.location.host}`;
}
const API = getApiBase();
const PLACEHOLDER_IMAGE = "https://placehold.co/500x750/e4edf3/5f7383?text=Sin+imagen";

const STORAGE_KEYS = {
	logged: "movieplus:logged",
	activeView: "movieplus:activeView",
	query: "movieplus:lastQuery",
	theme: "movieplus:theme",
	fontScale: "movieplus:fontScale",
	colorblind: "movieplus:colorblind",
	authToken: "movieplus:token",
	userId: "movieplus:userId",
	username: "movieplus:username",
	apiUrl: "movieplus:apiUrl",
	highContrast: "movieplus:highContrast",
	reduceMotion: "movieplus:reduceMotion",
	largeTargets: "movieplus:largeTargets",
	largeCursor: "movieplus:largeCursor",
	reduceTrans: "movieplus:reduceTrans",
	fontFamily: "movieplus:fontFamily",
	isMinor: "movieplus:isMinor",
	isAdmin: "movieplus:isAdmin"
};

const FONT_SCALE_MIN = 0.9;
const FONT_SCALE_MAX = 1.35;
const FONT_SCALE_STEP = 0.1;

// Genre filter → genre slug for backend
const FILTER_GENRE_MAP = {
	genero_accion: "accion",
	genero_fantasia: "fantasia",
	genero_terror: "terror",
	genero_scifi: "scifi",
	genero_comedia: "comedia",
	genero_drama: "drama",
	genero_animacion: "animacion"
};

// Internal developer-only stream links by TMDB id.
// Add links here so users can watch from the movie card icon.
// Example:
// 603: ["https://cdn.example.com/matrix.mp4", "https://player.example.com/matrix/embed"]
const INTERNAL_STREAM_LINKS = {
};

function registerInternalMovieLinks(movieId, links) {
	const parsedId = Number(movieId);
	if (!Number.isInteger(parsedId) || parsedId <= 0) {
		throw new Error("movieId invalido");
	}

	if (!Array.isArray(links)) {
		throw new Error("links debe ser un arreglo");
	}

	INTERNAL_STREAM_LINKS[parsedId] = links
		.map((entry) => String(entry || "").trim())
		.filter((entry) => entry.length > 0);

	renderSearchResults(state.searchResults);
	renderCollection();
}

window.MoviePlusDev = {
	registerInternalMovieLinks
};

const state = {
	logged: false,
	authToken: null,
	userId: null,
	username: null,
	is_minor: false,
	is_admin: false,
	activeView: "searchView",
	activeFilter: "populares",
	searchQuery: "",
	theme: "dark",
	fontScale: 1,
	colorblind: false,
	highContrast: false,
	reduceMotion: false,
	largeTargets: false,
	largeCursor: false,
	reduceTrans: false,
	fontFamily: "inter",
	searchResults: [],
	watchlist: [],
	debounceId: null,
	searchController: null,
	activeSearchId: 0,
	lastFocusBeforeModal: null,
	modalMovie: null,
	savingIds: new Set(),
	removingIds: new Set(),
	providersIntervalId: null,
	providersAbortController: null,
	activeProvidersRequestId: 0,
	carouselMovies: [],
	carouselIndex: 0,
	carouselIntervalId: null
};

const AVAILABLE_VIEWS = ["searchView", "collectionView", "aboutView", "settingsView"];

const elements = {
	loginBtn: document.getElementById("loginBtn"),
	authText: document.getElementById("authText"),
	themeSwitchBtn: document.getElementById("themeSwitchBtn"),
	themeSwitchLabel: document.getElementById("themeSwitchLabel"),
	fontDecreaseBtn: document.getElementById("fontDecreaseBtn"),
	fontIncreaseBtn: document.getElementById("fontIncreaseBtn"),
	fontScaleLabel: document.getElementById("fontScaleLabel"),
	colorblindModeBtn: document.getElementById("colorblindModeBtn"),
	colorblindModeLabel: document.getElementById("colorblindModeLabel"),
	navButtons: Array.from(document.querySelectorAll(".nav-btn")),
	searchView: document.getElementById("searchView"),
	collectionView: document.getElementById("collectionView"),
	aboutView: document.getElementById("aboutView"),
	searchForm: document.getElementById("searchForm"),
	searchInput: document.getElementById("searchInput"),
	searchBtn: document.getElementById("searchBtn"),
	goSearchBtn: document.getElementById("goSearchBtn"),
	refreshCollectionBtn: document.getElementById("refreshCollectionBtn"),
	resultados: document.getElementById("resultados"),
	coleccion: document.getElementById("coleccion"),
	searchStatus: document.getElementById("searchStatus"),
	collectionStatus: document.getElementById("collectionStatus"),
	toastRegion: document.getElementById("toastRegion"),
	movieModal: document.getElementById("movieModal"),
	movieModalContent: document.getElementById("movieModalContent"),
	closeMovieModalBtn: document.getElementById("closeMovieModalBtn"),
	movieModalImage: document.getElementById("movieModalImage"),
	movieModalTag: document.getElementById("movieModalTag"),
	movieModalTitle: document.getElementById("movieModalTitle"),
	movieModalMeta: document.getElementById("movieModalMeta"),
	movieModalDescription: document.getElementById("movieModalDescription"),
	movieModalFavoriteBtn: document.getElementById("movieModalFavoriteBtn"),
	movieModalProvidersStatus: document.getElementById("movieModalProvidersStatus"),
	movieModalProvidersList: document.getElementById("movieModalProvidersList"),
	moviePlayerLinks: document.getElementById("moviePlayerLinks"),
	moviePlayerContainer: document.getElementById("moviePlayerContainer"),
	moviePlayerFrame: document.getElementById("moviePlayerFrame"),
	moviePlayerVideo: document.getElementById("moviePlayerVideo"),
	moviePlayerStatus: document.getElementById("moviePlayerStatus"),
	filterBar: document.getElementById("filterBar"),
	filterChips: Array.from(document.querySelectorAll(".filter-chip")),
	carouselSection: document.getElementById("carouselSection"),
	carouselTrack: document.getElementById("carouselTrack"),
	carouselPrev: document.getElementById("carouselPrev"),
	carouselNext: document.getElementById("carouselNext"),
	carouselRefreshBtn: document.getElementById("carouselRefreshBtn"),
	settingsView: document.getElementById("settingsView")
};

function init() {
	hydrateState();
	bindEvents();
	renderAuthState();
	applyUserPreferences();
	setActiveView(state.activeView, false);
	initSettingsView();
	initContentFilters();

	elements.searchInput.value = state.searchQuery;
	renderModalFavoriteState();

	if (state.searchQuery.trim().length >= 2) {
		searchMovies(state.searchQuery.trim(), "trigger");
	} else {
		setStatus(elements.searchStatus, "Escribe al menos 2 letras para comenzar.");
		renderEmptyState(elements.resultados, "Todavia no hay resultados.", "Busca una pelicula para verla aqui.");
	}

	loadCollection();
	loadCarousel();
	updateFilterChips();
}

function bindEvents() {
	elements.loginBtn.addEventListener("click", () => {
		window.location.href = "login.html";
	});

	elements.themeSwitchBtn.addEventListener("click", toggleTheme);
	elements.fontIncreaseBtn.addEventListener("click", () => adjustFontScale(FONT_SCALE_STEP));
	elements.fontDecreaseBtn.addEventListener("click", () => adjustFontScale(-FONT_SCALE_STEP));
	elements.colorblindModeBtn.addEventListener("click", toggleColorblindMode);

	elements.navButtons.forEach((button) => {
		button.addEventListener("click", (event) => {
			event.preventDefault();
			const targetView = button.dataset.view;
			setActiveView(targetView);
			if (window.innerWidth <= 768) {
				closeSidebar();
			}
		});

		button.addEventListener("touchend", (event) => {
			event.preventDefault();
			const targetView = button.dataset.view;
			setActiveView(targetView);
			closeSidebar();
		}, { passive: false });
	});

	elements.searchForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const query = elements.searchInput.value.trim();
		searchMovies(query, "trigger");
	});

	elements.searchInput.addEventListener("input", (event) => {
		const value = event.target.value.trim();
		state.searchQuery = value;
		persistValue(STORAGE_KEYS.query, value);

		if (state.debounceId) {
			clearTimeout(state.debounceId);
		}

		if (value.length === 0) {
			cancelActiveSearch();
			state.searchResults = [];
			renderEmptyState(elements.resultados, "Sin busqueda activa.", "Escribe el nombre de una pelicula para buscar.");
			setStatus(elements.searchStatus, "Escribe al menos 2 letras para buscar.");
			return;
		}

		if (value.length < 2) {
			cancelActiveSearch();
			setStatus(elements.searchStatus, "Necesitas al menos 2 letras para buscar.");
			return;
		}

		state.debounceId = window.setTimeout(() => {
			searchMovies(value, "realtime");
		}, 450);
	});

	elements.refreshCollectionBtn.addEventListener("click", () => {
		loadCollection({ notify: true });
	});

	elements.goSearchBtn.addEventListener("click", () => {
		setActiveView("searchView");
		elements.searchInput.focus();
	});

	elements.closeMovieModalBtn.addEventListener("click", closeMovieModal);
	elements.movieModalFavoriteBtn.addEventListener("click", handleModalFavoriteAction);

	elements.movieModal.addEventListener("click", (event) => {
		if (event.target.dataset.closeModal === "true") {
			closeMovieModal();
		}
	});

	elements.filterChips.forEach((chip) => {
		chip.addEventListener("click", () => {
			const filter = chip.dataset.filter;
			setActiveFilter(filter);
		});
	});

	elements.carouselPrev.addEventListener("click", () => shiftCarousel(-1));
	elements.carouselNext.addEventListener("click", () => shiftCarousel(1));
	elements.carouselRefreshBtn.addEventListener("click", loadCarousel);

	// Sidebar toggle for mobile
	const sidebar = document.getElementById("sidebar");
	const sidebarToggle = document.getElementById("sidebarToggle");
	const sidebarOverlay = document.getElementById("sidebarOverlay");

	function closeSidebar() {
		if (sidebar) sidebar.classList.remove("sidebar--open");
		if (sidebarOverlay) sidebarOverlay.classList.remove("is-visible");
		if (sidebarToggle) sidebarToggle.setAttribute("aria-expanded", "false");
	}

	if (sidebarToggle && sidebar) {
		sidebarToggle.addEventListener("click", () => {
			const isOpen = sidebar.classList.toggle("sidebar--open");
			if (sidebarOverlay) sidebarOverlay.classList.toggle("is-visible", isOpen);
			sidebarToggle.setAttribute("aria-expanded", String(isOpen));
		});

		sidebarToggle.addEventListener("touchend", (event) => {
			event.preventDefault();
			const isOpen = sidebar.classList.toggle("sidebar--open");
			if (sidebarOverlay) sidebarOverlay.classList.toggle("is-visible", isOpen);
			sidebarToggle.setAttribute("aria-expanded", String(isOpen));
		}, { passive: false });
	}

	if (sidebarOverlay) {
		sidebarOverlay.addEventListener("click", closeSidebar);
		sidebarOverlay.addEventListener("touchend", (event) => {
			event.preventDefault();
			closeSidebar();
		}, { passive: false });
	}

	window.addEventListener("resize", () => {
		if (window.innerWidth > 768) {
			closeSidebar();
		}
	});

	window.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			if (!elements.movieModal.hidden) {
				closeMovieModal();
				return;
			}
			closeSidebar();
		}

		if (event.key === "Tab" && !elements.movieModal.hidden) {
			trapModalFocus(event);
		}
	});
}

function hydrateState() {
	state.authToken = localStorage.getItem(STORAGE_KEYS.authToken) || null;
	state.userId = Number(localStorage.getItem(STORAGE_KEYS.userId)) || null;
	state.username = localStorage.getItem(STORAGE_KEYS.username) || null;
	state.logged = Boolean(state.authToken);

	const savedView = localStorage.getItem(STORAGE_KEYS.activeView);
	if (AVAILABLE_VIEWS.includes(savedView)) {
		state.activeView = savedView;
	}

	const savedQuery = localStorage.getItem(STORAGE_KEYS.query);
	if (typeof savedQuery === "string") {
		state.searchQuery = savedQuery;
	}

	const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
	if (savedTheme === "light" || savedTheme === "dark") {
		state.theme = savedTheme;
	}

	const savedFontScale = Number(localStorage.getItem(STORAGE_KEYS.fontScale));
	if (Number.isFinite(savedFontScale)) {
		state.fontScale = clampNumber(savedFontScale, FONT_SCALE_MIN, FONT_SCALE_MAX);
	}

	state.colorblind = localStorage.getItem(STORAGE_KEYS.colorblind) === "1";
	state.highContrast = localStorage.getItem(STORAGE_KEYS.highContrast) === "1";
	state.reduceMotion = localStorage.getItem(STORAGE_KEYS.reduceMotion) === "1";
	state.largeTargets = localStorage.getItem(STORAGE_KEYS.largeTargets) === "1";
	state.largeCursor = localStorage.getItem(STORAGE_KEYS.largeCursor) === "1";
	state.reduceTrans = localStorage.getItem(STORAGE_KEYS.reduceTrans) === "1";
	const savedFont = localStorage.getItem(STORAGE_KEYS.fontFamily);
	if (savedFont) state.fontFamily = savedFont;
	state.is_minor = localStorage.getItem(STORAGE_KEYS.isMinor) === "1";
	state.is_admin = localStorage.getItem(STORAGE_KEYS.isAdmin) === "1";
}

function persistValue(key, value) {
	localStorage.setItem(key, value);
}

function clampNumber(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function setTheme(theme) {
	if (theme !== "light" && theme !== "dark") {
		return;
	}

	state.theme = theme;
	persistValue(STORAGE_KEYS.theme, theme);
	applyUserPreferences();
}

function toggleTheme() {
	setTheme(state.theme === "light" ? "dark" : "light");
}

function adjustFontScale(delta) {
	const nextScale = clampNumber(
		Number((state.fontScale + delta).toFixed(2)),
		FONT_SCALE_MIN,
		FONT_SCALE_MAX
	);

	if (nextScale === state.fontScale) {
		return;
	}

	state.fontScale = nextScale;
	persistValue(STORAGE_KEYS.fontScale, String(state.fontScale));
	applyUserPreferences();
}

function toggleColorblindMode() {
	state.colorblind = !state.colorblind;
	persistValue(STORAGE_KEYS.colorblind, state.colorblind ? "1" : "0");
	applyUserPreferences();

	if (state.colorblind) {
		showToast("Vista daltonismo activada.", "info");
		return;
	}

	showToast("Vista daltonismo desactivada.", "info");
}

function applyUserPreferences() {
	document.body.setAttribute("data-theme", state.theme);
	const visionMode = state.colorblind ? "colorblind" : (state.highContrast ? "high-contrast" : "default");
	document.body.setAttribute("data-vision", visionMode);
	document.body.setAttribute("data-reduce-motion", state.reduceMotion ? "1" : "0");
	document.body.setAttribute("data-large-targets", state.largeTargets ? "1" : "0");
	document.body.setAttribute("data-large-cursor", state.largeCursor ? "1" : "0");
	document.body.setAttribute("data-reduce-trans", state.reduceTrans ? "1" : "0");
	document.body.setAttribute("data-font", state.fontFamily || "inter");
	document.documentElement.style.setProperty("--font-scale", String(state.fontScale));
	renderPreferenceControls();
}

function renderPreferenceControls() {
	const isDarkTheme = state.theme === "dark";

	elements.themeSwitchBtn.classList.toggle("is-dark", isDarkTheme);
	elements.themeSwitchBtn.setAttribute("aria-checked", String(isDarkTheme));
	elements.themeSwitchLabel.textContent = isDarkTheme ? "Modo oscuro activo" : "Modo claro activo";

	elements.fontScaleLabel.textContent = `${Math.round(state.fontScale * 100)}%`;
	elements.fontDecreaseBtn.disabled = state.fontScale <= FONT_SCALE_MIN + 0.001;
	elements.fontIncreaseBtn.disabled = state.fontScale >= FONT_SCALE_MAX - 0.001;

	elements.colorblindModeBtn.classList.toggle("is-active", state.colorblind);
	elements.colorblindModeBtn.setAttribute("aria-pressed", String(state.colorblind));
	elements.colorblindModeLabel.textContent = state.colorblind
		? "Vista daltonismo activa"
		: "Vista daltonismo";
}

// ===================== AUTH =====================
function renderAuthState() {
	elements.loginBtn.classList.toggle("lamp-on", state.logged);
	elements.loginBtn.classList.toggle("lamp-off", !state.logged);
	elements.loginBtn.textContent = state.logged ? "🔓" : "💡";
	elements.loginBtn.title = state.logged ? "Gestionar sesion" : "Iniciar o registrarse";
	elements.authText.textContent = state.logged
		? `Hola, ${state.username || "usuario"}`
		: "Sesion cerrada";
}

// ===================== FILTER & CAROUSEL =====================
function setActiveFilter(filter) {
	state.activeFilter = filter;
	updateFilterChips();
	loadCarousel();
}

function updateFilterChips() {
	elements.filterChips.forEach((chip) => {
		chip.classList.toggle("is-active", chip.dataset.filter === state.activeFilter);
	});
}

async function loadCarousel() {
	elements.carouselTrack.innerHTML = "";
	const skeletonCount = 8;
	for (let i = 0; i < skeletonCount; i++) {
		const s = document.createElement("div");
		s.className = "card-skeleton carousel-card";
		s.setAttribute("aria-hidden", "true");
		elements.carouselTrack.appendChild(s);
	}

	try {
		let endpoint = `${API}/peliculas/populares`;
		const filter = state.activeFilter;

		if (filter === "menos_populares") {
			endpoint = `${API}/peliculas/genero/accion?sort=menos_populares`;
		} else if (filter && filter.startsWith("genero_")) {
			const genre = FILTER_GENRE_MAP[filter];
			if (genre) {
				endpoint = `${API}/peliculas/genero/${genre}`;
			}
		}

		const response = await fetch(endpoint);
		const payload = await safeJson(response);

		if (!response.ok) {
			throw new Error(payload?.error || "No se pudieron cargar peliculas.");
		}

		const movies = Array.isArray(payload?.results) ? payload.results : [];
		// Shuffle for variety
		const shuffled = [...movies].sort(() => Math.random() - 0.5);
		state.carouselMovies = shuffled.map(normalizeMovie).filter(m => m.id && m.titulo);
		renderCarousel();
	} catch (_) {
		elements.carouselTrack.innerHTML = "";
	}
}

function renderCarousel() {
	elements.carouselTrack.innerHTML = "";
	const fragment = document.createDocumentFragment();

	state.carouselMovies.forEach((movie) => {
		const card = document.createElement("div");
		card.className = "carousel-card";
		card.setAttribute("role", "button");
		card.setAttribute("tabindex", "0");
		card.setAttribute("aria-label", `Ver detalle de ${movie.titulo}`);

		const img = document.createElement("img");
		img.src = movie.imagen || PLACEHOLDER_IMAGE;
		img.alt = `Poster de ${movie.titulo}`;
		img.loading = "lazy";
		img.onerror = () => { img.src = PLACEHOLDER_IMAGE; };

		const label = document.createElement("div");
		label.className = "carousel-card__label";
		label.textContent = movie.titulo;

		card.append(img, label);
		card.addEventListener("click", () => openMovieModal(movie, "Carrusel"));
		card.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				openMovieModal(movie, "Carrusel");
			}
		});

		fragment.appendChild(card);
	});

	elements.carouselTrack.appendChild(fragment);
}

function shiftCarousel(direction) {
	const cardWidth = 132; // 120px width + 12px gap
	elements.carouselTrack.scrollBy({ left: direction * cardWidth * 3, behavior: "smooth" });
}

// ===================== PLAYER =====================
function getInternalLinksForMovie(movie) {
	const movieId = Number(movie?.id || movie?.external_id || 0);
	const rawLinks = INTERNAL_STREAM_LINKS[movieId];

	if (!Array.isArray(rawLinks)) {
		return [];
	}

	return rawLinks
		.map((entry) => String(entry || "").trim())
		.filter((entry) => entry.length > 0);
}

function loadPlayerUrl(rawUrl) {
	const raw = String(rawUrl || "").trim();

	if (!raw) {
		elements.moviePlayerContainer.hidden = true;
		elements.moviePlayerFrame.src = "";
		elements.moviePlayerStatus.textContent = "Reproduccion no disponible por el momento.";
		return;
	}

	let url;
	try {
		url = new URL(raw);
	} catch (_) {
		elements.moviePlayerStatus.textContent = "Enlace interno invalido.";
		return;
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		elements.moviePlayerStatus.textContent = "Solo se permiten enlaces https:// o http://";
		return;
	}

	elements.moviePlayerFrame.src = url.href;
	elements.moviePlayerFrame.style.display = "block";
	if (elements.moviePlayerVideo) {
		elements.moviePlayerVideo.src = "";
		elements.moviePlayerVideo.style.display = "none";
	}
	elements.moviePlayerContainer.hidden = false;
	elements.moviePlayerStatus.textContent = `Reproduciendo desde ${url.hostname}`;
}

function renderMoviePlayerLinks(movie, preferredUrl = "") {
	const links = getInternalLinksForMovie(movie);
	elements.moviePlayerLinks.innerHTML = "";

	if (!links.length) {
		elements.moviePlayerLinks.hidden = true;
		elements.moviePlayerStatus.textContent = "Reproduccion no disponible por el momento.";
		elements.moviePlayerContainer.hidden = true;
		elements.moviePlayerFrame.src = "";
		return;
	}

	elements.moviePlayerLinks.hidden = false;

	links.forEach((link, index) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "movie-link-pill";
		button.innerHTML = `<span aria-hidden="true">▶</span> Ver pelicula ${index + 1}`;
		button.addEventListener("click", () => {
			loadPlayerUrl(link);
		});
		elements.moviePlayerLinks.appendChild(button);
	});

	loadPlayerUrl(preferredUrl || links[0]);
}

function setActiveView(viewId, persist = true) {
	const target = AVAILABLE_VIEWS.includes(viewId) ? viewId : "searchView";
	state.activeView = target;

	if (persist) {
		persistValue(STORAGE_KEYS.activeView, target);
	}

	const viewElements = [elements.searchView, elements.collectionView, elements.aboutView, elements.settingsView];
	viewElements.forEach((viewElement) => {
		const isVisible = viewElement.id === target;
		viewElement.hidden = !isVisible;
		viewElement.classList.toggle("is-visible", isVisible);
	});

	elements.navButtons.forEach((button) => {
		const isActive = button.dataset.view === target;
		button.classList.toggle("is-active", isActive);
		button.setAttribute("aria-current", isActive ? "page" : "false");
	});

	if (target === "collectionView") {
		loadCollection();
	}
}

async function searchMovies(query, mode) {
	if (!query || query.length < 2) {
		setStatus(elements.searchStatus, "Escribe al menos 2 letras para buscar.", "error");
		return;
	}

	if (state.searchController) {
		state.searchController.abort();
	}

	state.searchController = new AbortController();
	state.activeSearchId += 1;
	const requestId = state.activeSearchId;

	setStatus(
		elements.searchStatus,
		mode === "realtime" ? "Buscando en tiempo real..." : "Buscando peliculas...",
		"loading"
	);
	setLoadingState(elements.resultados, true);
	renderSkeleton(elements.resultados, 6);

	try {
		const endpoint = `${API}/peliculas?query=${encodeURIComponent(query)}&limit=12`;
		const response = await fetch(endpoint, {
			signal: state.searchController.signal
		});
		const payload = await safeJson(response);

		if (requestId !== state.activeSearchId) {
			return;
		}

		if (!response.ok) {
			throw new Error(payload?.error || "No se pudo completar la busqueda.");
		}

		const movies = Array.isArray(payload?.results) ? payload.results : [];
		state.searchResults = movies.map(normalizeMovie).filter((movie) => movie.id && movie.titulo);
		renderSearchResults(state.searchResults);

		if (state.searchResults.length === 0) {
			setStatus(elements.searchStatus, `No resultados para "${query}".`);
		} else {
			setStatus(elements.searchStatus, `${state.searchResults.length} resultados para "${query}".`, "success");
		}
	} catch (error) {
		if (error.name === "AbortError") {
			return;
		}

		state.searchResults = [];
		renderEmptyState(
			elements.resultados,
			"No fue posible cargar resultados.",
			"Verifica tu conexion e intenta nuevamente."
		);
		setStatus(elements.searchStatus, error.message || "Error inesperado en la busqueda.", "error");
		showToast(error.message || "Error de busqueda", "error");
	} finally {
		if (requestId === state.activeSearchId) {
			setLoadingState(elements.resultados, false);
			state.searchController = null;
		}
	}
}

function renderSearchResults(movies) {
	elements.resultados.innerHTML = "";

	if (!movies.length) {
		renderEmptyState(elements.resultados, "No resultados.", "Prueba con otro titulo o una palabra mas corta.");
		return;
	}

	const fragment = document.createDocumentFragment();

	movies.forEach((movie, index) => {
		const card = document.createElement("article");
		card.className = "card";
		card.style.animationDelay = `${Math.min(index * 30, 220)}ms`;

		const image = document.createElement("img");
		image.src = movie.imagen || PLACEHOLDER_IMAGE;
		image.alt = `Poster de ${movie.titulo}`;
		image.loading = "lazy";
		image.decoding = "async";
		image.addEventListener("error", () => {
			image.src = PLACEHOLDER_IMAGE;
		});

		const posterBtn = document.createElement("button");
		posterBtn.type = "button";
		posterBtn.className = "poster-btn";
		posterBtn.setAttribute("aria-label", `Abrir detalle de ${movie.titulo}`);
		posterBtn.appendChild(image);
		posterBtn.addEventListener("click", () => {
			openMovieModal(movie, "Resultado de busqueda");
		});

		const footer = document.createElement("div");
		footer.className = "card-footer";
		const footerTitle = document.createElement("strong");
		footerTitle.className = "card-footer__title";
		footerTitle.textContent = movie.titulo;
		const footerYear = document.createElement("span");
		footerYear.className = "card-footer__year";
		footerYear.textContent = movie.fecha ? String(movie.fecha).slice(0, 4) : "";
		footer.append(footerTitle, footerYear);
		const actions = document.createElement("div");
		actions.className = "card-actions";

		const internalLinks = getInternalLinksForMovie(movie);
		if (internalLinks.length) {
			const watchBtn = document.createElement("button");
			watchBtn.type = "button";
			watchBtn.className = "watch-icon-btn";
			watchBtn.innerHTML = '<span aria-hidden="true">▶</span> Ver pelicula';
			watchBtn.setAttribute("aria-label", `Ver pelicula ${movie.titulo}`);
			watchBtn.addEventListener("click", () => {
				openMovieModal(movie, "Reproduccion interna", { autoplayUrl: internalLinks[0] });
			});
			actions.appendChild(watchBtn);
		}

		card.append(posterBtn, footer, actions);
		fragment.appendChild(card);
	});

	elements.resultados.appendChild(fragment);
}

async function saveMovie(movie) {
	if (!state.logged) {
		showToast("Inicia sesion para guardar peliculas.", "info");
		return;
	}

	if (isMovieSaved(movie.id)) {
		showToast("La pelicula ya estaba en tu coleccion.", "info");
		return;
	}

	if (state.savingIds.has(movie.id)) {
		return;
	}

	state.savingIds.add(movie.id);
	renderSearchResults(state.searchResults);
	renderModalFavoriteState();

	try {
		const response = await fetch(`${API}/watchlist`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-auth-token": state.authToken || ""
			},
			body: JSON.stringify({
				id_usuario: state.userId,
				external_id: movie.id,
				titulo: movie.titulo,
				categoria: Array.isArray(movie.categoria) ? movie.categoria.join(",") : String(movie.categoria || "General"),
				imagen: movie.imagen || PLACEHOLDER_IMAGE,
				nota_personal: String(movie.descripcion || "Sin descripcion disponible para esta pelicula.")
			})
		});

		const payload = await safeJson(response);

		if (!response.ok) {
			throw new Error(payload?.message || payload?.error || "No se pudo guardar la pelicula.");
		}

		showToast(`"${movie.titulo}" agregada a tu coleccion.`, "success");
		setStatus(elements.collectionStatus, "Coleccion actualizada.", "success");
		await loadCollection({ silentStatus: true });
	} catch (error) {
		showToast(error.message || "Error al guardar", "error");
	} finally {
		state.savingIds.delete(movie.id);
		renderSearchResults(state.searchResults);
		renderModalFavoriteState();
	}
}

async function loadCollection(options = {}) {
	const { notify = false, silentStatus = false } = options;

	if (!state.logged || !state.userId) {
		state.watchlist = [];
		renderCollection();
		if (!silentStatus) {
			setStatus(elements.collectionStatus, "Inicia sesion para ver tu coleccion.");
		}
		return;
	}

	if (!silentStatus) {
		setStatus(elements.collectionStatus, "Cargando coleccion...", "loading");
	}

	setLoadingState(elements.coleccion, true);
	renderSkeleton(elements.coleccion, 4);

	try {
		const response = await fetch(`${API}/watchlist?id_usuario=${state.userId}`, {
			headers: { "x-auth-token": state.authToken || "" }
		});
		const payload = await safeJson(response);

		if (!response.ok) {
			throw new Error(payload?.error || "No se pudo cargar la coleccion.");
		}

		const items = Array.isArray(payload) ? payload : [];
		state.watchlist = items.map(normalizeWatchlistMovie).filter((movie) => movie.id);
		renderCollection();
		renderSearchResults(state.searchResults);
		renderModalFavoriteState();

		if (!silentStatus) {
			const text = state.watchlist.length
				? `${state.watchlist.length} peliculas en tu coleccion.`
				: "Tu coleccion aun esta vacia.";
			setStatus(elements.collectionStatus, text, state.watchlist.length ? "success" : "");
		}

		if (notify) {
			showToast("Coleccion actualizada.", "info");
		}
	} catch (error) {
		state.watchlist = [];
		renderEmptyState(elements.coleccion, "No se pudo cargar la coleccion.", "Intenta nuevamente en unos segundos.");
		renderModalFavoriteState();
		setStatus(elements.collectionStatus, error.message || "Error al cargar coleccion.", "error");

		if (notify) {
			showToast(error.message || "Error al actualizar coleccion", "error");
		}
	} finally {
		setLoadingState(elements.coleccion, false);
	}
}

function renderCollection() {
	elements.coleccion.innerHTML = "";

	if (!state.watchlist.length) {
		renderEmptyState(
			elements.coleccion,
			"Tu coleccion esta vacia.",
			state.logged ? "Guarda peliculas desde la busqueda para verlas aqui." : "Inicia sesion para gestionar favoritos."
		);
		return;
	}

	const fragment = document.createDocumentFragment();

	state.watchlist.forEach((movie, index) => {
		const isRemoving = state.removingIds.has(movie.id);

		const card = document.createElement("article");
		card.className = "card";
		card.style.animationDelay = `${Math.min(index * 30, 220)}ms`;

		const image = document.createElement("img");
		image.src = movie.imagen || PLACEHOLDER_IMAGE;
		image.alt = `Poster de ${movie.titulo}`;
		image.loading = "lazy";
		image.decoding = "async";
		image.addEventListener("error", () => {
			image.src = PLACEHOLDER_IMAGE;
		});

		const posterBtn = document.createElement("button");
		posterBtn.type = "button";
		posterBtn.className = "poster-btn";
		posterBtn.setAttribute("aria-label", `Abrir detalle de ${movie.titulo}`);
		posterBtn.appendChild(image);
		posterBtn.addEventListener("click", () => {
			openMovieModal(movie, "Pelicula en tu coleccion");
		});

		const footer = document.createElement("div");
		footer.className = "card-footer";
		const footerTitle = document.createElement("strong");
		footerTitle.className = "card-footer__title";
		footerTitle.textContent = movie.titulo;
		const footerYear = document.createElement("span");
		footerYear.className = "card-footer__year";
		footerYear.textContent = movie.fecha ? String(movie.fecha).slice(0, 4) : "";
		footer.append(footerTitle, footerYear);
		const actions = document.createElement("div");
		actions.className = "card-actions";

		const internalLinks = getInternalLinksForMovie(movie);
		if (internalLinks.length) {
			const watchBtn = document.createElement("button");
			watchBtn.type = "button";
			watchBtn.className = "watch-icon-btn";
			watchBtn.innerHTML = '<span aria-hidden="true">▶</span> Ver pelicula';
			watchBtn.setAttribute("aria-label", `Ver pelicula ${movie.titulo}`);
			watchBtn.addEventListener("click", () => {
				openMovieModal(movie, "Reproduccion interna", { autoplayUrl: internalLinks[0] });
			});
			actions.appendChild(watchBtn);
		}

		const removeBtn = document.createElement("button");
		removeBtn.type = "button";
		removeBtn.className = "remove-btn";
		removeBtn.textContent = isRemoving ? "Eliminando..." : "Eliminar";
		removeBtn.disabled = !state.logged || isRemoving;

		if (!state.logged) {
			removeBtn.title = "Inicia sesion para eliminar favoritos";
		}

		removeBtn.addEventListener("click", () => {
			removeMovie(movie.id);
		});

		actions.appendChild(removeBtn);
		card.append(posterBtn, footer, actions);
		fragment.appendChild(card);
	});

	elements.coleccion.appendChild(fragment);
}

async function removeMovie(watchlistId) {
	if (!state.logged) {
		showToast("Inicia sesion para eliminar peliculas.", "info");
		return;
	}

	if (state.removingIds.has(watchlistId)) {
		return;
	}

	state.removingIds.add(watchlistId);
	renderCollection();
	renderModalFavoriteState();

	try {
		const response = await fetch(`${API}/watchlist/${watchlistId}`, {
			method: "DELETE",
			headers: { "x-auth-token": state.authToken || "" }
		});

		const payload = await safeJson(response);

		if (!response.ok) {
			throw new Error(payload?.error || "No se pudo eliminar la pelicula.");
		}

		state.watchlist = state.watchlist.filter((movie) => movie.id !== watchlistId);
		renderCollection();
		renderSearchResults(state.searchResults);
		setStatus(elements.collectionStatus, "Pelicula eliminada de favoritos.", "success");
		showToast("Pelicula eliminada de tu coleccion.", "success");
	} catch (error) {
		setStatus(elements.collectionStatus, error.message || "Error al eliminar pelicula.", "error");
		showToast(error.message || "Error al eliminar", "error");
	} finally {
		state.removingIds.delete(watchlistId);
		renderCollection();
		renderModalFavoriteState();
	}
}

function isMovieSaved(externalId) {
	return state.watchlist.some((movie) => Number(movie.external_id) === Number(externalId));
}

function setStatus(target, text, type = "") {
	const baseText = String(text || "");
	let visibleText = baseText;

	if (state.colorblind) {
		if (type === "loading") {
			visibleText = `[Cargando] ${baseText}`;
		}

		if (type === "error") {
			visibleText = `[Error] ${baseText}`;
		}

		if (type === "success") {
			visibleText = `[OK] ${baseText}`;
		}
	}

	target.textContent = visibleText;
	target.classList.remove("is-loading", "is-error", "is-success");

	if (type === "loading") {
		target.classList.add("is-loading");
	}

	if (type === "error") {
		target.classList.add("is-error");
	}

	if (type === "success") {
		target.classList.add("is-success");
	}
}

function setLoadingState(container, isLoading) {
	container.setAttribute("aria-busy", String(isLoading));
}

function cancelActiveSearch() {
	if (state.searchController) {
		state.searchController.abort();
		state.searchController = null;
	}

	state.activeSearchId += 1;
	setLoadingState(elements.resultados, false);
}

function renderSkeleton(container, count) {
	container.innerHTML = "";

	for (let i = 0; i < count; i += 1) {
		const skeleton = document.createElement("div");
		skeleton.className = "card-skeleton";
		skeleton.setAttribute("aria-hidden", "true");
		container.appendChild(skeleton);
	}
}

function renderEmptyState(container, title, description) {
	container.innerHTML = `
		<div class="empty-state">
			<strong>${title}</strong>
			<p>${description}</p>
		</div>
	`;
}

function normalizeMovie(movie) {
	if (!movie || typeof movie !== "object") {
		return {};
	}

	return {
		id: Number(movie.id || movie.external_id || 0),
		external_id: Number(movie.external_id || movie.id || 0),
		titulo: String(movie.titulo || movie.title || "Sin titulo"),
		categoria: movie.categoria || movie.genre_ids || "General",
		imagen: movie.imagen || movie.poster || PLACEHOLDER_IMAGE,
		fecha: movie.fecha || movie.release_date || "",
		descripcion: movie.descripcion || movie.overview || ""
	};
}

function normalizeWatchlistMovie(movie) {
	if (!movie || typeof movie !== "object") {
		return {};
	}

	const personalNote = String(movie.nota_personal || "").trim();
	const normalizedDescription =
		personalNote && personalNote !== "Guardada desde Movie +"
			? personalNote
			: "Sin descripcion disponible para esta pelicula.";

	return {
		id: Number(movie.id || 0),
		external_id: Number(movie.external_id || 0),
		titulo: String(movie.titulo || "Sin titulo"),
		categoria: movie.categoria || "General",
		imagen: movie.imagen || PLACEHOLDER_IMAGE,
		nota_personal: personalNote,
		descripcion: normalizedDescription,
		fecha: ""
	};
}

function buildModalMovie(movie, sourceLabel) {
	const safeMovie = movie && typeof movie === "object" ? movie : {};
	const tmdbId = Number(safeMovie.external_id || safeMovie.id || 0);

	return {
		id: tmdbId,
		external_id: tmdbId,
		titulo: String(safeMovie.titulo || safeMovie.title || "Sin titulo"),
		original_title: String(safeMovie.original_title || safeMovie.titulo || safeMovie.title || ""),
		original_language: String(safeMovie.original_language || "en"),
		categoria: safeMovie.categoria || safeMovie.genre_ids || "General",
		imagen: safeMovie.imagen || safeMovie.poster || PLACEHOLDER_IMAGE,
		fecha: safeMovie.fecha || safeMovie.release_date || "",
		descripcion: safeMovie.descripcion || safeMovie.nota_personal || "",
		sourceLabel: sourceLabel || "Detalle"
	};
}

function openMovieModal(movie, sourceLabel, options = {}) {
	const safeMovie = buildModalMovie(movie, sourceLabel);
	const movieImage = safeMovie.imagen || PLACEHOLDER_IMAGE;
	const movieTitle = safeMovie.titulo || "Sin titulo";
	const movieDescription = safeMovie.descripcion || "Sin informacion disponible.";
	const yearText = safeMovie.fecha ? String(safeMovie.fecha).slice(0, 4) : "Sin fecha";
	const categoryText = formatCategory(safeMovie.categoria);

	elements.movieModalImage.src = movieImage;
	elements.movieModalImage.alt = `Poster ampliado de ${movieTitle}`;
	elements.movieModalImage.onerror = () => {
		elements.movieModalImage.src = PLACEHOLDER_IMAGE;
	};

	elements.movieModalTitle.textContent = movieTitle;
	elements.movieModalTag.textContent = yearText;
	elements.movieModalMeta.textContent = `${categoryText} | ${safeMovie.sourceLabel}`;
	elements.movieModalDescription.textContent = movieDescription;
	state.modalMovie = safeMovie;
	renderModalFavoriteState();
	resetProvidersState();
	resetPlayerState();
	renderTorrentSearch(safeMovie);

	if (safeMovie.external_id > 0) {
		enrichModalDescription(safeMovie.external_id);
	}

	startProvidersRealtimeUpdate();

	state.lastFocusBeforeModal = document.activeElement;
	elements.movieModal.hidden = false;
	document.body.classList.add("modal-open");
	elements.movieModalContent.focus();
}

function closeMovieModal() {
	stopProvidersRealtimeUpdate();
	state.modalMovie = null;
	elements.movieModal.hidden = true;
	document.body.classList.remove("modal-open");

	if (state.lastFocusBeforeModal && typeof state.lastFocusBeforeModal.focus === "function") {
		state.lastFocusBeforeModal.focus();
	}
}

async function enrichModalDescription(externalId) {
	const FALLBACKS = [
		"Sin descripcion disponible para esta pelicula.",
		"Sin informacion disponible.",
		""
	];
	const currentDesc = (elements.movieModalDescription.textContent || "").trim();
	if (currentDesc && !FALLBACKS.includes(currentDesc)) {
		return;
	}
	try {
		const response = await fetch(`${API}/peliculas/${externalId}`);
		if (!response.ok) return;
		const data = await safeJson(response);
		const freshDesc = String(data?.descripcion || "").trim();
		if (freshDesc) {
			elements.movieModalDescription.textContent = freshDesc;
			if (state.modalMovie) {
				state.modalMovie.descripcion = freshDesc;
			}
		}
	} catch (_) { /* silent */ }
}

function resetPlayerState() {
	elements.moviePlayerLinks.innerHTML = "";
	elements.moviePlayerLinks.hidden = false;
	elements.moviePlayerFrame.src = "";
	elements.moviePlayerFrame.style.display = "none";
	if (elements.moviePlayerVideo) {
		elements.moviePlayerVideo.src = "";
		elements.moviePlayerVideo.style.display = "none";
		elements.moviePlayerVideo.load();
		elements.moviePlayerVideo.querySelectorAll("track").forEach(t => t.remove());
	}
	const controls = document.getElementById("torrentPlayerControls");
	if (controls) controls.remove();
	elements.moviePlayerContainer.hidden = true;
	elements.moviePlayerStatus.textContent = "";
}

// ===================== TORRENT LANGUAGE MAP =====================
const TORRENT_LANG_OPTIONS = {
	"all":    { label: "Todos los idiomas", keywords: [] },
	"es-lat": { label: "Español Latino",    keywords: ["latino", "lat", "spanish", "espanol", "español"] },
	"es-es":  { label: "Español España",    keywords: ["castellano", "spanish", "españa", "espanol"] },
	"en":     { label: "English",           keywords: [] },
	"pt-br":  { label: "Português Brasil",  keywords: ["dublado", "legendado", "portugues", "brazilian"] },
	"fr":     { label: "Français",          keywords: ["french", "vff", "vostfr", "truefrench"] },
	"de":     { label: "Deutsch",           keywords: ["german", "deutsch"] },
	"it":     { label: "Italiano",          keywords: ["italian", "italiano"] },
	"ja":     { label: "日本語",              keywords: ["japanese", "jpn"] },
	"ko":     { label: "한국어",              keywords: ["korean", "kor"] },
	"zh":     { label: "中文",               keywords: ["chinese", "mandarin"] },
	"hi":     { label: "हिन्दी",              keywords: ["hindi", "hin"] },
	"ru":     { label: "Русский",           keywords: ["russian", "rus"] }
};

function getSelectedTorrentLang() {
	return localStorage.getItem("movieplus:torrentLang") || "all";
}
function setSelectedTorrentLang(lang) {
	localStorage.setItem("movieplus:torrentLang", lang);
}

// ── Torrent format compatibility ──────────────────────────────────────────
const COMPAT_EXTS = {
	high:   ["mp4", "webm", "m4v"],
	medium: ["mkv"],
	low:    ["avi", "wmv", "mov", "ts", "flv", "mpg", "mpeg", "ogv", "divx", "vob"]
};
const COMPAT_META = {
	high:    { color: "#2ecc71", textColor: "#000", title: "Alta compatibilidad (reproduce directo en navegador)" },
	medium:  { color: "#f39c12", textColor: "#000", title: "Compatibilidad media — MKV puede reproducirse si el codec es H.264" },
	low:     { color: "#e74c3c", textColor: "#fff", title: "Baja compatibilidad — probablemente no se reproduzca en el navegador" },
	unknown: { color: "#555",    textColor: "#fff", title: "Formato desconocido" }
};

function getTorrentExtInfo(title) {
	const match = (title || "").match(/\.(mp4|webm|m4v|mkv|avi|wmv|mov|ts|flv|mpg|mpeg|ogv|divx|vob)\b/i);
	const ext = match ? match[1].toLowerCase() : null;
	if (!ext) return { ext: null, level: "unknown", ...COMPAT_META.unknown };
	if (COMPAT_EXTS.high.includes(ext))   return { ext, level: "high",    ...COMPAT_META.high };
	if (COMPAT_EXTS.medium.includes(ext)) return { ext, level: "medium",  ...COMPAT_META.medium };
	return { ext, level: "low", ...COMPAT_META.low };
}

// ===================== TORRENT INTEGRATION =====================
function renderTorrentSearch(movie) {
	elements.moviePlayerLinks.innerHTML = "";
	elements.moviePlayerLinks.hidden = false;

	// ── Language selector ──
	const langRow = document.createElement("div");
	langRow.className = "torrent-selector-row";
	const langLabel = document.createElement("span");
	langLabel.className = "torrent-selector-label";
	langLabel.textContent = "🌐 Idioma";
	langRow.appendChild(langLabel);

	const langGroup = document.createElement("div");
	langGroup.className = "selector-group selector-group--scroll";
	langGroup.setAttribute("role", "group");
	langGroup.setAttribute("aria-label", "Seleccionar idioma para buscar torrents");

	const savedLang = getSelectedTorrentLang();
	for (const [code, info] of Object.entries(TORRENT_LANG_OPTIONS)) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "selector-option" + (code === savedLang ? " is-active" : "");
		btn.dataset.value = code;
		btn.setAttribute("aria-pressed", String(code === savedLang));
		btn.textContent = code === "all" ? "🌐 Todos" : info.label;
		btn.addEventListener("click", () => {
			setSelectedTorrentLang(code);
			langGroup.querySelectorAll(".selector-option").forEach(b => {
				b.classList.toggle("is-active", b.dataset.value === code);
				b.setAttribute("aria-pressed", String(b.dataset.value === code));
			});
		});
		langGroup.appendChild(btn);
	}
	langRow.appendChild(langGroup);

	// ── Quality selector ──
	const qualRow = document.createElement("div");
	qualRow.className = "torrent-selector-row";
	const qualLabel = document.createElement("span");
	qualLabel.className = "torrent-selector-label";
	qualLabel.textContent = "📺 Calidad";
	qualRow.appendChild(qualLabel);

	const qualGroup = document.createElement("div");
	qualGroup.className = "selector-group";
	qualGroup.setAttribute("role", "group");
	qualGroup.setAttribute("aria-label", "Seleccionar calidad preferida");

	const qualOptions = [
		{ value: "all", label: "Todas", icon: "🎬" },
		{ value: "4k", label: "4K", icon: "✨" },
		{ value: "1080p", label: "1080p", icon: "🔷" },
		{ value: "720p", label: "720p", icon: "🔹" },
		{ value: "480p", label: "480p", icon: "📱" }
	];
	const savedQual = localStorage.getItem("movieplus:torrentQuality") || "all";
	qualOptions.forEach(q => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "selector-option" + (q.value === savedQual ? " is-active" : "");
		btn.dataset.value = q.value;
		btn.setAttribute("aria-pressed", String(q.value === savedQual));
		btn.innerHTML = `<span aria-hidden="true">${q.icon}</span> ${q.label}`;
		btn.addEventListener("click", () => {
			localStorage.setItem("movieplus:torrentQuality", q.value);
			qualGroup.querySelectorAll(".selector-option").forEach(b => {
				b.classList.toggle("is-active", b.dataset.value === q.value);
				b.setAttribute("aria-pressed", String(b.dataset.value === q.value));
			});
		});
		qualGroup.appendChild(btn);
	});
	qualRow.appendChild(qualGroup);

	// ── Compatibility filter ──
	const compatRow = document.createElement("div");
	compatRow.className = "torrent-selector-row";
	const compatLabel = document.createElement("span");
	compatLabel.className = "torrent-selector-label";
	compatLabel.textContent = "📱 Compatibilidad";
	compatRow.appendChild(compatLabel);

	const compatGroup = document.createElement("div");
	compatGroup.className = "selector-group";
	compatGroup.setAttribute("role", "group");
	compatGroup.setAttribute("aria-label", "Filtrar por compatibilidad del formato");

	const compatOptions = [
		{ value: "all",    icon: "🎬", label: "Todos",      hint: "Mostrar todos los formatos" },
		{ value: "high",   icon: "🟢", label: "MP4/WebM",   hint: "Alta compatibilidad — reproduce directo en navegador" },
		{ value: "medium", icon: "🟡", label: "MKV",        hint: "Media — MKV con codec H.264 suele funcionar" },
		{ value: "low",    icon: "🔴", label: "AVI/otros",  hint: "Baja — puede no reproducirse en el navegador" }
	];
	const savedCompat = localStorage.getItem("movieplus:torrentCompat") || "all";
	compatOptions.forEach(opt => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "selector-option" + (opt.value === savedCompat ? " is-active" : "");
		btn.dataset.value = opt.value;
		btn.setAttribute("aria-pressed", String(opt.value === savedCompat));
		btn.title = opt.hint;
		btn.innerHTML = `<span aria-hidden="true">${opt.icon}</span> ${opt.label}`;
		btn.addEventListener("click", () => {
			localStorage.setItem("movieplus:torrentCompat", opt.value);
			compatGroup.querySelectorAll(".selector-option").forEach(b => {
				b.classList.toggle("is-active", b.dataset.value === opt.value);
				b.setAttribute("aria-pressed", String(b.dataset.value === opt.value));
			});
		});
		compatGroup.appendChild(btn);
	});
	compatRow.appendChild(compatGroup);

	// ── Hint text ──
	const compatHint = document.createElement("p");
	compatHint.className = "torrent-compat-hint";
	compatHint.innerHTML = '🟢 MP4/WebM = reproducción directa &nbsp;|&nbsp; 🟡 MKV = depende del codec &nbsp;|&nbsp; 🔴 AVI/otros = baja compatibilidad';

	const torrentBtn = document.createElement("button");
	torrentBtn.type = "button";
	torrentBtn.className = "btn btn-primary torrent-search-btn";
	torrentBtn.innerHTML = '<span aria-hidden="true">🔍</span> Buscar torrents para reproducir';

	const torrentResultsDiv = document.createElement("div");
	torrentResultsDiv.id = "torrentResultsDiv";
	torrentResultsDiv.className = "torrent-results";

	torrentBtn.onclick = () => buscarYMostrarTorrents(movie, torrentResultsDiv);

	elements.moviePlayerLinks.appendChild(langRow);
	elements.moviePlayerLinks.appendChild(qualRow);
	elements.moviePlayerLinks.appendChild(compatRow);
	elements.moviePlayerLinks.appendChild(compatHint);
	elements.moviePlayerLinks.appendChild(torrentBtn);
	elements.moviePlayerLinks.appendChild(torrentResultsDiv);
}

async function buscarYMostrarTorrents(movie, resultsDiv) {
	const titulo = typeof movie === "string" ? movie : (movie.titulo || "");
	const tmdbId = typeof movie === "string" ? "" : (movie.id || movie.external_id || "");
	const langCode = getSelectedTorrentLang();

	resultsDiv.innerHTML = "<span style='color: #aaa'>Buscando torrents...</span>";
	elements.moviePlayerStatus.textContent = "";

	try {
		const params = new URLSearchParams({ query: titulo });
		if (tmdbId) params.set("tmdbId", tmdbId);
		if (langCode !== "all") params.set("lang", langCode);
		const searchUrl = `${API}/api/torrent/search?${params.toString()}`;

		const res = await fetch(searchUrl);
		const data = res.ok ? await res.json() : { results: [] };

		if (!data.results || data.results.length === 0) {
			resultsDiv.innerHTML = "<span style='color: #e74c3c'>No se encontraron torrents para este título.</span>";
			elements.moviePlayerStatus.textContent = "No se encontraron torrents.";
			return;
		}

		let filtered = data.results;

		// Quality filter from saved preference
		const qualPref = localStorage.getItem("movieplus:torrentQuality") || "all";
		if (qualPref !== "all") {
			const qualFiltered = filtered.filter(r => r.detectedQuality === qualPref);
			if (qualFiltered.length > 0) filtered = qualFiltered;
		}

		// Compatibility format filter
		const compatPref = localStorage.getItem("movieplus:torrentCompat") || "all";
		if (compatPref !== "all") {
			const compatFiltered = filtered.filter(r => getTorrentExtInfo(r.title).level === compatPref);
			if (compatFiltered.length > 0) filtered = compatFiltered;
		}

		// Sort by seeds
		filtered.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));

		resultsDiv.innerHTML = "";

		// Quality tag colors
		const QUALITY_COLORS = {
			"4k": "#e6b800", "1080p": "#2ecc71", "720p": "#3498db",
			"480p": "#95a5a6", "cam": "#e74c3c", "unknown": "#666"
		};
		const LANG_LABELS = {
			"en": "EN", "es-lat": "ES-LAT", "es-es": "ES-ES", "pt-br": "PT-BR",
			"fr": "FR", "de": "DE", "it": "IT", "ja": "JA", "ko": "KO",
			"zh": "ZH", "hi": "HI", "ru": "RU", "dual": "DUAL"
		};

		filtered.slice(0, 20).forEach((torrent) => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "movie-link-pill torrent-result-btn";

			const qualColor = QUALITY_COLORS[torrent.detectedQuality] || "#666";
			const qualLabel = (torrent.detectedQuality || "?").toUpperCase();
			const langLabel = LANG_LABELS[torrent.detectedLang] || torrent.detectedLang?.toUpperCase() || "";
			const seedsText = torrent.seeds ? `${torrent.seeds}` : "0";
			const extInfo = getTorrentExtInfo(torrent.title);
			const extBadge = extInfo.ext
				? `<span style="display:inline-block;background:${extInfo.color};color:${extInfo.textColor};border-radius:3px;padding:1px 5px;font-size:0.75em;font-weight:bold;margin-right:4px" title="${extInfo.title}">${extInfo.ext.toUpperCase()}</span>`
				: "";

			btn.innerHTML = `<span style="display:inline-block;background:${qualColor};color:#000;border-radius:3px;padding:1px 5px;font-size:0.75em;font-weight:bold;margin-right:4px">${qualLabel}</span>`
				+ (langLabel ? `<span style="display:inline-block;background:#555;color:#fff;border-radius:3px;padding:1px 5px;font-size:0.75em;margin-right:4px">${langLabel}</span>` : "")
				+ extBadge
				+ `<span style="color:#2ecc71;font-size:0.8em;margin-right:6px">⬆${seedsText}</span>`
				+ `<span>${torrent.title || 'Torrent'}</span>`
				+ (torrent.size ? ` <span style="color:#888;font-size:0.85em">(${torrent.size})</span>` : "");

			btn.onclick = () => openTorrentInNewWindow(torrent);
			resultsDiv.appendChild(btn);
		});
	} catch (err) {
		resultsDiv.innerHTML = "<span style='color: #e74c3c'>Error al buscar torrents.</span>";
		elements.moviePlayerStatus.textContent = "Error de conexión al buscar torrents.";
	}
}

// ===================== TORRENT NEW WINDOW =====================
function openTorrentInNewWindow(torrent) {
	if (!torrent.magnet) {
		showToast("Este torrent no tiene magnet link disponible.", "error");
		return;
	}
	const title = encodeURIComponent(torrent.title || "Torrent");
	const magnet = encodeURIComponent(torrent.magnet);
	const playerUrl = `player.html?magnet=${magnet}&title=${title}`;
	const win = window.open(playerUrl, "_blank", "width=1080,height=680,noopener,noreferrer");
	if (!win) {
		showToast("El navegador bloqueó la nueva ventana. Permite ventanas emergentes e intenta de nuevo.", "error");
	}
}

// ===================== CONTENT FILTERS (age/admin) =====================
function initContentFilters() {
	// Show/hide admin-only settings card
	const adminCard = document.getElementById("adminApiCard");
	if (adminCard) {
		adminCard.hidden = !state.is_admin;
	}

	// Show familiar mode badge for minors
	if (state.is_minor && state.logged) {
		const sidebar = document.getElementById("sidebar");
		if (sidebar && !document.getElementById("familiarBadge")) {
			const badge = document.createElement("div");
			badge.id = "familiarBadge";
			badge.className = "familiar-badge";
			badge.innerHTML = "<span aria-hidden='true'>🔒</span> Modo Familiar activo";
			badge.title = "Contenido filtrado para menores de 18 años";
			const footer = sidebar.querySelector(".sidebar__footer");
			if (footer) sidebar.insertBefore(badge, footer);
			else sidebar.appendChild(badge);
		}
	}
}

// ===================== TORRENT PLAYBACK WITH CONTROLS =====================

let _torrentPlaybackLock = false;

async function startTorrentPlayback(torrent) {
	if (_torrentPlaybackLock) {
		elements.moviePlayerStatus.textContent = "Ya se está cargando un torrent, espera...";
		return;
	}
	if (!torrent.magnet) {
		elements.moviePlayerStatus.textContent = "Este torrent no tiene magnet link disponible.";
		return;
	}

	_torrentPlaybackLock = true;

	elements.moviePlayerFrame.style.display = "none";
	elements.moviePlayerFrame.src = "";
	elements.moviePlayerContainer.hidden = false;
	elements.moviePlayerStatus.textContent = "Conectando al torrent... obteniendo archivos...";

	const video = elements.moviePlayerVideo;
	if (!video) return;
	video.src = "";
	video.style.display = "block";

	// Remove old subtitle tracks
	video.querySelectorAll("track").forEach(t => t.remove());

	try {
		// Fetch torrent file info (videos + subtitles)
		const infoRes = await fetch(`${API}/api/torrent/info?magnet=${encodeURIComponent(torrent.magnet)}`);
		if (!infoRes.ok) {
			_torrentPlaybackLock = false;
			// Fallback to legacy stream
			video.src = `${API}/api/torrent/stream?magnet=${encodeURIComponent(torrent.magnet)}`;
			video.load();
			elements.moviePlayerStatus.textContent = "Conectando al torrent...";
			setupVideoEvents(video, torrent.title);
			return;
		}

		const info = await infoRes.json();

		// Check if torrent has any video files
		if (!info.videos || info.videos.length === 0) {
			// Detect if it's a music/audio torrent
			const isMusic = info.name && /flac|mp3|album|discograph|aac|ogg/i.test(info.name);
			elements.moviePlayerStatus.textContent = isMusic
				? `Este torrent es de música, no de video: "${info.name}". Prueba otro torrent.`
				: `No se encontraron archivos de video en este torrent: "${info.name}". Prueba otro.`;
			video.style.display = "none";
			_torrentPlaybackLock = false;
			return;
		}

		// Pick video based on quality preference
		const qualPref = localStorage.getItem("movieplus:torrentQuality") || "all";
		let selectedVideo = pickVideoByQuality(info.videos, qualPref);
		if (!selectedVideo && info.videos.length > 0) selectedVideo = info.videos[0];

		if (!selectedVideo) {
			elements.moviePlayerStatus.textContent = "No se encontró archivo de video en el torrent.";
			return;
		}

		// Set video source
		const videoUrl = `${API}/api/torrent/file?magnet=${encodeURIComponent(torrent.magnet)}&index=${selectedVideo.index}`;
		video.src = videoUrl;

		// Add subtitles if available
		const subtitlePref = localStorage.getItem("movieplus:subtitles") || "on";
		if (info.subtitles && info.subtitles.length > 0 && subtitlePref !== "off") {
			info.subtitles.forEach((sub, i) => {
				const track = document.createElement("track");
				track.kind = "subtitles";
				track.label = sub.label || `Subtítulo ${i + 1}`;
				track.srclang = sub.lang || "und";
				track.src = `${API}/api/torrent/file?magnet=${encodeURIComponent(torrent.magnet)}&index=${sub.index}`;
				if (i === 0) track.default = true;
				video.appendChild(track);
			});
		}

		video.load();

		// Build player controls bar
		renderPlayerControls(info, torrent, selectedVideo);
		setupVideoEvents(video, torrent.title);
		_torrentPlaybackLock = false;

	} catch (err) {
		_torrentPlaybackLock = false;
		elements.moviePlayerStatus.textContent = "Error al obtener info del torrent. Prueba otro con más seeds.";
		video.style.display = "none";
	}
}

function pickVideoByQuality(videos, pref) {
	if (!videos || videos.length === 0) return null;
	if (pref === "all" || !pref) return videos[0]; // Largest file

	const qualOrder = { "4k": 4, "1080p": 3, "720p": 2, "480p": 1 };
	const prefLevel = qualOrder[pref] || 3;

	// Try to match quality in filename
	const withQual = videos.map(v => {
		const name = v.name.toLowerCase();
		let q = 0;
		if (/2160p|4k|uhd/.test(name)) q = 4;
		else if (/1080p/.test(name)) q = 3;
		else if (/720p/.test(name)) q = 2;
		else if (/480p/.test(name)) q = 1;
		return { ...v, qualLevel: q };
	});

	// Exact match first
	const exact = withQual.find(v => v.qualLevel === prefLevel);
	if (exact) return exact;

	// Nearest below preference
	const sorted = withQual.filter(v => v.qualLevel > 0).sort((a, b) => Math.abs(a.qualLevel - prefLevel) - Math.abs(b.qualLevel - prefLevel));
	return sorted[0] || videos[0];
}

function setupVideoEvents(video, title) {
	video.onloadeddata = () => {
		elements.moviePlayerStatus.textContent = `Reproduciendo: ${title || 'Torrent'}`;
	};
	video.onerror = () => {
		elements.moviePlayerStatus.textContent = "Error al reproducir. Prueba otro torrent con más seeds.";
	};
}

function renderPlayerControls(info, torrent, currentVideo) {
	// Remove existing controls bar if any
	const existing = document.getElementById("torrentPlayerControls");
	if (existing) existing.remove();

	const bar = document.createElement("div");
	bar.id = "torrentPlayerControls";
	bar.className = "player-controls-bar";

	// ── Quality selector (only if multiple video files available) ──
	if (info.videos.length > 1) {
		const qualGroup = document.createElement("div");
		qualGroup.className = "player-control-group";

		const qualLabel = document.createElement("span");
		qualLabel.className = "player-control-label";
		qualLabel.textContent = "📺 Calidad";
		qualGroup.appendChild(qualLabel);

		const qualBtns = document.createElement("div");
		qualBtns.className = "selector-group selector-group--scroll";
		qualBtns.setAttribute("role", "group");
		qualBtns.setAttribute("aria-label", "Seleccionar calidad de video");

		info.videos.forEach(v => {
			const btn = document.createElement("button");
			btn.type = "button";
			const shortName = v.name.replace(/^.*[\\/]/, "").replace(/\.(mkv|mp4|avi|mov|webm)$/i, "");
			btn.className = "selector-option" + (v.index === currentVideo.index ? " is-active" : "");
			btn.dataset.value = String(v.index);
			btn.setAttribute("aria-pressed", String(v.index === currentVideo.index));
			btn.title = `${shortName} (${v.size})`;
			btn.textContent = `${shortName.slice(0, 18)}${shortName.length > 18 ? "…" : ""} · ${v.size}`;
			btn.addEventListener("click", () => {
				const video = elements.moviePlayerVideo;
				video.src = `${API}/api/torrent/file?magnet=${encodeURIComponent(torrent.magnet)}&index=${v.index}`;
				video.load();
				video.play();
				qualBtns.querySelectorAll(".selector-option").forEach(b => {
					b.classList.toggle("is-active", b.dataset.value === String(v.index));
					b.setAttribute("aria-pressed", String(b.dataset.value === String(v.index)));
				});
			});
			qualBtns.appendChild(btn);
		});

		qualGroup.appendChild(qualBtns);
		bar.appendChild(qualGroup);
	}

	// ── Subtitle selector ──
	const subGroup = document.createElement("div");
	subGroup.className = "player-control-group";

	const subLabel = document.createElement("span");
	subLabel.className = "player-control-label";
	subLabel.textContent = "💬 Subtítulos";
	subGroup.appendChild(subLabel);

	const subBtns = document.createElement("div");
	subBtns.className = "selector-group selector-group--scroll";
	subBtns.setAttribute("role", "group");
	subBtns.setAttribute("aria-label", "Seleccionar subtítulos");

	const savedSubPref = localStorage.getItem("movieplus:subtitles") || "on";

	// Off option
	const offBtn = document.createElement("button");
	offBtn.type = "button";
	offBtn.className = "selector-option" + (savedSubPref === "off" ? " is-active" : "");
	offBtn.dataset.value = "off";
	offBtn.setAttribute("aria-pressed", String(savedSubPref === "off"));
	offBtn.innerHTML = '<span aria-hidden="true">🚫</span> Desactivados';
	offBtn.addEventListener("click", () => {
		const video = elements.moviePlayerVideo;
		const tracks = video.textTracks;
		for (let i = 0; i < tracks.length; i++) tracks[i].mode = "hidden";
		localStorage.setItem("movieplus:subtitles", "off");
		subBtns.querySelectorAll(".selector-option").forEach(b => {
			b.classList.toggle("is-active", b.dataset.value === "off");
			b.setAttribute("aria-pressed", String(b.dataset.value === "off"));
		});
	});
	subBtns.appendChild(offBtn);

	if (info.subtitles && info.subtitles.length > 0) {
		info.subtitles.forEach((sub, i) => {
			const btn = document.createElement("button");
			btn.type = "button";
			const isActive = savedSubPref !== "off" && i === 0;
			btn.className = "selector-option" + (isActive ? " is-active" : "");
			btn.dataset.value = String(i);
			btn.setAttribute("aria-pressed", String(isActive));
			btn.innerHTML = `<span aria-hidden="true">💬</span> ${sub.label || `Sub ${i + 1}`}`;
			btn.addEventListener("click", () => {
				const video = elements.moviePlayerVideo;
				const tracks = video.textTracks;
				for (let j = 0; j < tracks.length; j++) tracks[j].mode = "hidden";
				if (tracks[i]) tracks[i].mode = "showing";
				localStorage.setItem("movieplus:subtitles", "on");
				subBtns.querySelectorAll(".selector-option").forEach(b => {
					b.classList.toggle("is-active", b.dataset.value === String(i));
					b.setAttribute("aria-pressed", String(b.dataset.value === String(i)));
				});
			});
			subBtns.appendChild(btn);
		});
	} else {
		const noSubBtn = document.createElement("button");
		noSubBtn.type = "button";
		noSubBtn.className = "selector-option";
		noSubBtn.disabled = true;
		noSubBtn.textContent = "No disponibles";
		subBtns.appendChild(noSubBtn);
	}

	subGroup.appendChild(subBtns);
	bar.appendChild(subGroup);

	// Insert after video container
	elements.moviePlayerContainer.insertAdjacentElement("afterend", bar);
}

function resetProvidersState() {
	elements.movieModalProvidersList.innerHTML = "";
	setStatus(elements.movieModalProvidersStatus, "Consultando plataformas disponibles...", "loading");
}

function startProvidersRealtimeUpdate() {
	stopProvidersRealtimeUpdate();

	if (!state.modalMovie || !state.modalMovie.id) {
		setStatus(elements.movieModalProvidersStatus, "No hay id valido para consultar plataformas.", "error");
		return;
	}

	fetchMovieProviders(state.modalMovie.id);

	state.providersIntervalId = window.setInterval(() => {
		if (elements.movieModal.hidden || !state.modalMovie || !state.modalMovie.id) {
			return;
		}

		fetchMovieProviders(state.modalMovie.id, { silent: true });
	}, 60000);
}

function stopProvidersRealtimeUpdate() {
	if (state.providersIntervalId) {
		window.clearInterval(state.providersIntervalId);
		state.providersIntervalId = null;
	}

	if (state.providersAbortController) {
		state.providersAbortController.abort();
		state.providersAbortController = null;
	}

	state.activeProvidersRequestId += 1;
}

async function fetchMovieProviders(movieId, options = {}) {
	const { silent = false } = options;

	if (!silent) {
		setStatus(elements.movieModalProvidersStatus, "Consultando plataformas disponibles...", "loading");
	}

	if (state.providersAbortController) {
		state.providersAbortController.abort();
	}

	state.providersAbortController = new AbortController();
	state.activeProvidersRequestId += 1;
	const requestId = state.activeProvidersRequestId;

	try {
		const response = await fetch(`${API}/peliculas/${movieId}/proveedores?country=MX`, {
			signal: state.providersAbortController.signal
		});
		const payload = await safeJson(response);

		if (requestId !== state.activeProvidersRequestId) {
			return;
		}

		if (!response.ok) {
			throw new Error(payload?.error || "No fue posible consultar plataformas.");
		}

		const providers = Array.isArray(payload?.providers) ? payload.providers : [];
		renderProviders(providers);

		if (!providers.length) {
			setStatus(
				elements.movieModalProvidersStatus,
				"No hay plataformas activas reportadas para esta pelicula en este momento."
			);
			return;
		}

		setStatus(
			elements.movieModalProvidersStatus,
			`${providers.length} plataformas encontradas.`,
			"success"
		);
	} catch (error) {
		if (error.name === "AbortError") {
			return;
		}

		if (requestId !== state.activeProvidersRequestId) {
			return;
		}

		renderProviders([]);
		setStatus(elements.movieModalProvidersStatus, error.message || "Error al consultar plataformas.", "error");
	} finally {
		if (requestId === state.activeProvidersRequestId) {
			state.providersAbortController = null;
		}
	}
}

const PROVIDER_URLS = {
	"netflix": "https://www.netflix.com",
	"amazon prime video": "https://www.amazon.com.mx/gp/video/storefront",
	"amazon video": "https://www.amazon.com.mx/gp/video/storefront",
	"hbo max": "https://www.max.com",
	"max": "https://www.max.com",
	"hbo max amazon channel": "https://www.amazon.com.mx/gp/video/storefront",
	"disney plus": "https://www.disneyplus.com",
	"disney+": "https://www.disneyplus.com",
	"apple tv": "https://tv.apple.com",
	"apple tv store": "https://tv.apple.com",
	"apple tv+": "https://tv.apple.com",
	"google play movies": "https://play.google.com/store/movies",
	"youtube": "https://www.youtube.com/movies",
	"claro video": "https://www.clarovideo.com",
	"vix": "https://www.vix.com",
	"star plus": "https://www.starplus.com",
	"star+": "https://www.starplus.com",
	"paramount plus": "https://www.paramountplus.com",
	"paramount+": "https://www.paramountplus.com",
	"mubi": "https://mubi.com",
	"tubi": "https://tubitv.com",
	"plex": "https://watch.plex.tv",
	"crunchyroll": "https://www.crunchyroll.com",
	"peacock": "https://www.peacocktv.com",
	"hulu": "https://www.hulu.com"
};

function getProviderUrl(name) {
	const key = String(name || "").toLowerCase().trim();
	return PROVIDER_URLS[key] || null;
}

function renderProviders(providers) {
	elements.movieModalProvidersList.innerHTML = "";

	if (!providers.length) {
		const emptyItem = document.createElement("li");
		emptyItem.className = "provider-chip";
		emptyItem.textContent = "Sin plataformas disponibles";
		elements.movieModalProvidersList.appendChild(emptyItem);
	} else {
		providers.forEach((provider) => {
			const name = provider?.nombre || "Plataforma";
			const url = getProviderUrl(name);
			const item = document.createElement("li");

			if (url) {
				const link = document.createElement("a");
				link.className = "provider-chip provider-chip--link";
				link.textContent = name;
				link.href = url;
				link.target = "_blank";
				link.rel = "noopener noreferrer";
				link.setAttribute("aria-label", `Ver en ${name} (abre en nueva pestana)`);
				item.appendChild(link);
			} else {
				const chip = document.createElement("span");
				chip.className = "provider-chip";
				chip.textContent = name;
				item.appendChild(chip);
			}

			elements.movieModalProvidersList.appendChild(item);
		});
	}
}

function getSavedMovieByExternalId(externalId) {
	return state.watchlist.find((movie) => Number(movie.external_id) === Number(externalId)) || null;
}

function renderModalFavoriteState() {
	const modalMovie = state.modalMovie;

	if (!modalMovie || !modalMovie.id) {
		elements.movieModalFavoriteBtn.disabled = true;
		elements.movieModalFavoriteBtn.classList.remove("remove");
		elements.movieModalFavoriteBtn.textContent = "Selecciona una pelicula";
		elements.movieModalFavoriteBtn.title = "";
		return;
	}

	const savedMovie = getSavedMovieByExternalId(modalMovie.id);
	const isSaved = Boolean(savedMovie);
	const isSaving = state.savingIds.has(modalMovie.id);
	const isRemoving = savedMovie ? state.removingIds.has(savedMovie.id) : false;

	if (!state.logged) {
		elements.movieModalFavoriteBtn.disabled = true;
		elements.movieModalFavoriteBtn.classList.remove("remove");
		elements.movieModalFavoriteBtn.textContent = "Inicia sesion para favoritos";
		elements.movieModalFavoriteBtn.title = "Debes iniciar sesion para gestionar favoritos";
		return;
	}

	elements.movieModalFavoriteBtn.title = "";
	elements.movieModalFavoriteBtn.disabled = isSaving || isRemoving;

	if (isSaving) {
		elements.movieModalFavoriteBtn.classList.remove("remove");
		elements.movieModalFavoriteBtn.textContent = "Guardando...";
		return;
	}

	if (isRemoving) {
		elements.movieModalFavoriteBtn.classList.add("remove");
		elements.movieModalFavoriteBtn.textContent = "Eliminando...";
		return;
	}

	elements.movieModalFavoriteBtn.classList.toggle("remove", isSaved);
	elements.movieModalFavoriteBtn.textContent = isSaved ? "Quitar de favoritos" : "Agregar a favoritos";
}

async function handleModalFavoriteAction() {
	if (!state.modalMovie || !state.modalMovie.id) {
		return;
	}

	if (!state.logged) {
		showToast("Inicia sesion para gestionar favoritos.", "info");
		return;
	}

	const savedMovie = getSavedMovieByExternalId(state.modalMovie.id);

	if (savedMovie) {
		await removeMovie(savedMovie.id);
		return;
	}

	await saveMovie(state.modalMovie);
}

function getModalFocusableElements() {
	return Array.from(
		elements.movieModalContent.querySelectorAll(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		)
	).filter((element) => {
		if (element.hasAttribute("disabled")) {
			return false;
		}

		return !element.hasAttribute("hidden");
	});
}

function trapModalFocus(event) {
	const focusable = getModalFocusableElements();

	if (!focusable.length) {
		return;
	}

	const firstElement = focusable[0];
	const lastElement = focusable[focusable.length - 1];

	if (!focusable.includes(document.activeElement)) {
		event.preventDefault();
		firstElement.focus();
		return;
	}

	if (event.shiftKey && document.activeElement === firstElement) {
		event.preventDefault();
		lastElement.focus();
		return;
	}

	if (!event.shiftKey && document.activeElement === lastElement) {
		event.preventDefault();
		firstElement.focus();
	}
}

function formatCategory(category) {
	if (Array.isArray(category)) {
		if (!category.length) {
			return "Sin categoria";
		}

		return `Generos: ${category.join(", ")}`;
	}

	if (typeof category === "string" && category.trim()) {
		return `Categoria: ${category}`;
	}

	return "Sin categoria";
}

function showToast(message, type = "info") {
	const toast = document.createElement("div");
	toast.className = `toast ${type}`;
	toast.textContent = message;
	elements.toastRegion.appendChild(toast);

	window.setTimeout(() => {
		toast.remove();
	}, 2800);
}

async function safeJson(response) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

// ===================== SETTINGS VIEW =====================
function initSettingsView() {
	// ── Populate default language group ──
	const defaultLangGroup = document.getElementById("defaultLangGroup");
	if (defaultLangGroup) {
		const savedLang = getSelectedTorrentLang();
		for (const [code, info] of Object.entries(TORRENT_LANG_OPTIONS)) {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "selector-option" + (code === savedLang ? " is-active" : "");
			btn.dataset.value = code;
			btn.setAttribute("aria-pressed", String(code === savedLang));
			btn.textContent = code === "all" ? "🌐 Todos" : info.label;
			btn.addEventListener("click", () => {
				setSelectedTorrentLang(code);
				defaultLangGroup.querySelectorAll(".selector-option").forEach(b => {
					b.classList.toggle("is-active", b.dataset.value === code);
					b.setAttribute("aria-pressed", String(b.dataset.value === code));
				});
			});
			defaultLangGroup.appendChild(btn);
		}
	}

	// ── Theme group ──
	const themeGroup = document.getElementById("themeGroup");
	if (themeGroup) {
		themeGroup.querySelectorAll(".selector-option").forEach(btn => {
			btn.classList.toggle("is-active", btn.dataset.value === state.theme);
			btn.setAttribute("aria-pressed", String(btn.dataset.value === state.theme));
			btn.addEventListener("click", () => {
				setTheme(btn.dataset.value);
				themeGroup.querySelectorAll(".selector-option").forEach(b => {
					b.classList.toggle("is-active", b.dataset.value === btn.dataset.value);
					b.setAttribute("aria-pressed", String(b.dataset.value === btn.dataset.value));
				});
			});
		});
	}

	// ── Vision mode group ──
	const visionGroup = document.getElementById("visionModeGroup");
	if (visionGroup) {
		const currentVision = state.colorblind ? "colorblind" : (state.highContrast ? "high-contrast" : "default");
		visionGroup.querySelectorAll(".selector-option").forEach(btn => {
			btn.classList.toggle("is-active", btn.dataset.value === currentVision);
			btn.setAttribute("aria-pressed", String(btn.dataset.value === currentVision));
			btn.addEventListener("click", () => {
				const val = btn.dataset.value;
				state.colorblind = val === "colorblind";
				state.highContrast = val === "high-contrast";
				persistValue(STORAGE_KEYS.colorblind, state.colorblind ? "1" : "0");
				persistValue(STORAGE_KEYS.highContrast, state.highContrast ? "1" : "0");
				applyUserPreferences();
				visionGroup.querySelectorAll(".selector-option").forEach(b => {
					b.classList.toggle("is-active", b.dataset.value === val);
					b.setAttribute("aria-pressed", String(b.dataset.value === val));
				});
				// Keep sidebar colorblind button in sync
				elements.colorblindModeBtn.classList.toggle("is-active", state.colorblind);
				elements.colorblindModeBtn.setAttribute("aria-pressed", String(state.colorblind));
				elements.colorblindModeLabel.textContent = state.colorblind ? "Vista daltonismo activa" : "Vista daltonismo";
			});
		});
	}

	// ── Font family group ──
	const fontFamilyGroup = document.getElementById("fontFamilyGroup");
	if (fontFamilyGroup) {
		fontFamilyGroup.querySelectorAll(".selector-option").forEach(btn => {
			btn.classList.toggle("is-active", btn.dataset.value === state.fontFamily);
			btn.setAttribute("aria-pressed", String(btn.dataset.value === state.fontFamily));
			btn.addEventListener("click", () => {
				const val = btn.dataset.value;
				state.fontFamily = val;
				persistValue(STORAGE_KEYS.fontFamily, val);
				applyUserPreferences();
				fontFamilyGroup.querySelectorAll(".selector-option").forEach(b => {
					b.classList.toggle("is-active", b.dataset.value === val);
					b.setAttribute("aria-pressed", String(b.dataset.value === val));
				});
			});
		});
	}

	// ── Default quality group ──
	const defaultQualGroup = document.getElementById("defaultQualGroup");
	if (defaultQualGroup) {
		const savedQual = localStorage.getItem("movieplus:torrentQuality") || "all";
		defaultQualGroup.querySelectorAll(".selector-option").forEach(btn => {
			btn.classList.toggle("is-active", btn.dataset.value === savedQual);
			btn.setAttribute("aria-pressed", String(btn.dataset.value === savedQual));
			btn.addEventListener("click", () => {
				const val = btn.dataset.value;
				localStorage.setItem("movieplus:torrentQuality", val);
				defaultQualGroup.querySelectorAll(".selector-option").forEach(b => {
					b.classList.toggle("is-active", b.dataset.value === val);
					b.setAttribute("aria-pressed", String(b.dataset.value === val));
				});
			});
		});
	}

	// ── Font scale controls ──
	const settingsFontDecBtn = document.getElementById("settingsFontDecBtn");
	const settingsFontIncBtn = document.getElementById("settingsFontIncBtn");
	const settingsFontVal = document.getElementById("settingsFontVal");
	const settingsFontBar = document.getElementById("settingsFontBar");

	function updateSettingsFontBar() {
		if (!settingsFontVal || !settingsFontBar) return;
		settingsFontVal.textContent = `${Math.round(state.fontScale * 100)}%`;
		const pct = ((state.fontScale - FONT_SCALE_MIN) / (FONT_SCALE_MAX - FONT_SCALE_MIN)) * 100;
		settingsFontBar.style.width = `${Math.round(pct)}%`;
		if (settingsFontDecBtn) settingsFontDecBtn.disabled = state.fontScale <= FONT_SCALE_MIN + 0.001;
		if (settingsFontIncBtn) settingsFontIncBtn.disabled = state.fontScale >= FONT_SCALE_MAX - 0.001;
	}

	if (settingsFontDecBtn) settingsFontDecBtn.addEventListener("click", () => { adjustFontScale(-FONT_SCALE_STEP); updateSettingsFontBar(); });
	if (settingsFontIncBtn) settingsFontIncBtn.addEventListener("click", () => { adjustFontScale(FONT_SCALE_STEP); updateSettingsFontBar(); });
	updateSettingsFontBar();

	// ── Generic toggle binder ──
	function bindToggle(id, stateKey, storageKey) {
		const btn = document.getElementById(id);
		if (!btn) return;
		btn.setAttribute("aria-checked", String(state[stateKey]));
		btn.addEventListener("click", () => {
			state[stateKey] = !state[stateKey];
			persistValue(storageKey, state[stateKey] ? "1" : "0");
			btn.setAttribute("aria-checked", String(state[stateKey]));
			applyUserPreferences();
		});
	}

	bindToggle("reduceTransBtn", "reduceTrans", STORAGE_KEYS.reduceTrans);
	bindToggle("reduceMotionBtn", "reduceMotion", STORAGE_KEYS.reduceMotion);
	bindToggle("largeTargetsBtn", "largeTargets", STORAGE_KEYS.largeTargets);
	bindToggle("largeCursorBtn", "largeCursor", STORAGE_KEYS.largeCursor);

	// ── Subtitles default toggle ──
	const defaultSubtitlesBtn = document.getElementById("defaultSubtitlesBtn");
	if (defaultSubtitlesBtn) {
		const subtitlesOn = localStorage.getItem("movieplus:subtitles") !== "off";
		defaultSubtitlesBtn.setAttribute("aria-checked", String(subtitlesOn));
		defaultSubtitlesBtn.addEventListener("click", () => {
			const current = defaultSubtitlesBtn.getAttribute("aria-checked") === "true";
			const newVal = !current;
			defaultSubtitlesBtn.setAttribute("aria-checked", String(newVal));
			localStorage.setItem("movieplus:subtitles", newVal ? "on" : "off");
		});
	}

	// ── API URL field ──
	const apiUrlInput = document.getElementById("apiUrlInput");
	const apiUrlSaveBtn = document.getElementById("apiUrlSaveBtn");
	const apiUrlResetBtn = document.getElementById("apiUrlResetBtn");
	const apiUrlStatus = document.getElementById("apiUrlStatus");

	if (apiUrlInput) {
		apiUrlInput.value = localStorage.getItem(STORAGE_KEYS.apiUrl) || "";
	}

	if (apiUrlSaveBtn && apiUrlInput && apiUrlStatus) {
		apiUrlSaveBtn.addEventListener("click", () => {
			const val = apiUrlInput.value.trim();
			if (val && !val.match(/^https?:\/\//)) {
				apiUrlStatus.textContent = "⚠ La URL debe comenzar con http:// o https://";
				apiUrlStatus.style.color = "var(--danger)";
				return;
			}
			localStorage.setItem(STORAGE_KEYS.apiUrl, val);
			apiUrlStatus.textContent = val
				? "✓ URL guardada. Recarga la página para aplicar el cambio."
				: "✓ URL eliminada. Se usará el servidor local al recargar.";
			apiUrlStatus.style.color = "var(--success)";
		});
	}

	if (apiUrlResetBtn && apiUrlInput && apiUrlStatus) {
		apiUrlResetBtn.addEventListener("click", () => {
			localStorage.removeItem(STORAGE_KEYS.apiUrl);
			if (apiUrlInput) apiUrlInput.value = "";
			apiUrlStatus.textContent = "✓ Restablecido al servidor local. Recarga la página.";
			apiUrlStatus.style.color = "var(--success)";
		});
	}

	// ── Reset all settings ──
	const settingsResetBtn = document.getElementById("settingsResetBtn");
	if (settingsResetBtn) {
		settingsResetBtn.addEventListener("click", () => {
			if (!confirm("¿Restablecer todas las configuraciones de accesibilidad y preferencias?")) return;
			[
				STORAGE_KEYS.theme, STORAGE_KEYS.fontScale, STORAGE_KEYS.colorblind,
				STORAGE_KEYS.highContrast, STORAGE_KEYS.reduceMotion, STORAGE_KEYS.largeTargets,
				STORAGE_KEYS.largeCursor, STORAGE_KEYS.reduceTrans, STORAGE_KEYS.fontFamily
			].forEach(k => localStorage.removeItem(k));
			state.theme = "dark";
			state.fontScale = 1;
			state.colorblind = false;
			state.highContrast = false;
			state.reduceMotion = false;
			state.largeTargets = false;
			state.largeCursor = false;
			state.reduceTrans = false;
			state.fontFamily = "inter";
			applyUserPreferences();
			showToast("Configuración restablecida.", "info");
			location.reload();
		});
	}
}

init();