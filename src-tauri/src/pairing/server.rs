use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::{Arc, Mutex, OnceLock},
    thread,
    time::Duration,
};

use base64::Engine;
use serde::Deserialize;
use sha1::{Digest, Sha1};

use super::state::{timestamp_string, AcquiredCharacterPayload, ErrorResponse, PairingStateHandle};

type WsSink = Arc<Mutex<Vec<TcpStream>>>;
type QueryMap = HashMap<String, String>;
static WS_SINK: OnceLock<WsSink> = OnceLock::new();
const ACK_TIMEOUT_SEC: u64 = 5;
const ACK_MAX_RETRY: u32 = 5;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AckEventMessage {
    r#type: String,
    ack_event_id: String,
    ack_sequence: u64,
}

pub fn start_pairing_server(state: PairingStateHandle) -> Result<(), String> {
    let listener = TcpListener::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    state.set_port(port);

    let ws_sink: WsSink = Arc::new(Mutex::new(Vec::new()));
    let _ = WS_SINK.set(ws_sink.clone());

    let listener_state = state.clone();
    let listener_sink = ws_sink.clone();
    thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let request_state = listener_state.clone();
                    let request_ws_sink = listener_sink.clone();
                    thread::spawn(move || {
                        if let Err(error) =
                            handle_connection(stream, request_state, request_ws_sink)
                        {
                            eprintln!("pairing server error: {error}");
                        }
                    });
                }
                Err(error) => {
                    eprintln!("incoming connection error: {error}");
                }
            }
        }
    });

    let retry_state = state.clone();
    let retry_sink = ws_sink.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(1));
        let now_epoch_sec = timestamp_string().parse::<u64>().unwrap_or_default();
        let retry_events =
            retry_state.build_retry_due_events(now_epoch_sec, ACK_TIMEOUT_SEC, ACK_MAX_RETRY);
        if retry_events.is_empty() {
            continue;
        }
        broadcast_ws_events(&retry_sink, &retry_events);
    });

    Ok(())
}

fn handle_connection(
    mut stream: TcpStream,
    state: PairingStateHandle,
    ws_sink: WsSink,
) -> Result<(), String> {
    let mut buffer = [0_u8; 4096];
    let bytes_read = stream
        .read(&mut buffer)
        .map_err(|error| error.to_string())?;

    if bytes_read == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let request_line = request
        .lines()
        .next()
        .ok_or_else(|| "missing request line".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();

    if method != "GET" {
        return write_internal_error_json(&mut stream, 405, "method not allowed");
    }

    let (path, query) = split_target(target);
    let query_map = parse_query(query);
    let headers = parse_headers(&request);

    match path {
        "/health" => write_json(&mut stream, 200, &state.build_health_response()),
        "/pair" => handle_pair(&mut stream, &state, &query_map),
        "/disconnect" => handle_disconnect(&mut stream, &state, &query_map),
        "/ws" => handle_websocket(stream, &state, &query_map, &headers, &ws_sink),
        _ => write_internal_error_json(&mut stream, 404, "not found"),
    }
}

fn handle_pair(
    stream: &mut TcpStream,
    state: &PairingStateHandle,
    query_map: &QueryMap,
) -> Result<(), String> {
    if !ensure_valid_token(stream, state, query_map)? {
        return Ok(());
    }

    let device_name = match query_map.get("deviceName") {
        Some(device_name) if !device_name.is_empty() => device_name.clone(),
        _ => return write_json(stream, 400, &state.missing_device_name_error()),
    };

    let response = state.pair_device(device_name);
    broadcast_ws_state_event(state, "paired");
    write_json(stream, 200, &response)
}

fn handle_disconnect(
    stream: &mut TcpStream,
    state: &PairingStateHandle,
    query_map: &QueryMap,
) -> Result<(), String> {
    if !ensure_valid_token(stream, state, query_map)? {
        return Ok(());
    }

    let response = state.disconnect_device();
    broadcast_ws_state_event(state, "disconnected");
    if let Some(sink) = WS_SINK.get() {
        clear_ws_sink(sink);
    }
    write_json(stream, 200, &response)
}

fn handle_websocket(
    mut stream: TcpStream,
    state: &PairingStateHandle,
    query_map: &QueryMap,
    headers: &HashMap<String, String>,
    ws_sink: &WsSink,
) -> Result<(), String> {
    if !ensure_valid_token(&mut stream, state, query_map)? {
        return Ok(());
    }

    if !is_websocket_upgrade(headers) {
        return write_internal_error_json(&mut stream, 400, "invalid websocket upgrade request");
    }

    let peer_addr = stream.peer_addr().map_err(|error| error.to_string())?;

    let websocket_key = headers
        .get("sec-websocket-key")
        .ok_or_else(|| "missing sec-websocket-key".to_string())?;
    let accept_key = websocket_accept_key(websocket_key);

    let response = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n",
        accept_key
    );

    stream
        .write_all(response.as_bytes())
        .map_err(|error| error.to_string())?;

    let ws_writer = stream.try_clone().map_err(|error| error.to_string())?;
    {
        let mut clients = ws_sink.lock().expect("ws sink poisoned");
        clients.push(ws_writer);
    }

    let snapshot = state.build_ws_event("snapshot");
    write_ws_event(&mut stream, &snapshot)?;
    let pending_events = state.build_pending_resend_events();
    for event in pending_events {
        write_ws_event(&mut stream, &event)?;
    }

    read_until_socket_closes(stream, peer_addr, state, ws_sink)
}

