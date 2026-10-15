# CoCreate Speech Synthesis

Declarative text-to-speech for CoCreate using the browser
[`SpeechSynthesis`](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis)
API. Elements added after page load are initialized through CoCreate Observer.

## Install

```shell
npm install @cocreate/speech-synthesis
```

## Usage

Speak the element's own text:

```html
<button speech-synthesis>Read this text</button>
```

Speak another element using CoCreate query syntax:

```html
<p id="article-summary">This text will be spoken.</p>
<button
	speech-synthesis
	speech-synthesis-query="$document #article-summary">
	Read summary
</button>
```

Provide literal text and voice options:

```html
<button
	speech-synthesis="Welcome to CoCreate"
	speech-synthesis-lang="en-US"
	speech-synthesis-rate="1"
	speech-synthesis-pitch="1"
	speech-synthesis-volume="1">
	Speak
</button>
```

The optional `speech-synthesis-voice` attribute accepts a browser voice name or
voice URI. Available voices differ by browser and operating system.

Clicking the active trigger cancels its speech. While active, the trigger has
`speech-synthesis-active="true"`.

## JavaScript API

The bundle exposes `CoCreate.speechSynthesis`:

```js
CoCreate.speechSynthesis.speak("Hello", { lang: "en-US", rate: 1 });
CoCreate.speechSynthesis.pause();
CoCreate.speechSynthesis.resume();
CoCreate.speechSynthesis.cancel();
CoCreate.speechSynthesis.getVoices();
```

Trigger elements emit bubbling `speechSynthesisStart`,
`speechSynthesisPause`, `speechSynthesisResume`, `speechSynthesisBoundary`,
`speechSynthesisEnd`, `speechSynthesisCancel`, and `speechSynthesisError`
events.

## License

[MIT](./LICENSE)
