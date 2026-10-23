# CoCreate Speech Synthesis

Declarative text-to-speech built on the browser Speech Synthesis API. Existing
elements and added nodes are initialized by CoCreate Observer. The browser owns
voice availability and speech playback.

## Install

```sh
npm install @cocreate/speech-synthesis
```

## Declarative usage

Speak text from another element:

```html
<p id="message">This text will be spoken.</p>
<button speech-synthesis-query="$document #message">Speak / cancel</button>
```

The `speech-synthesis-query` selector can be used by itself to initialize the
button. Clicking the trigger starts speech; clicking it again cancels the active
utterance. Speech is global in the browser, so starting another trigger cancels
the current utterance first.

Legacy literal text remains supported:

```html
<button speech-synthesis="Welcome to CoCreate" speech-synthesis-lang="en-US">
	Speak
</button>
```

Options are read from the trigger when speech starts and can be changed through
CoCreate Events:

| Attribute | Purpose |
| --- | --- |
| `speech-synthesis` | Enables the trigger; a nonempty value can provide literal text for compatibility. |
| `speech-synthesis-query` | CoCreate query selecting text or a value-bearing element to speak. |
| `speech-synthesis-state` | Command and lifecycle state: `start`, `pause`, `resume`, `cancel`, `end`, or `error`. |
| `speech-synthesis-active` | Output flag, set while an utterance is active, including while paused; removed on completion, cancel, or error. |
| `speech-synthesis-voice` | Browser voice name or voice URI. |
| `speech-synthesis-lang` | BCP 47 language tag, such as `en-US`. |
| `speech-synthesis-rate` | Rate clamped to the browser range 0.1–10; default `1`. |
| `speech-synthesis-pitch` | Pitch clamped to 0–2; default `1`. |
| `speech-synthesis-volume` | Volume clamped to 0–1; default `1`. |

Use `speech-synthesis-state` on the trigger for declarative commands. A start
command can be set in markup or by Observer after load:

```html
<button speech-synthesis-query="$document #message" speech-synthesis-state="start">
	Speak
</button>
```

Setting the state to `pause`, `resume`, or `cancel` controls the current
utterance for that trigger. Native `start`, `pause`, and `resume` events update
the state; completion sets `end`. A failed utterance sets `error`. The separate
state attribute preserves compatibility with literal text in
`speech-synthesis`.

Elements with an `actions` attribute defer their click to Actions. Available
actions are `speechSynthesis` (toggle), `speechSynthesisStart`,
`speechSynthesisPause`, `speechSynthesisResume`, and `speechSynthesisCancel`.
The Actions framework also supports dotted methods such as
`speechSynthesis.start`. Start, pause, and resume actions advance after the
browser confirms the corresponding event. Cancel completes when cancellation
is requested.

## JavaScript API

The bundle exposes `CoCreate.speechSynthesis`:

```js
const trigger = document.querySelector("[speech-synthesis-query]");
await CoCreate.speechSynthesis.start(trigger);
CoCreate.speechSynthesis.pause(trigger);
CoCreate.speechSynthesis.resume(trigger);
CoCreate.speechSynthesis.cancel(trigger);

CoCreate.speechSynthesis.speak("Hello", { lang: "en-US", rate: 1 });
CoCreate.speechSynthesis.getVoices();
```

`init(elementOrCollection)` is also available. `start(element, options)` reads
text and options from the element. `speak(text, options, element)` speaks a
provided string directly.

## Events

Trigger elements emit bubbling camel-case and kebab-case event names:

- `speechSynthesisStart` / `speech-synthesis-start`
- `speechSynthesisPause` / `speech-synthesis-pause`
- `speechSynthesisResume` / `speech-synthesis-resume`
- `speechSynthesisBoundary` / `speech-synthesis-boundary`
- `speechSynthesisMark` / `speech-synthesis-mark`
- `speechSynthesisEnd` / `speech-synthesis-end`
- `speechSynthesisCancel` / `speech-synthesis-cancel`
- `speechSynthesisError` / `speech-synthesis-error`

Event details include the native event when available, the utterance, and the
text being spoken. Error details also include an `error` object.

## License

[MIT](./LICENSE)
