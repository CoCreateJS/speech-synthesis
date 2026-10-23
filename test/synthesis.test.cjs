const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8')
	.replace(/^import .*;\n/gm, '')
	.replace('export default { init, start, speak, pause, resume, cancel, toggle, getVoices };',
		'this.api = { init, start, speak, pause, resume, cancel, toggle, getVoices };');

class Element extends EventTarget {
	nodeType = 1;
	isConnected = true;
	attributes = new Map();
	textContent = '';
	hasAttribute(name) { return this.attributes.has(name); }
	getAttribute(name) { return this.attributes.get(name) ?? null; }
	setAttribute(name, value) { this.attributes.set(name, String(value)); }
	removeAttribute(name) { this.attributes.delete(name); }
	matches(selector) {
		return selector.split(',').some((part) => {
			const match = /^\[([\w-]+)\]$/.exec(part.trim());
			return match && this.hasAttribute(match[1]);
		});
	}
}

class Utterance extends EventTarget {
	constructor(text) { super(); this.text = text; }
}

function runtime({ supported = true, queryTarget } = {}) {
	const element = new Element();
	const target = queryTarget || new Element();
	const observers = [];
	const definitions = [];
	const utterances = [];
	const engine = {
		paused: false, cancelled: 0, voices: [{ name: 'Test Voice', voiceURI: 'test:voice', lang: 'en-US' }],
		getVoices() { return this.voices; },
		speak(utterance) { utterances.push(utterance); },
		cancel() { this.cancelled++; this.paused = false; },
		pause() { this.paused = true; },
		resume() { this.paused = false; }
	};
	const context = {
		window: supported ? { speechSynthesis: engine, SpeechSynthesisUtterance: Utterance } : {},
		document: { querySelectorAll: () => [element] },
		observer: { init: (definition) => observers.push(definition) },
		actions: { init: (definition) => definitions.push(definition) },
		queryElements: () => [target],
		CustomEvent, Event, JSON, String, Number, Math, Promise, Error
	};
	vm.runInNewContext(source, context);
	return { api: context.api, element, target, engine, utterances, observers, actions: definitions,
		act(name, mutationTarget = element) {
			observers.find((observer) => observer.attributeFilter?.includes(name))
				.callback({ target: mutationTarget, oldValue: null });
		},
		added(node = element) { observers.find((observer) => observer.types.includes('addedNodes')).callback({ target: node }); },
		removed(node = element) { observers.find((observer) => observer.types.includes('removedNodes')).callback({ target: node }); }
	};
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const fire = (utterance, type, values = {}) => {
	const event = new Event(type);
	Object.assign(event, values);
	utterance.dispatchEvent(event);
};

test('registers observers and actions on import; query-only controls bind once', async () => {
	const app = runtime();
	app.element.setAttribute('speech-synthesis-query', '#text');
	app.target.textContent = 'Initialization text';
	assert.equal(app.observers.length, 3);
	assert.deepEqual(Array.from(app.actions[0].name), [
		'speechSynthesis', 'speechSynthesisStart', 'speechSynthesisPause',
		'speechSynthesisResume', 'speechSynthesisCancel'
	]);
	app.api.init();
	app.added();
	app.element.dispatchEvent(new Event('click'));
	await flush();
	assert.equal(app.utterances.length, 1);
	app.api.cancel(app.element);
});

test('speaks query text with host options and emits camel and kebab lifecycle events', async () => {
	const app = runtime();
	app.element.setAttribute('speech-synthesis-query', '#text');
	app.act('speech-synthesis-query');
	app.element.setAttribute('speech-synthesis-rate', '20');
	app.element.setAttribute('speech-synthesis-pitch', '-1');
	app.target.textContent = 'Hello from the target';
	let started, startAliases = 0, ended;
	app.element.addEventListener('speechSynthesisStart', (event) => { started = event.detail; });
	app.element.addEventListener('speech-synthesis-start', () => startAliases++);
	app.element.addEventListener('speechSynthesisEnd', (event) => { ended = event.detail; });
	app.element.dispatchEvent(new Event('click'));
	await flush();
	const utterance = app.utterances[0];
	assert.equal(utterance.text, 'Hello from the target');
	assert.equal(utterance.rate, 10);
	assert.equal(utterance.pitch, 0);
	assert.equal(utterance.volume, 1);
	fire(utterance, 'start');
	assert.equal(started.utterance, utterance);
	assert.equal(startAliases, 1);
	assert.equal(app.element.getAttribute('speech-synthesis-active'), 'true');
	fire(utterance, 'end');
	assert.equal(ended.utterance, utterance);
	assert.equal(app.element.getAttribute('speech-synthesis-active'), null);
	assert.equal(app.element.getAttribute('speech-synthesis-state'), 'end');
});

test('keeps legacy literal speech text and resolves a selected voice', async () => {
	const app = runtime();
	app.element.setAttribute('speech-synthesis', 'Welcome to CoCreate');
	app.act('speech-synthesis');
	app.element.setAttribute('speech-synthesis-voice', 'test:voice');
	app.element.dispatchEvent(new Event('click'));
	await flush();
	assert.equal(app.utterances[0].text, 'Welcome to CoCreate');
	assert.equal(app.utterances[0].voice.name, 'Test Voice');
	assert.equal(app.element.getAttribute('speech-synthesis'), 'Welcome to CoCreate');
});

test('state commands start, pause, resume and cancel the targeted utterance', async () => {
	const app = runtime();
	app.element.setAttribute('speech-synthesis-query', '#text');
	app.target.textContent = 'Control text';
	app.element.setAttribute('speech-synthesis-state', 'start');
	app.act('speech-synthesis-state');
	await flush();
	const utterance = app.utterances[0];
	assert.ok(utterance);
	fire(utterance, 'start');
	app.engine.cancelled = 0;
	app.element.setAttribute('speech-synthesis-state', 'pause');
	app.act('speech-synthesis-state');
	assert.equal(app.engine.paused, true);
	fire(utterance, 'pause');
	assert.equal(app.element.getAttribute('speech-synthesis-state'), 'pause');
	app.element.setAttribute('speech-synthesis-state', 'resume');
	app.act('speech-synthesis-state');
	assert.equal(app.engine.paused, false);
	fire(utterance, 'resume');
	app.element.setAttribute('speech-synthesis-state', 'cancel');
	app.act('speech-synthesis-state');
	assert.equal(app.engine.cancelled, 1);
	assert.equal(app.element.getAttribute('speech-synthesis-active'), null);
	assert.equal(app.element.getAttribute('speech-synthesis-state'), 'cancel');
});

test('click toggles cancel the current element and a new element replaces the global utterance', async () => {
	const app = runtime();
	app.element.setAttribute('speech-synthesis', 'First');
	app.act('speech-synthesis');
	app.element.dispatchEvent(new Event('click'));
	await flush();
	const first = app.utterances[0];
	fire(first, 'start');
	app.engine.cancelled = 0;
	const secondElement = new Element();
	secondElement.setAttribute('speech-synthesis', 'Second');
	app.api.init(secondElement);
	secondElement.dispatchEvent(new Event('click'));
	await flush();
	assert.equal(app.utterances[1].text, 'Second');
	assert.equal(app.engine.cancelled, 1);
	assert.equal(app.element.getAttribute('speech-synthesis-state'), 'cancel');
	secondElement.dispatchEvent(new Event('click'));
	assert.equal(app.engine.cancelled, 2);
});

test('a cancel command prevents a pending asynchronous text read from speaking later', async () => {
	const app = runtime();
	app.element.setAttribute('speech-synthesis-query', '#text');
	app.act('speech-synthesis-query');
	let resolveText;
	app.target.getValue = () => new Promise((resolve) => { resolveText = resolve; });
	const pending = app.api.start(app.element);
	await flush();
	app.api.cancel(app.element);
	resolveText('Too late');
	await pending;
	assert.equal(app.utterances.length, 0);
	assert.equal(app.element.getAttribute('speech-synthesis-state'), 'cancel');
});

test('actions wait for native start, pause and resume events and explicitly complete cancel', async () => {
	const app = runtime();
	app.element.setAttribute('speech-synthesis-query', '#text');
	app.act('speech-synthesis-query');
	app.target.textContent = 'Action text';
	const action = { name: 'speechSynthesisStart', element: app.element, end(value) { this.result = value; }, abort(error) { this.error = error; } };
	const run = app.actions[0].callback;
	const pendingStart = run(action);
	await flush();
	assert.equal(action.result, undefined);
	const utterance = app.utterances[0];
	fire(utterance, 'start');
	await pendingStart;
	assert.equal(action.result.utterance, utterance);
	const pauseAction = { name: 'speechSynthesisPause', element: app.element, end(value) { this.result = value; }, abort(error) { this.error = error; } };
	const pendingPause = run(pauseAction);
	fire(utterance, 'pause');
	await pendingPause;
	assert.equal(pauseAction.result.utterance, utterance);
	const resumeAction = { name: 'speechSynthesisResume', element: app.element, end(value) { this.result = value; }, abort(error) { this.error = error; } };
	const pendingResume = run(resumeAction);
	fire(utterance, 'resume');
	await pendingResume;
	assert.equal(resumeAction.result.utterance, utterance);
	const cancelAction = { name: 'speechSynthesisCancel', element: app.element, end(value) { this.result = value; }, abort(error) { this.error = error; } };
	await run(cancelAction);
	assert.equal(cancelAction.result.utterance, utterance);
	assert.equal(cancelAction.error, undefined);
});

test('unsupported browser, empty text and utterance errors report clean terminal state', async () => {
	const unsupported = runtime({ supported: false });
	unsupported.element.setAttribute('speech-synthesis', 'text');
	unsupported.act('speech-synthesis');
	unsupported.element.textContent = 'Fallback text';
	let unsupportedError;
	unsupported.element.addEventListener('speechSynthesisError', (event) => { unsupportedError = event.detail.error; });
	unsupported.element.dispatchEvent(new Event('click'));
	await flush();
	assert.match(unsupportedError.message, /not supported/);

	const app = runtime();
	app.element.setAttribute('speech-synthesis-query', '#text');
	app.act('speech-synthesis-query');
	let error;
	app.element.addEventListener('speechSynthesisError', (event) => { error = event.detail.error; });
	app.element.dispatchEvent(new Event('click'));
	await flush();
	assert.match(error.message, /requires text/);
	assert.equal(app.element.getAttribute('speech-synthesis-state'), 'error');
	app.target.textContent = 'Fail this utterance';
	await app.api.start(app.element);
	fire(app.utterances[0], 'error', { error: 'synthesis-failed' });
	assert.match(error.message, /synthesis-failed/);
	assert.equal(app.element.getAttribute('speech-synthesis-active'), null);
	assert.equal(app.element.getAttribute('speech-synthesis-state'), 'error');
});

test('removing initialization attributes or removing an active element cancels its utterance', async () => {
	const app = runtime();
	app.element.setAttribute('speech-synthesis-query', '#text');
	app.act('speech-synthesis-query');
	app.target.textContent = 'Remove me';
	app.element.dispatchEvent(new Event('click'));
	await flush();
	app.engine.cancelled = 0;
	app.element.removeAttribute('speech-synthesis-query');
	app.act('speech-synthesis-query');
	assert.equal(app.engine.cancelled, 1);

	app.element.setAttribute('speech-synthesis', 'Remove me too');
	app.element.dispatchEvent(new Event('click'));
	await flush();
	app.engine.cancelled = 0;
	app.element.isConnected = false;
	app.removed();
	assert.equal(app.engine.cancelled, 1);
});
