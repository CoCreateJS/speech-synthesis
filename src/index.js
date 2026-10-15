/*!
 * https://cocreate.app
 * https://github.com/CoCreate-app/CoCreate-speech-synthesis
 * Released under the MIT license
 */
import observer from "@cocreate/observer";
import { queryElements } from "@cocreate/utils";
import "./index.css";

const initialized = new WeakSet();
let activeElement;
let activeUtterance;

const synthesis = () => globalThis.speechSynthesis;

function dispatch(element, name, detail = {}) {
	element?.dispatchEvent(
		new CustomEvent(name, {
			bubbles: true,
			detail
		})
	);
}

function setActive(element, active) {
	if (!element) return;
	if (active) element.setAttribute("speech-synthesis-active", "true");
	else element.removeAttribute("speech-synthesis-active");
}

function numberAttribute(element, name, fallback, min, max) {
	const attribute = element?.getAttribute(name);
	if (attribute === null || attribute === "") return fallback;
	const value = Number(attribute);
	return Number.isFinite(value)
		? Math.min(max, Math.max(min, value))
		: fallback;
}

function getVoices() {
	return synthesis()?.getVoices() || [];
}

function findVoice({ voice, lang } = {}) {
	const voices = getVoices();
	if (voice) {
		const normalized = voice.toLowerCase();
		const match = voices.find(
			(item) =>
				item.name.toLowerCase() === normalized ||
				item.voiceURI?.toLowerCase() === normalized
		);
		if (match) return match;
	}
	if (lang) {
		const normalized = lang.toLowerCase();
		return voices.find((item) =>
			item.lang.toLowerCase().startsWith(normalized)
		);
	}
}

async function getText(element) {
	const configured = element.getAttribute("speech-synthesis");
	if (configured && configured !== "true" && configured !== "false")
		return configured;

	let target = element;
	if (element.hasAttribute("speech-synthesis-query")) {
		target = queryElements({
			element,
			prefix: "speech-synthesis"
		})[0];
	}
	if (!target) return "";

	let value;
	if (typeof target.getValue === "function") value = await target.getValue();
	if (value === undefined || value === null || value === "")
		value = "value" in target ? target.value : target.textContent;
	return typeof value === "object" ? JSON.stringify(value) : String(value || "");
}

function getOptions(element) {
	return {
		voice: element.getAttribute("speech-synthesis-voice") || undefined,
		lang: element.getAttribute("speech-synthesis-lang") || undefined,
		rate: numberAttribute(element, "speech-synthesis-rate", 1, 0.1, 10),
		pitch: numberAttribute(element, "speech-synthesis-pitch", 1, 0, 2),
		volume: numberAttribute(element, "speech-synthesis-volume", 1, 0, 1)
	};
}

function finish(element, utterance) {
	if (activeUtterance !== utterance) return;
	setActive(element, false);
	activeElement = undefined;
	activeUtterance = undefined;
}

function cancel() {
	const element = activeElement;
	setActive(element, false);
	activeElement = undefined;
	activeUtterance = undefined;
	synthesis()?.cancel();
	if (element) dispatch(element, "speechSynthesisCancel");
}

function speak(text, options = {}, element) {
	const engine = synthesis();
	if (!engine || typeof SpeechSynthesisUtterance === "undefined") {
		const error = new Error("SpeechSynthesis API is not supported.");
		dispatch(element, "speechSynthesisError", { error });
		return;
	}

	const content = typeof text === "string" ? text.trim() : String(text || "");
	if (!content) return;

	cancel();
	const utterance = new SpeechSynthesisUtterance(content);
	utterance.lang = options.lang || "";
	utterance.rate = options.rate ?? 1;
	utterance.pitch = options.pitch ?? 1;
	utterance.volume = options.volume ?? 1;
	utterance.voice = findVoice(options) || null;

	activeElement = element;
	activeUtterance = utterance;
	setActive(element, true);

	for (const type of ["start", "pause", "resume", "boundary"]) {
		utterance.addEventListener(type, (event) =>
			dispatch(
				element,
				`speechSynthesis${type[0].toUpperCase()}${type.slice(1)}`,
				{ event, utterance }
			)
		);
	}
	utterance.addEventListener("error", (event) => {
		finish(element, utterance);
		dispatch(element, "speechSynthesisError", { event, utterance });
	});
	utterance.addEventListener("end", (event) => {
		finish(element, utterance);
		dispatch(element, "speechSynthesisEnd", { event, utterance });
	});

	engine.speak(utterance);
	return utterance;
}

function pause() {
	synthesis()?.pause();
}

function resume() {
	synthesis()?.resume();
}

async function toggle(element) {
	if (element === activeElement) return cancel();
	return speak(await getText(element), getOptions(element), element);
}

function initElements(elements) {
	for (const element of elements) {
		if (!element || initialized.has(element)) continue;
		initialized.add(element);
		element.addEventListener("click", () => toggle(element));
	}
}

function init() {
	initElements(document.querySelectorAll("[speech-synthesis]"));
}

let observerInitialized = false;
function initObserver() {
	if (observerInitialized) return;
	observerInitialized = true;

	observer.init({
		name: "CoCreateSpeechSynthesisAddedNodes",
		types: ["addedNodes"],
		selector: "[speech-synthesis]",
		callback: (mutation) => initElements([mutation.target])
	});

	observer.init({
		name: "CoCreateSpeechSynthesisAttributes",
		types: ["attributes"],
		attributeFilter: ["speech-synthesis"],
		selector: "[speech-synthesis]",
		callback: (mutation) => initElements([mutation.target])
	});
}

if (globalThis.CoCreate?.observer) initObserver();
else document.addEventListener("observerLoaded", initObserver, { once: true });

init();

export default { init, speak, pause, resume, cancel, getVoices };
