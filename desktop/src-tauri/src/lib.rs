use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::ShellExt;

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("settings.json"))
}

fn load_config_path(app: &AppHandle) -> Option<String> {
    if let Ok(value) = std::env::var("OCA_DUPLEX_CONFIG") {
        if !value.is_empty() { return Some(value); }
    }
    let content = fs::read_to_string(settings_path(app).ok()?).ok()?;
    serde_json::from_str::<Value>(&content).ok()?["config_path"].as_str().map(str::to_owned)
}

fn save_config_path(app: &AppHandle, config_path: &str) -> Result<(), String> {
    fs::write(settings_path(app)?, serde_json::to_vec_pretty(&json!({ "config_path": config_path })).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

async fn run_sidecar(app: &AppHandle, request: &Value) -> Result<Value, String> {
    let request_text = serde_json::to_string(request).map_err(|error| error.to_string())?;
    let mut args = Vec::new();
    if request["method"] != "system.initialize" {
        if let Some(config_path) = load_config_path(app) {
            args.extend(["--config".to_string(), config_path]);
        }
    }
    args.extend(["--request".to_string(), request_text]);
    let output = app.shell().sidecar("oca-duplex-sidecar")
        .map_err(|error| error.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let envelope: Value = serde_json::from_str(stdout.trim()).map_err(|error| format!("Sidecar 返回无效数据：{error}; {stdout}"))?;
    if envelope["ok"] != true { return Err(envelope["error"]["message"].as_str().unwrap_or("Sidecar 请求失败").to_string()); }
    let result = envelope["result"].clone();
    if request["method"] == "system.initialize" {
        if let Some(config_path) = result["config_path"].as_str() { save_config_path(app, config_path)?; }
    }
    Ok(result)
}

#[tauri::command]
async fn desktop_request(app: AppHandle, request: Value) -> Result<Value, String> {
    run_sidecar(&app, &request).await
}

#[tauri::command]
async fn desktop_action(app: AppHandle, action: String, payload: Value) -> Result<Value, String> {
    match action.as_str() {
        "sync" => run_sidecar(&app, &json!({ "method": "sync.preview", "params": { "limit": 5 } })).await,
        "open_obsidian" => {
            app.opener().open_url("obsidian://open", None::<&str>).map_err(|error| error.to_string())?;
            Ok(json!({ "ok": true }))
        },
        "open_artifact" => {
            let target = payload["path"].as_str().ok_or("缺少要打开的路径")?;
            let uri = if std::path::Path::new(target).is_absolute() {
                format!("obsidian://open?path={}", urlencoding::encode(target))
            } else if let Some(config_path) = load_config_path(&app) {
                let config: Value = serde_json::from_str(&fs::read_to_string(config_path).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
                let absolute = PathBuf::from(config["vaultRoot"].as_str().ok_or("配置缺少 vaultRoot")?).join(target);
                format!("obsidian://open?path={}", urlencoding::encode(&absolute.to_string_lossy()))
            } else { return Err("尚未配置 Vault".into()); };
            app.opener().open_url(uri, None::<&str>).map_err(|error| error.to_string())?;
            Ok(json!({ "ok": true }))
        },
        _ => Err(format!("未知桌面操作：{action}"))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![desktop_request, desktop_action])
        .run(tauri::generate_context!())
        .expect("error while running OCA-Duplex");
}
