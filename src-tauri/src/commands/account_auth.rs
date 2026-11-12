use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};

const ORIGIN: &str = "https://www.piiin.app";
#[derive(Serialize, Deserialize)]
struct Credential { token: String, user_id: String }
#[derive(Serialize)]
pub struct ApiResponse { status: u16, body: String }
fn entry(app: &tauri::AppHandle) -> Result<keyring::Entry,String> {
    keyring::Entry::new(&format!("{}.analysis",app.config().identifier),ORIGIN).map_err(|_|"OSの安全な保存先を開けませんでした。".into())
}
fn credential(app: &tauri::AppHandle) -> Result<Option<Credential>,String> {
    match entry(app)?.get_password() {
        Ok(value)=>serde_json::from_str(&value).map(Some).map_err(|_|"ログイン情報を読み込めません。ログインし直してください。".into()),
        Err(keyring::Error::NoEntry)=>Ok(None),
        Err(_)=>Err("OSの安全な保存先にアクセスできませんでした。".into()),
    }
}
fn main_only(window: &tauri::WebviewWindow) -> Result<(),String> { if window.label()=="main" { Ok(()) } else { Err("Account commands require the main window".into()) } }
fn client() -> Result<reqwest::blocking::Client,String> {
    reqwest::blocking::Client::builder().https_only(true).redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(20)).build().map_err(|_|"接続を準備できませんでした。".into())
}
fn request(client: &reqwest::blocking::Client,path:&str,method:&str,body:Option<String>,auth:Option<&Credential>,owner:Option<&str>) -> Result<ApiResponse,String> {
    let method=reqwest::Method::from_bytes(method.as_bytes()).map_err(|_|"Invalid method")?;
    let mut request=client.request(method,format!("{ORIGIN}{path}"));
    if let Some(auth)=auth { request=request.bearer_auth(&auth.token); }
    if let Some(owner)=owner { request=request.header("X-Piiin-Account",owner); }
    if let Some(body)=body { if body.len()>524288 {return Err("送信データが大きすぎます。".into());} request=request.header("Content-Type","application/json").body(body); }
    let response=request.send().map_err(|_|"接続できません。記録は端末に保存されています。")?;
    let status=response.status().as_u16();
    use std::io::Read;
    let mut bytes=Vec::new();response.take(2_097_153).read_to_end(&mut bytes).map_err(|_|"応答を読み込めませんでした。")?;
    if bytes.len()>2_097_152 {return Err("応答が大きすぎます。".into());}
    let body=String::from_utf8(bytes).map_err(|_|"Invalid response")?;
    Ok(ApiResponse{status,body})
}
#[tauri::command]
pub async fn account_request(app:tauri::AppHandle,window:tauri::WebviewWindow,path:String,method:String,body:Option<String>,owner_id:Option<String>) -> Result<ApiResponse,String> {
    main_only(&window)?;
    let route=path.split('?').next().unwrap_or("");
    if !["GET","POST","DELETE"].contains(&method.as_str()) || path.contains("..") || path.contains('#') || !(matches!(route,"/api/me"|"/api/consent"|"/api/analysis"|"/api/account"|"/api/measurements"|"/api/profile/google"|"/api/profile"|"/api/profile/skip"|"/api/profile/language"|"/api/profile/google-prefill"|"/api/auth/sign-out") || route.starts_with("/api/measurements/")) { return Err("Unsupported account request".into()); }
    tauri::async_runtime::spawn_blocking(move||{
        let auth=credential(&app)?;
        if let (Some(owner),Some(auth))=(&owner_id,&auth) {if owner!=&auth.user_id{return Err("別のアカウントです。再ログインしてください。".into());}}
        request(&client()?,&path,&method,body,auth.as_ref(),owner_id.as_deref())
    }).await.map_err(|_|"通信を完了できませんでした。".to_string())?
}
#[tauri::command]
pub async fn account_login(app:tauri::AppHandle,window:tauri::WebviewWindow,provider:String)->Result<(),String> {
    main_only(&window)?;if !["google","apple","login","signup"].contains(&provider.as_str()) {return Err("Unknown provider".into());}
    tauri::async_runtime::spawn_blocking(move|| -> Result<(),String> {
        let client=client()?;
        let verifier=format!("{}{}",uuid::Uuid::new_v4().simple(),uuid::Uuid::new_v4().simple());
        let challenge=format!("{:x}",Sha256::digest(verifier.as_bytes()));
        let created=request(&client,"/api/native/create","POST",Some(json!({"challenge":challenge}).to_string()),None,None)?;
        if created.status!=200{return Err("ログインを開始できませんでした。".into());}
        let value:Value=serde_json::from_str(&created.body).map_err(|_|"Invalid login response")?;
        let id=value["id"].as_str().ok_or("Missing login id")?;
        uuid::Uuid::parse_str(id).map_err(|_|"Invalid login id")?;
        let url=if provider=="login"||provider=="signup" {format!("{ORIGIN}/{provider}?handoff={id}")} else {format!("{ORIGIN}/account/native?handoff={id}&provider={provider}")};
        open::that(url).map_err(|_|"ブラウザを開けませんでした。")?;
        let started=Instant::now();
        while started.elapsed()<Duration::from_secs(300) {
            std::thread::sleep(Duration::from_secs(2));
            let result=request(&client,"/api/native/exchange","POST",Some(json!({"id":id,"verifier":verifier}).to_string()),None,None)?;
            if result.status==202 {continue;}
            if result.status!=200 {return Err("ログインをもう一度開始してください。".into());}
            let value:Value=serde_json::from_str(&result.body).map_err(|_|"Invalid login response")?;
            let credential=Credential{token:value["token"].as_str().ok_or("Missing session")?.into(),user_id:value["userId"].as_str().ok_or("Missing account")?.into()};
            entry(&app)?.set_password(&serde_json::to_string(&credential).map_err(|_|"Could not encode session")?).map_err(|_|"OSの安全な保存先にログイン情報を保存できませんでした。")?;
            return Ok(());
        }
        Err("ログインの待機時間を過ぎました。もう一度お試しください。".into())
    }).await.map_err(|_|"ログインを完了できませんでした。".to_string())??;
    // The browser approves the one-time handoff; bring this app back only after
    // its session has been exchanged and stored successfully in the OS keychain.
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}
#[tauri::command]
pub async fn account_forget(app:tauri::AppHandle,window:tauri::WebviewWindow)->Result<(),String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||match entry(&app)?.delete_credential() {Ok(())|Err(keyring::Error::NoEntry)=>Ok(()),Err(_)=>Err("保存したログイン情報を削除できませんでした。".into())}).await.map_err(|_|"ログアウトできませんでした。".to_string())?
}
#[tauri::command]
pub fn account_open_settings(window:tauri::WebviewWindow)->Result<(),String> {
    main_only(&window)?;open::that(format!("{ORIGIN}/app?settings=account")).map_err(|_|"ブラウザを開けませんでした。".into())
}