/// WS クライアント数（`get_pairing_status` で上書きする）
pub fn ws_connected_client_count() -> usize {
    WS_SINK
        .get()
        .map(|sink| sink.lock().expect("ws sink poisoned").len())
        .unwrap_or(0)
}

/// デスクトップ側のデバッグ操作で接続中のスマホ WebSocket を閉じる
pub fn disconnect_ws_clients() {
    if let Some(sink) = WS_SINK.get() {
        clear_ws_sink(sink);
    }
}

fn clear_ws_sink(ws_sink: &WsSink) {
    let mut clients = ws_sink.lock().expect("ws sink poisoned");
    clients.clear();
}

/// 読み取り側が終了したら当該ピアの書き込みストリームだけシンクから外す。
/// HTTP /pair で確立したペア状態は維持し、モバイル再接続時に snapshot で measuring 等を復元できるようにする。
fn remove_ws_clients_for_peer(ws_sink: &WsSink, peer: SocketAddr) {
    let mut clients = ws_sink.lock().expect("ws sink poisoned");
    clients.retain_mut(|client| match client.peer_addr() {
        Ok(p) => p != peer,
        Err(_) => false,
    });
}

pub fn broadcast_ws_state_event(state: &PairingStateHandle, event_type: &str) {
    if let Some(ws_sink) = WS_SINK.get() {
        let event = state.build_ws_event(event_type);
        broadcast_ws_event(ws_sink, &event);
    }
}

pub fn broadcast_ws_acquired_event(state: &PairingStateHandle, payload: AcquiredCharacterPayload) {
    if let Some(ws_sink) = WS_SINK.get() {
        let event = state.create_acquired_event(payload);
        state.mark_acquired_event_sent(&event.event_id);
        broadcast_ws_event(ws_sink, &event);
    }
}

fn broadcast_ws_events<T: serde::Serialize>(ws_sink: &WsSink, events: &[T]) {
    for event in events {
        broadcast_ws_event(ws_sink, event);
    }
}

fn broadcast_ws_event(ws_sink: &WsSink, event: &impl serde::Serialize) {
    let payload = match serde_json::to_string(event) {
        Ok(payload) => payload,
        Err(error) => {
            eprintln!("failed to serialize websocket event: {error}");
            return;
        }
    };

    let mut clients = ws_sink.lock().expect("ws sink poisoned");
    clients.retain_mut(|client| write_websocket_text_frame(client, &payload).is_ok());
}

fn read_until_socket_closes(
    mut stream: TcpStream,
    peer_addr: SocketAddr,
    state: &PairingStateHandle,
    ws_sink: &WsSink,
) -> Result<(), String> {
    let mut buffer = [0_u8; 1024];

    let read_outcome = loop {
        match stream.read(&mut buffer) {
            Ok(0) => break Ok(()),
            Ok(bytes_read) => {
                if let Some(text) = parse_websocket_text_frame(&buffer[..bytes_read]) {
                    handle_websocket_client_message(state, &text);
                }
                continue;
            }
            Err(error) => break Err(error.to_string()),
        }
    };

    remove_ws_clients_for_peer(ws_sink, peer_addr);
    read_outcome
}

fn handle_websocket_client_message(state: &PairingStateHandle, text: &str) {
    let ack = match serde_json::from_str::<AckEventMessage>(text) {
        Ok(message) => message,
        Err(_) => return,
    };
    if ack.r#type != "ack_event" {
        return;
    }
    if !state.ack_event(&ack.ack_event_id, ack.ack_sequence) {
        eprintln!(
            "unmatched ack received: event_id={}, sequence={}",
            ack.ack_event_id, ack.ack_sequence
        );
    }
}

fn parse_websocket_text_frame(frame: &[u8]) -> Option<String> {
    if frame.len() < 2 {
        return None;
    }
    let opcode = frame[0] & 0x0F;
    if opcode != 0x1 {
        return None;
    }
    let masked = (frame[1] & 0x80) != 0;
    if !masked {
        return None;
    }
    let mut payload_len = (frame[1] & 0x7F) as usize;
    let mut index = 2_usize;
    if payload_len == 126 {
        if frame.len() < 4 {
            return None;
        }
        payload_len = u16::from_be_bytes([frame[2], frame[3]]) as usize;
        index = 4;
    } else if payload_len == 127 {
        if frame.len() < 10 {
            return None;
        }
        payload_len = u64::from_be_bytes([
            frame[2], frame[3], frame[4], frame[5], frame[6], frame[7], frame[8], frame[9],
        ]) as usize;
        index = 10;
    }
    if frame.len() < index + 4 + payload_len {
        return None;
    }
    let mask = &frame[index..index + 4];
    let payload_start = index + 4;
    let payload_end = payload_start + payload_len;
    let mut decoded = Vec::with_capacity(payload_len);
    for (offset, byte) in frame[payload_start..payload_end].iter().enumerate() {
        decoded.push(*byte ^ mask[offset % 4]);
    }
    String::from_utf8(decoded).ok()
}

