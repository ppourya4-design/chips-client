#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, io::{BufRead, BufReader, Write}, process::{Child, Command, Stdio}, sync::{Arc, Mutex, mpsc::{self, SyncSender}}, thread, time::{Duration, Instant}};
use tauri::{ipc::Channel, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

type Processes = Arc<Mutex<HashMap<String, Process>>>;
struct Process { child: Arc<Mutex<Child>>, input: SyncSender<String> }
#[derive(Default)]
struct ProcessState(Processes);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    host: String, nickname: String, server_password: Option<String>,
    channel_password: Option<String>, default_channel: Option<String>,
    identity: Option<String>, server_type: Option<String>, privilege_key: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum SidecarEvent { Line { line: String }, Exit { code: Option<i32> } }

#[tauri::command]
fn start_connector(app: tauri::AppHandle, state: tauri::State<'_, ProcessState>, id: String, options: Options, events: Channel<SidecarEvent>) -> Result<(), String> {
    // The webview may not select arbitrary executables or pass arbitrary flags.
    if id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { return Err("Invalid session ID".into()); }
    if options.host.is_empty() || options.host.len() > 253 || options.host.starts_with('-') || !options.host.chars().all(|c| c.is_alphanumeric() || ".-_:[ ]".contains(c) && c != ' ') { return Err("Invalid address".into()); }
    if options.nickname.trim().is_empty() || options.nickname.chars().count() > 100 || options.nickname.chars().any(char::is_control) { return Err("Invalid nickname".into()); }
    // A bare TeamSpeak nickname invokes an external lookup service in the black-box library.
    if !options.host.contains('.') && !options.host.contains(':') && options.host != "localhost" { return Err("Use a hostname or IP address instead of a server nickname".into()); }
    let executable = std::env::current_exe().map_err(|e| e.to_string())?.parent().ok_or("Missing executable directory")?.join(if cfg!(windows) { "ts-connector.exe" } else { "ts-connector" });
    let mut cmd = Command::new(executable);
    cmd.arg(format!("--address={}", options.host)).arg(format!("--nickname={}", options.nickname));
    if let Some(s) = options.default_channel { cmd.arg(format!("--default-channel={s}")); }
    if let Some(s) = options.server_type { if ["auto", "teamspeak", "teaspeak"].contains(&s.as_str()) { cmd.arg(format!("--server-type={s}")); } }
    for (key, value) in [("TS_SERVER_PASSWORD", options.server_password), ("TS_CHANNEL_PASSWORD", options.channel_password), ("TS_IDENTITY", options.identity), ("TS_PRIVILEGE_KEY", options.privilege_key)] {
        // Never inherit unrelated credentials from the parent.
        cmd.env_remove(key);
        if let Some(value) = value { cmd.env(key, value); }
    }
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)] cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let mut map = state.0.lock().map_err(|_| "Process state unavailable")?;
    if map.contains_key(&id) || map.len() >= 16 { return Err("Session limit reached".into()); }
    let mut child = cmd.spawn().map_err(|e| format!("Could not start connector: {e}"))?;
    let stdin = child.stdin.take().ok_or("Missing connector stdin")?;
    let stdout = child.stdout.take().ok_or("Missing connector stdout")?;
    let child = Arc::new(Mutex::new(child));
    let (sender, receiver) = mpsc::sync_channel::<String>(256);
    map.insert(id.clone(), Process { child: child.clone(), input: sender });
    drop(map);
    thread::spawn(move || {
        let mut stdin = stdin;
        while let Ok(line) = receiver.recv() { if stdin.write_all(line.as_bytes()).is_err() { break; } }
    });
    let line_events = events.clone();
    let reader = thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line { Ok(line) => { if line_events.send(SidecarEvent::Line { line }).is_err() { break; } }, Err(_) => break }
        }
    });
    let processes = state.0.clone();
    thread::spawn(move || {
        let code = loop {
            let result = child.lock().ok().and_then(|mut c| c.try_wait().ok().flatten());
            if let Some(status) = result { break status.code(); }
            thread::sleep(Duration::from_millis(50));
        };
        let _ = reader.join();
        if let Ok(mut map) = processes.lock() { map.remove(&id); }
        let _ = events.send(SidecarEvent::Exit { code });
    });
    let _ = app; // app owns state until shutdown
    Ok(())
}

#[tauri::command]
fn write_connector(state: tauri::State<'_, ProcessState>, id: String, line: String) -> Result<(), String> {
    if line.len() > 36 * 1024 * 1024 || !line.ends_with('\n') || line[..line.len()-1].contains(['\n', '\r']) { return Err("Invalid command".into()); }
    let map = state.0.lock().map_err(|_| "Process state unavailable")?;
    map.get(&id).ok_or("Session closed")?.input.try_send(line).map_err(|_| "Connector input unavailable".into())
}

#[tauri::command]
fn stop_connector(state: tauri::State<'_, ProcessState>, id: String, message: String) -> Result<(), String> {
    let process = state.0.lock().map_err(|_| "Process state unavailable")?.remove(&id);
    if let Some(process) = process {
        let sanitized = message.replace(['\r', '\n'], " ");
        let _ = process.input.try_send(format!("disconnect {sanitized}\n"));
        drop(process.input);
        let until = Instant::now() + Duration::from_secs(3);
        loop {
            let mut child = process.child.lock().map_err(|_| "Process unavailable")?;
            if child.try_wait().map_err(|e| e.to_string())?.is_some() { break; }
            if Instant::now() >= until { let _ = child.kill(); let _ = child.wait(); break; }
            drop(child);
            thread::sleep(Duration::from_millis(50));
        }
    }
    Ok(())
}

fn main() {
    let app = tauri::Builder::default().manage(ProcessState::default())
        .invoke_handler(tauri::generate_handler![start_connector, write_connector, stop_connector])
        .build(tauri::generate_context!()).expect("Failed to start Chips");
    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = handle.state::<ProcessState>();
            if let Ok(mut processes) = state.0.lock() {
                for (_, process) in processes.drain() {
                    if let Ok(mut child) = process.child.lock() { let _ = child.kill(); let _ = child.wait(); }
                }
            };
        }
    });
}
