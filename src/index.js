/*!
 * CoCreate speech synthesis — declarative browser text-to-speech.
 * https://CoCreateJS.com
 * Released under the MIT license
 */
import observer from "@cocreate/observer";
import actions from "@cocreate/actions";
import { queryElements } from "@cocreate/utils";
import "./index.css";

const selector = "[speech-synthesis-query], [speech-synthesis]";
const initialized = new WeakSet();
let session;
let startRequest = 0;
let pendingElement;
let pendingStart;

function dispatch(element, name, detail = {}) {
	if (!element) return;
	element.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
	const alias = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
	element.dispatchEvent(new CustomEvent(alias, { bubbles: true, detail }));
}

function setActive(element, active) {
	if (!element) return;
	if (active) element.setAttribute("speech-synthesis-active", "true");
	else element.removeAttribute("speech-synthesis-active");
}

function setState(element, state) {
	if (element?.matches(selector) && element.getAttribute("speech-synthesis-state") !== state)
		element.setAttribute("speech-synthesis-state", state);
}

function numberAttribute(element, name, fallback, min, max) {
	const attribute = element?.getAttribute(name);
	if (attribute === null || attribute === "") return fallback;
	const value = Number(attribute);
	return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function getVoices() {
	return window.speechSynthesis?.getVoices() || [];
}

function findVoice({ voice, lang } = {}) {
	const voices = getVoices();
	if (voice) {
		const normalized = voice.toLowerCase();
		const match = voices.find((item) =>
			item.name.toLowerCase() === normalized || item.voiceURI?.toLowerCase() === normalized
		);
		if (match) return match;
	}
	if (lang) {
		const normalized = lang.toLowerCase();
		return voices.find((item) => item.lang.toLowerCase().startsWith(normalized));
	}
}

function getOptions(element) {
	return {
		voice: element?.getAttribute("speech-synthesis-voice") || undefined,
		lang: element?.getAttribute("speech-synthesis-lang") || undefined,
		rate: numberAttribute(element, "speech-synthesis-rate", 1, 0.1, 10),
		pitch: numberAttribute(element, "speech-synthesis-pitch", 1, 0, 2),
		volume: numberAttribute(element, "speech-synthesis-volume", 1, 0, 1)
	};
}

function getTarget(element, explicitTarget) {
	if (explicitTarget) return explicitTarget;
	if (element?.hasAttribute("speech-synthesis-query"))
		return queryElements({ element, prefix: "speech-synthesis" })[0];
}

async function getText(element, explicitText, explicitTarget) {
	if (explicitText !== undefined && explicitText !== null) return String(explicitText);
	const configured = element.getAttribute("speech-synthesis");
	if (configured && configured !== "true" && configured !== "false") return configured;
	const target = getTarget(element, explicitTarget);
	if (element.hasAttribute("speech-synthesis-query") && !target)
		throw new Error("Speech synthesis query did not match an element.");
	const source = target || element;
	let value;
	if (typeof source.getValue === "function") value = await source.getValue();
	if (value === undefined || value === null || value === "")
		value = "value" in source ? source.value : source.textContent;
	return typeof value === "object" ? JSON.stringify(value) : String(value || "");
}

function finish(current, state) {
	if (session !== current) return;
	current.ended = true;
	setActive(current.element, false);
	setState(current.element, state);
	for (const waiter of current.waiters.splice(0))
		waiter.reject(current.error || new Error(`Speech synthesis ended before ${waiter.type}.`));
	session = undefined;
}

function cancel(element) {
	const current = session;
	if ((!current || (element && current.element !== element)) && pendingElement &&
		(!element || pendingElement === element)) {
		const target = pendingElement;
		startRequest++;
		pendingElement = undefined;
		pendingStart = undefined;
		setActive(target, false);
		setState(target, "cancel");
		dispatch(target, "speechSynthesisCancel", {});
		return;
	}
	if (!current || (element && current.element !== element) || current.ended || current.cancelled) return;
	current.cancelled = true;
	window.speechSynthesis?.cancel();
	setActive(current.element, false);
	setState(current.element, "cancel");
	dispatch(current.element, "speechSynthesisCancel", { utterance: current.utterance });
	for (const waiter of current.waiters.splice(0))
		waiter.reject(new Error("Speech synthesis was cancelled."));
	if (session === current) session = undefined;
}

function waitFor(current, type) {
	if ((type === "start" && current.started) || (type === "pause" && current.paused) ||
		(type === "resume" && current.resumed)) return Promise.resolve({ type });
	if (current.ended || current.cancelled || current.error)
		return Promise.reject(current.error || new Error("Speech synthesis ended before the requested event."));
	return new Promise((resolve, reject) => current.waiters.push({ type, resolve, reject }));
}

function speak(text, options = {}, element, request) {
	if (request === undefined) {
		startRequest++;
		pendingElement = undefined;
		pendingStart = undefined;
	}
	const engine = window.speechSynthesis;
	if (!engine || typeof window.SpeechSynthesisUtterance !== "function") {
		const error = new Error("SpeechSynthesis API is not supported.");
		setActive(element, false);
		setState(element, "error");
		dispatch(element, "speechSynthesisError", { error });
		return;
	}
	const content = typeof text === "string" ? text.trim() : String(text || "");
	if (!content) {
		const error = new Error("Speech synthesis requires text to speak.");
		setActive(element, false);
		setState(element, "error");
		dispatch(element, "speechSynthesisError", { error });
		return;
	}

	if (session) cancel(session.element);
	else engine.cancel();
	const utterance = new window.SpeechSynthesisUtterance(content);
	utterance.lang = options.lang || "";
	utterance.rate = options.rate ?? 1;
	utterance.pitch = options.pitch ?? 1;
	utterance.volume = options.volume ?? 1;
	utterance.voice = findVoice(options) || null;
	const current = {
		element, utterance, ended: false, cancelled: false,
		started: false, paused: false, resumed: false, waiters: []
	};
	session = current;
	setActive(element, false);
	setState(element, "start");

	for (const type of ["start", "pause", "resume", "boundary", "mark"])
		utterance.addEventListener(type, (event) => {
			if (session !== current || current.cancelled) return;
			if (type === "start") current.started = true;
			if (type === "pause") current.paused = true;
			if (type === "resume") {
				current.paused = false;
				current.resumed = true;
			}
			if (type === "start" || type === "resume") setActive(element, true);
			if (type === "pause") {
				current.resumed = false;
			}
			if (["start", "pause", "resume"].includes(type)) setState(element, type);
			for (const waiter of current.waiters.filter((item) => item.type === type)) {
				waiter.resolve({ type, event });
				current.waiters.splice(current.waiters.indexOf(waiter), 1);
			}
			dispatch(element, `speechSynthesis${type[0].toUpperCase()}${type.slice(1)}`, {
				event, utterance, text: content
			});
		});
	utterance.addEventListener("end", (event) => {
		if (session !== current || current.cancelled) return;
		finish(current, "end");
		dispatch(element, "speechSynthesisEnd", { event, utterance, text: content });
	});
	utterance.addEventListener("error", (event) => {
		if (session !== current || current.cancelled) return;
		const error = new Error(event.message || event.error || "Speech synthesis failed.");
		current.error = error;
		finish(current, "error");
		dispatch(element, "speechSynthesisError", { event, error, utterance, text: content });
	});

	try {
		engine.speak(utterance);
		return utterance;
	} catch (error) {
		finish(current, "error");
		dispatch(element, "speechSynthesisError", { error, utterance, text: content });
	}
}

function start(element, options = {}) {
	if (!element) return Promise.resolve();
	if (session?.element === element && !session.ended && !session.cancelled)
		return Promise.resolve(session.utterance);
	if (pendingElement === element && pendingStart) return pendingStart;
	const request = ++startRequest;
	pendingElement = element;
	pendingStart = (async () => {
		try {
			const text = await getText(element, options.text, options.target);
			if (request !== startRequest) return;
			if (options.signal?.aborted) {
				pendingElement = undefined;
				pendingStart = undefined;
				return;
			}
			pendingElement = undefined;
			pendingStart = undefined;
			return speak(text, { ...getOptions(element), ...options }, element, request);
		} catch (error) {
			if (request !== startRequest) return;
			pendingElement = undefined;
			pendingStart = undefined;
			setActive(element, false);
			setState(element, "error");
			dispatch(element, "speechSynthesisError", { error });
		}
	})();
	return pendingStart;
}

function pause(element) {
	if (!session || (element && session.element !== element) || session.ended || session.cancelled) return;
	if (window.speechSynthesis?.paused) return session.utterance;
	window.speechSynthesis?.pause();
	return session.utterance;
}

function resume(element) {
	if (!session || (element && session.element !== element) || session.ended || session.cancelled) return;
	if (!window.speechSynthesis?.paused) return;
	window.speechSynthesis?.resume();
	return session.utterance;
}

async function toggle(element) {
	if (pendingElement === element) return cancel(element);
	if (session?.element === element && !session.ended && !session.cancelled) return cancel(element);
	return start(element);
}

function applyCommand(element) {
	const command = element.getAttribute("speech-synthesis-state");
	if (command === "start") {
		if (session?.element === element && !session.ended && !session.cancelled) return;
		void start(element);
	} else if (command === "pause") pause(element);
	else if (command === "resume") resume(element);
	else if (command === "cancel") cancel(element);
}

function init(elements = document.querySelectorAll(selector)) {
	if (elements.nodeType) elements = [elements];
	for (const element of elements) {
		if (!element.matches(selector)) continue;
		if (!initialized.has(element)) {
			initialized.add(element);
			setActive(element, false);
			element.addEventListener("click", () => {
				if (element.matches(selector) && !element.hasAttribute("actions") &&
					!element.disabled && element.getAttribute("aria-disabled") !== "true")
					void toggle(element);
			});
		}
		applyCommand(element);
	}
}

async function runAction(action) {
	const methods = {
		speechSynthesisStart: "start",
		speechSynthesisPause: "pause",
		speechSynthesisResume: "resume",
		speechSynthesisCancel: "cancel"
	};
	let method = action.method || methods[action.name] || "toggle";
	if (method === "toggle")
		method = session?.element === action.element && !session.ended && !session.cancelled ? "cancel" : "start";
	if (!["start", "pause", "resume", "cancel"].includes(method)) {
		action.abort(new Error(`Unknown speech synthesis method: ${method}`));
		return;
	}
	try {
		if (method === "start") {
			const utterance = await start(action.element, action.options || {});
			const current = session;
			if (!utterance || !current || current.element !== action.element)
				throw new Error("Speech synthesis could not start.");
			const event = await waitFor(current, "start");
			action.end({ event, utterance });
		} else if (method === "pause") {
			const current = session;
			const utterance = pause(action.element);
			if (!utterance || !current) return action.end();
			const event = await waitFor(current, "pause");
			action.end({ event, utterance });
		} else if (method === "resume") {
			const current = session;
			const utterance = resume(action.element);
			if (!utterance || !current) return action.end();
			const event = await waitFor(current, "resume");
			action.end({ event, utterance });
		} else {
			const utterance = session?.element === action.element ? session.utterance : undefined;
			cancel(action.element);
			action.end({ utterance });
		}
	} catch (error) {
		action.abort(error);
	}
}

actions.init({
	name: ["speechSynthesis", "speechSynthesisStart", "speechSynthesisPause", "speechSynthesisResume", "speechSynthesisCancel"],
	endEvent: "speechSynthesisActionEnd",
	callback: runAction
});

observer.init({
	name: "CoCreateSpeechSynthesisAddedNodes",
	types: ["addedNodes"],
	selector,
	callback: (mutation) => init(mutation.target)
});

observer.init({
	name: "CoCreateSpeechSynthesisAttributes",
	types: ["attributes"],
	attributeFilter: ["speech-synthesis", "speech-synthesis-query", "speech-synthesis-state"],
	callback: (mutation) => {
		if (mutation.target.matches(selector)) init(mutation.target);
		else if (session?.element === mutation.target || pendingElement === mutation.target)
			cancel(mutation.target);
	}
});

observer.init({
	name: "CoCreateSpeechSynthesisRemovedNodes",
	types: ["removedNodes"],
	selector,
	callback: (mutation) => {
		if (!mutation.target.isConnected &&
			(session?.element === mutation.target || pendingElement === mutation.target))
			cancel(mutation.target);
	}
});

init();

export default { init, start, speak, pause, resume, cancel, toggle, getVoices };
