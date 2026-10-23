"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { robotTitle, saveRobots, shrinkPhoto, type Registry, type RobotRecord } from "@/lib/robots";
import { MAX, robotKey } from "@/lib/weaiUuid";

// What the inputs hold; numbers stay as typed text until saved.
interface Draft {
  brand: string;
  brandName: string;
  model: string;
  modelName: string;
  photo: string;
}

const EMPTY: Draft = { brand: "", brandName: "", model: "", modelName: "", photo: "" };

// Brand and model numbers as they appear in the UUID (1-999).
function parseNumber(text: string, max: number) {
  const t = text.trim();
  return /^\d+$/.test(t) && +t >= 1 && +t <= max ? +t : null;
}

function draftOf(r: RobotRecord): Draft {
  return { brand: String(r.brand), brandName: r.brandName, model: String(r.model), modelName: r.modelName, photo: r.photo };
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className={error ? "invalid" : undefined}>
      {label}
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

// Saves a name and photo for a brand + model pair. Everything else on the card comes from the beacon's UUID.
export function AddRobot({ robots, onChange, onClose }: { robots: Registry; onChange: (robots: Registry) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null); // key of the saved robot in the form
  const [tried, setTried] = useState(false); // a save was attempted, so empty fields show as errors too
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null); // first tap on Delete asks to confirm
  const sheet = useRef<HTMLDivElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
    setStatus(null);
  }

  const brand = parseNumber(draft.brand, MAX.brand);
  const model = parseNumber(draft.model, MAX.model);
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (brand === null) errors.brand = `1–${MAX.brand}`;
  if (model === null) errors.model = `1–${MAX.model}`;
  if (!draft.brandName.trim()) errors.brandName = "Required";
  if (!draft.modelName.trim()) errors.modelName = "Required";
  // Errors show once a field has something in it, or for every field after a save attempt.
  const shown = (k: keyof Draft) => (tried || draft[k] !== "" ? errors[k] : undefined);
  const key = brand !== null && model !== null ? robotKey({ brand, model }) : null;
  const replaces = key && key !== editing ? robots[key] : undefined;

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same photo again still counts
    if (!file) return;
    setPhotoBusy(true);
    try {
      set("photo", await shrinkPhoto(file));
    } catch {
      setStatus({ text: "Could not read that photo.", error: true });
    } finally {
      setPhotoBusy(false);
    }
  }

  function persist(next: Registry) {
    try {
      saveRobots(next);
    } catch {
      setStatus({ text: "This app's storage on the phone is full. Delete a robot or retake a photo.", error: true });
      return false;
    }
    onChange(next);
    return true;
  }

  function save() {
    setTried(true);
    if (!key || brand === null || model === null || Object.keys(errors).length > 0) {
      setStatus({ text: "Fix the fields marked in red.", error: true });
      return;
    }
    const record: RobotRecord = { brand, brandName: draft.brandName.trim(), model, modelName: draft.modelName.trim(), photo: draft.photo };
    const next = { ...robots, [key]: record };
    // Brand or model number changed while editing: the robot moves to its new key.
    if (editing && editing !== key) delete next[editing];
    if (!persist(next)) return;
    setEditing(key);
    setStatus({ text: `Saved ${robotTitle(record)}.` });
  }

  function startNew() {
    setDraft(EMPTY);
    setEditing(null);
    setTried(false);
    setStatus(null);
    setDeleting(null);
  }

  function edit(k: string) {
    setDraft(draftOf(robots[k]));
    setEditing(k);
    setTried(false);
    setStatus(null);
    setDeleting(null);
    sheet.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function remove(k: string) {
    if (deleting !== k) {
      setDeleting(k);
      return;
    }
    const next = { ...robots };
    delete next[k];
    if (!persist(next)) return;
    if (editing === k) startNew();
    setDeleting(null);
  }

  const saved = Object.entries(robots).sort(([, a], [, b]) => a.brand - b.brand || a.model - b.model);

  return (
    <div ref={sheet} className="sheet" role="dialog" aria-label={editing ? "Edit robot" : "Add robot"}>
      <header className="calib-head">
        <h1>{editing ? "Edit robot" : "Add robot"}</h1>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="muted small">
        The names and photo show on every beacon whose UUID has this brand and model number. Everything else on the card is read from the UUID. Saved
        on this phone.
      </p>

      <div className="form-pair">
        <Field label="Brand #" error={shown("brand")}>
          <input inputMode="numeric" value={draft.brand} onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Brand name" error={shown("brandName")}>
          <input autoCapitalize="words" value={draft.brandName} onChange={(e) => set("brandName", e.target.value)} />
        </Field>
      </div>
      <div className="form-pair">
        <Field label="Model #" error={shown("model")}>
          <input inputMode="numeric" value={draft.model} onChange={(e) => set("model", e.target.value)} />
        </Field>
        <Field label="Model name" error={shown("modelName")}>
          <input autoCapitalize="words" value={draft.modelName} onChange={(e) => set("modelName", e.target.value)} />
        </Field>
      </div>

      <div className="photo-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="photo-preview" src={draft.photo || "/robot-placeholder.svg"} width={96} height={96} alt="Robot photo" />
        <div className="photo-actions">
          <button type="button" disabled={photoBusy} onClick={() => camera.current?.click()}>
            {photoBusy ? "Processing…" : draft.photo ? "Retake photo" : "Take photo"}
          </button>
          <button type="button" className="ghost" disabled={photoBusy} onClick={() => gallery.current?.click()}>
            From gallery
          </button>
          {draft.photo && (
            <button type="button" className="ghost" onClick={() => set("photo", "")}>
              Remove photo
            </button>
          )}
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={onPhoto} />
      </div>

      {replaces && (
        <p className="field-hint">
          Brand {brand} · model {model} is saved as {robotTitle(replaces)}. Saving replaces it.
        </p>
      )}
      {status && <p className={status.error ? "error" : "ok"}>{status.text}</p>}
      <div className="calib-actions">
        <button onClick={save}>{replaces ? "Replace" : editing ? "Save changes" : "Save robot"}</button>
        {editing && (
          <button className="ghost" onClick={startNew}>
            New robot
          </button>
        )}
      </div>

      <h2>Saved on this phone ({saved.length})</h2>
      {saved.length === 0 ? (
        <p className="muted small">None yet.</p>
      ) : (
        <ul className="saved-list">
          {saved.map(([k, r]) => (
            <li key={k} className={k === editing ? "current" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.photo || "/robot-placeholder.svg"} width={48} height={48} alt="" />
              <span className="saved-info">
                <b>{robotTitle(r)}</b>
                <span className="muted">
                  Brand {r.brand} · Model {r.model}
                </span>
              </span>
              <span className="saved-actions">
                <button className="ghost" onClick={() => edit(k)}>
                  Edit
                </button>
                <button className={deleting === k ? "danger" : "ghost"} onClick={() => remove(k)}>
                  {deleting === k ? "Confirm" : "Delete"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