fn write_websocket_text_frame(stream: &mut TcpStream, text: &str) -> Result<(), String> {
    let payload = text.as_bytes();
    let payload_len = payload.len();

    let mut frame = Vec::with_capacity(payload_len + 10);
    frame.push(0x81);

    if payload_len <= 125 {
        frame.push(payload_len as u8);
    } else if payload_len <= 65535 {
        frame.push(126);
        frame.extend_from_slice(&(payload_len as u16).to_be_bytes());
    } else {
        frame.push(127);
        frame.extend_from_slice(&(payload_len as u64).to_be_bytes());
    }

    frame.extend_from_slice(payload);

    stream.write_all(&frame).map_err(|error| error.to_string())
}

fn write_ws_event(stream: &mut TcpStream, event: &impl serde::Serialize) -> Result<(), String> {
    let payload = serde_json::to_string(event).map_err(|error| error.to_string())?;
    write_websocket_text_frame(stream, &payload)
}

fn websocket_accept_key(client_key: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(client_key.as_bytes());
    hasher.update(b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    let hash = hasher.finalize();

    base64::engine::general_purpose::STANDARD.encode(hash)
}

fn is_websocket_upgrade(headers: &HashMap<String, String>) -> bool {
    let upgrade = headers
        .get("upgrade")
        .map(|value| value.eq_ignore_ascii_case("websocket"))
        .unwrap_or(false);
    let connection_upgrade = headers
        .get("connection")
        .map(|value| {
            value
                .split(',')
                .any(|part| part.trim().eq_ignore_ascii_case("upgrade"))
        })
        .unwrap_or(false);

    upgrade && connection_upgrade
}

fn parse_headers(request: &str) -> HashMap<String, String> {
    let mut headers = HashMap::new();

    for line in request.lines().skip(1) {
        if line.trim().is_empty() {
            break;
        }

        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    headers
}

fn validate_token(state: &PairingStateHandle, query_map: &QueryMap) -> Option<ErrorResponse> {
    let token = match query_map.get("token") {
        Some(token) if !token.is_empty() => token,
        _ => return Some(state.missing_token_error()),
    };

    if !state.matches_token(token) {
        return Some(state.invalid_token_error());
    }

    None
}

fn split_target(target: &str) -> (&str, &str) {
    match target.split_once('?') {
        Some((path, query)) => (path, query),
        None => (target, ""),
    }
}

fn parse_query(query: &str) -> QueryMap {
    let mut params = HashMap::new();

    for entry in query.split('&') {
        if entry.is_empty() {
            continue;
        }

        let (key, value) = match entry.split_once('=') {
            Some((key, value)) => (key, value),
            None => (entry, ""),
        };

        params.insert(percent_decode(key), percent_decode(value));
    }

    params
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(value.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let hex = &value[index + 1..index + 3];
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        decoded.push(byte);
                        index += 3;
                    }
                    Err(_) => {
                        decoded.push(b'%');
                        index += 1;
                    }
                }
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8_lossy(&decoded).into_owned()
}

fn ensure_valid_token(
    stream: &mut TcpStream,
    state: &PairingStateHandle,
    query_map: &QueryMap,
) -> Result<bool, String> {
    match validate_token(state, query_map) {
        Some(error) => {
            write_json(stream, 400, &error)?;
            Ok(false)
        }
        None => Ok(true),
    }
}

fn write_internal_error_json(
    stream: &mut TcpStream,
    status_code: u16,
    message: &str,
) -> Result<(), String> {
    write_json(
        stream,
        status_code,
        &serde_json::json!({
            "ok": false,
            "errorCode": "INTERNAL_ERROR",
            "message": message
        }),
    )
}

fn write_json<T: serde::Serialize>(
    stream: &mut TcpStream,
    status_code: u16,
    payload: &T,
) -> Result<(), String> {
    let body = serde_json::to_string(payload).map_err(|error| error.to_string())?;
    let response = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\nDate: {}\r\n\r\n{}",
        status_code,
        reason_phrase(status_code),
        body.len(),
        timestamp_string(),
        body
    );

    stream
        .write_all(response.as_bytes())
        .map_err(|error| error.to_string())
}

fn reason_phrase(status_code: u16) -> &'static str {
    match status_code {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Internal Server Error",
    }
}
