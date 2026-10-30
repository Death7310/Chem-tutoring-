import { useRef, useState } from "react";
import { exportStudyData, importStudyData } from "../lib/backup";
import type { TutorMode } from "../lib/db";
import { blobToBase64 } from "../lib/images";
import { updateSettings, useSettings, type Effort } from "../lib/settings";

export default function SettingsPage() {
  const settings = useSettings();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const restoreInput = useRef<HTMLInputElement>(null);

  const backup = async () => {
    const blob = await exportStudyData();
    const fileName = `chem-tutor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    // Inside the Android app, the WebView can't download files itself; the app saves it to Downloads.
    const bridge = (window as { AndroidBridge?: { saveFile: (b64: string, name: string, mime: string) => void } }).AndroidBridge;
    if (bridge) {
      bridge.saveFile(await blobToBase64(blob), fileName, "application/json");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restore = async (file: File) => {
    try {
      const result = await importStudyData(file);
      setMessage(`Restored ${result.sets} problem sets and ${result.sessions} sessions.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <h1>Settings</h1>

      <h2>Claude API key</h2>
      <div className="row">
        <input
          type="password"
          placeholder={settings.apiKey ? "•••••••• (saved)" : "sk-ant-…"}
          value={draft}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1, width: "auto" }}
        />
        <button className="primary" disabled={!draft.trim()} onClick={() => { updateSettings({ apiKey: draft.trim() }); setDraft(""); }}>
          Save
        </button>
        {settings.apiKey && <button onClick={() => updateSettings({ apiKey: "" })}>Remove</button>}
      </div>
      <p className="muted small">
        Create a key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a> and
        set a monthly spend limit there. API usage is billed separately from a Claude subscription. The key is stored only on
        this device and sent only to Anthropic.
      </p>

      <h2>Tutor</h2>
      <label className="field">
        <span>Default mode for new sessions</span>
        <select value={settings.defaultMode} onChange={(e) => updateSettings({ defaultMode: e.target.value as TutorMode })}>
          <option value="coach">Coach: hints first, then checks you understand</option>
          <option value="explain">Explain: direct explanations</option>
          <option value="quiz">Quiz me: the tutor asks the questions</option>
        </select>
      </label>
      <label className="field">
        <span>Thinking effort</span>
        <select value={settings.effort} onChange={(e) => updateSettings({ effort: e.target.value as Effort })}>
          <option value="low">Low: fastest and cheapest</option>
          <option value="medium">Medium: recommended</option>
          <option value="high">High: most careful, costs more</option>
        </select>
      </label>

      <h2>Move study data between devices</h2>
      <p className="muted small">
        Each device keeps its own data. To study a test on your iPad that you photographed on your phone, make a backup on
        the phone, open the file on the iPad (via Google Drive, email, etc.) and restore it. Books aren't included: import
        the same book file on each device and the page links will match.
      </p>
      <div className="row">
        <button onClick={backup}>⬇️ Back up study data</button>
        <button onClick={() => restoreInput.current?.click()}>⬆️ Restore from backup</button>
        <input
          ref={restoreInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void restore(file);
          }}
        />
      </div>
      {message && <p className="small">{message}</p>}

      <h2>Install on your device</h2>
      <ul className="small">
        <li>
          <strong>Android:</strong> install the app file from{" "}
          <a href="https://github.com/Death7310/Chem-tutoring-/releases/latest/download/chem-tutor.apk">this download link</a>, or in
          Chrome use menu ⋮ → <em>Install app</em>.
        </li>
        <li><strong>iPad (Safari):</strong> Share → <em>Add to Home Screen</em>. Use it from the home-screen icon so Safari doesn't clear its storage.</li>
      </ul>
    </div>
  );
}
