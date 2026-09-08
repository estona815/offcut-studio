import { useRef, useState, useEffect, type FormEvent } from 'react';
import { Icon } from './Icons';

interface RecognitionResult { results: { [key: number]: { [key: number]: { transcript: string } } } }
interface Recognition { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; abort: () => void }
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

const examples = ['mark front cut', 'ochre scrap is 6 cm tall', 'make back 10 cm wide', 'replan pocket', "what's next"];
export function CommandBar({ onCommand, help }: { onCommand: (input: string) => void; help: string }) {
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const recognitionRef = useRef<Recognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speechWindow = window as SpeechWindow;
  const RecognitionClass = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  useEffect(() => () => recognitionRef.current?.abort(), []);
  function speak() {
    if (!RecognitionClass) { setVoiceMessage('Voice input is unavailable in this browser. Type your change below.'); inputRef.current?.focus(); return; }
    if (listening) { recognitionRef.current?.abort(); return; }
    const recognition = new RecognitionClass();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = event => { setInput(event.results[0][0].transcript); setVoiceMessage('Transcript ready. Review it, then send.'); inputRef.current?.focus(); };
    recognition.onerror = event => setVoiceMessage(event.error === 'not-allowed' ? 'Microphone access was not granted. Typed commands still work.' : `Voice input stopped (${event.error}). You can type your change.`);
    recognition.onend = () => setListening(false);
    try { recognition.start(); setListening(true); setVoiceMessage('Listening…'); } catch { setVoiceMessage('Voice input could not start. Please type your change.'); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (input.trim()) onCommand(input.trim()); }
  return <section className="panel command-panel" aria-labelledby="command-heading"><form className="command-form" onSubmit={submit}><h2 id="command-heading"><label htmlFor="command-input">Tell me what changed</label></h2><div className="command-field"><input ref={inputRef} id="command-input" value={input} onChange={event => setInput(event.target.value)} placeholder="ochre scrap is 6 cm tall" maxLength={300} autoComplete="off" /><button type="button" className={`speak-button ${listening ? 'listening' : ''}`} onClick={speak} aria-label={listening ? 'Stop voice input' : RecognitionClass ? 'Speak' : 'Voice input unavailable; use typed commands'} aria-pressed={listening}><Icon name="mic" /><span>{listening ? 'Stop' : 'Speak'}</span></button></div><button className="button primary send-button" type="submit" disabled={!input.trim()} aria-label="Send command"><Icon name="send" /></button></form>
    {voiceMessage && <p className="voice-message" role="status">{voiceMessage}</p>}
    <details className="command-help"><summary>Supported commands</summary><p className="form-note">{help}</p><ul>{examples.map(example => <li key={example}><button className="text-button" onClick={() => { setInput(example); inputRef.current?.focus(); }}>{example}</button></li>)}</ul></details>
  </section>;
}
