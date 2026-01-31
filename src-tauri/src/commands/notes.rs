use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub updated_at: String,
}

fn notes_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;
    Ok(dir.join("notes.json"))
}

fn load_notes(app: &AppHandle) -> Result<Vec<Note>, String> {
    let path = notes_file_path(app)?;
    if !path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read notes: {e}"))?;
    if content.trim().is_empty() {
        return Ok(vec![]);
    }

    serde_json::from_str::<Vec<Note>>(&content).map_err(|e| format!("Failed to parse notes: {e}"))
}

fn save_notes(app: &AppHandle, notes: &[Note]) -> Result<(), String> {
    let path = notes_file_path(app)?;
    let tmp = path.with_extension("json.tmp");

    let content = serde_json::to_string_pretty(notes).map_err(|e| format!("Failed to serialize notes: {e}"))?;
    fs::write(&tmp, content).map_err(|e| format!("Failed to write temp notes file: {e}"))?;

    // Best-effort atomic-ish replace on Windows.
    let _ = fs::remove_file(&path);
    fs::rename(&tmp, &path).map_err(|e| format!("Failed to commit notes file: {e}"))?;

    Ok(())
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn generate_note_id(existing: &[Note]) -> String {
    let base = chrono::Utc::now().timestamp_millis();
    let mut suffix: u32 = 0;
    loop {
        let id = if suffix == 0 {
            format!("note_{base}")
        } else {
            format!("note_{base}_{suffix}")
        };
        if !existing.iter().any(|n| n.id == id) {
            return id;
        }
        suffix = suffix.saturating_add(1);
    }
}

/// List all notes (sorted by updated_at desc).
#[tauri::command]
pub fn list_notes(app: AppHandle) -> Result<Vec<Note>, String> {
    let mut notes = load_notes(&app)?;
    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(notes)
}

/// Create a new note.
#[tauri::command]
pub fn create_note(app: AppHandle, title: Option<String>) -> Result<Note, String> {
    let mut notes = load_notes(&app)?;
    let note = Note {
        id: generate_note_id(&notes),
        title: title.unwrap_or_else(|| "Nova nota".to_string()),
        content: String::new(),
        updated_at: now_rfc3339(),
    };

    notes.push(note.clone());
    save_notes(&app, &notes)?;
    Ok(note)
}

/// Update a note by id.
#[tauri::command]
pub fn update_note(app: AppHandle, id: String, title: String, content: String) -> Result<Note, String> {
    let mut notes = load_notes(&app)?;
    let idx = notes
        .iter()
        .position(|n| n.id == id)
        .ok_or_else(|| "Note not found".to_string())?;

    notes[idx].title = title;
    notes[idx].content = content;
    notes[idx].updated_at = now_rfc3339();

    let updated = notes[idx].clone();
    save_notes(&app, &notes)?;
    Ok(updated)
}

/// Delete a note by id.
#[tauri::command]
pub fn delete_note(app: AppHandle, id: String) -> Result<(), String> {
    let mut notes = load_notes(&app)?;
    notes.retain(|n| n.id != id);
    save_notes(&app, &notes)?;
    Ok(())
}
