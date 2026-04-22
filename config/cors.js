const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";

const FRONTEND_URLS = String(process.env.FRONTEND_URL || "")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);

function isAllowedOrigin(origin) {
	if (!origin) {
		return true;
	}

	if (!FRONTEND_URLS.length) {
		return false;
	}

	return FRONTEND_URLS.includes(origin);
}

function hasCorsOriginsConfigured() {
	return FRONTEND_URLS.length > 0;
}

function ensureCorsConfiguredForProduction() {
	if (IS_PRODUCTION && FRONTEND_URLS.length === 0) {
		throw new Error("FRONTEND_URL es obligatorio en produccion para CORS seguro.");
	}
}

function getCorsHeadersForRequest(req) {
	const origin = req?.headers?.origin;
	if (!origin || !isAllowedOrigin(origin)) {
		return {};
	}

	return {
		"Access-Control-Allow-Origin": origin,
		Vary: "Origin"
	};
}

module.exports = {
	FRONTEND_URLS,
	isAllowedOrigin,
	hasCorsOriginsConfigured,
	ensureCorsConfiguredForProduction,
	getCorsHeadersForRequest
};
