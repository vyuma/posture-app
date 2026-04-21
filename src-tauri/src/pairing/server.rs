use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex, OnceLock},
    thread,
};

use base64::Engine;
use sha1::{Digest, Sha1};

use super::state::{timestamp_string, ErrorResponse, PairingStateHandle};

type WsSink = Arc<Mutex<Vec<TcpStream>>>;
static WS_SINK: OnceLock<WsSink> = OnceLock::new();

pub fn start_pairing_server(state: PairingStateHandle) -> Result<(), String> {
    let listener = TcpListener::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    state.set_port(port);

    let ws_sink: WsSink = Arc::new(Mutex::new(Vec::new()));
    let _ = WS_SINK.set(ws_sink.clone());

    thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let request_state = state.clone();
                    let request_ws_sink = ws_sink.clone();
                    thread::spawn(move || {
                        if let Err(error) = handle_connection(stream, request_state, request_ws_sink)
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

    Ok(())
}

fn handle_connection(
    mut stream: TcpStream,
    state: PairingStateHandle,
    ws_sink: WsSink,
) -> Result<(), String> {
    let mut buffer = [0_u8; 4096];
    let bytes_read = stream.read(&mut buffer).map_err(|error| error.to_string())?;

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
        return write_json(
            &mut stream,
            405,
            &serde_json::json!({
                "ok": false,
                "errorCode": "INTERNAL_ERROR",
                "message": "method not allowed"
            }),
        );
    }

    let (path, query) = split_target(target);
    let query_map = parse_query(query);
    let headers = parse_headers(&request);

    match path {
        "/health" => write_json(&mut stream, 200, &state.build_health_response()),
        "/pair" => handle_pair(&mut stream, &state, &query_map),
        "/disconnect" => handle_disconnect(&mut stream, &state, &query_map),
        "/ws" => handle_websocket(stream, &state, &query_map, &headers, &ws_sink),
        _ => write_json(
            &mut stream,
            404,
            &serde_json::json!({
                "ok": false,
                "errorCode": "INTERNAL_ERROR",
                "message": "not found"
            }),
        ),
    }
}

fn handle_pair(
    stream: &mut TcpStream,
    state: &PairingStateHandle,
    query_map: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    match validate_token(state, query_map)? {
        Some(error) => return write_json(stream, 400, &error),
        None => {}
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
    query_map: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    match validate_token(state, query_map)? {
        Some(error) => return write_json(stream, 400, &error),
        None => {}
    }

    let response = state.disconnect_device();
    broadcast_ws_state_event(state, "disconnected");
    write_json(stream, 200, &response)
}

fn handle_websocket(
    mut stream: TcpStream,
    state: &PairingStateHandle,
    query_map: &std::collections::HashMap<String, String>,
    headers: &std::collections::HashMap<String, String>,
    ws_sink: &WsSink,
) -> Result<(), String> {
    match validate_token(state, query_map)? {
        Some(error) => return write_json(&mut stream, 400, &error),
        None => {}
    }

    if !is_websocket_upgrade(headers) {
        return write_json(
            &mut stream,
            400,
            &serde_json::json!({
                "ok": false,
                "errorCode": "INTERNAL_ERROR",
                "message": "invalid websocket upgrade request"
            }),
        );
    }

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

    read_until_socket_closes(stream)
}

pub fn broadcast_ws_state_event(state: &PairingStateHandle, event_type: &str) {
    if let Some(ws_sink) = WS_SINK.get() {
        let event = state.build_ws_event(event_type);
        broadcast_ws_event(ws_sink, &event);
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

fn read_until_socket_closes(mut stream: TcpStream) -> Result<(), String> {
    let mut buffer = [0_u8; 1024];

    loop {
        match stream.read(&mut buffer) {
            Ok(0) => return Ok(()),
            Ok(_) => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
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

    stream
        .write_all(&frame)
        .map_err(|error| error.to_string())
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

fn is_websocket_upgrade(headers: &std::collections::HashMap<String, String>) -> bool {
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

fn parse_headers(request: &str) -> std::collections::HashMap<String, String> {
    let mut headers = std::collections::HashMap::new();

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

fn validate_token(
    state: &PairingStateHandle,
    query_map: &std::collections::HashMap<String, String>,
) -> Result<Option<ErrorResponse>, String> {
    let token = match query_map.get("token") {
        Some(token) if !token.is_empty() => token,
        _ => return Ok(Some(state.missing_token_error())),
    };

    if token != &state.snapshot().token {
        return Ok(Some(state.invalid_token_error()));
    }

    Ok(None)
}

fn split_target(target: &str) -> (&str, &str) {
    match target.split_once('?') {
        Some((path, query)) => (path, query),
        None => (target, ""),
    }
}

fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
    let mut params = std::collections::HashMap::new();

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
    let mut decoded = String::with_capacity(value.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                decoded.push(' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let hex = &value[index + 1..index + 3];
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        decoded.push(byte as char);
                        index += 3;
                    }
                    Err(_) => {
                        decoded.push('%');
                        index += 1;
                    }
                }
            }
            byte => {
                decoded.push(byte as char);
                index += 1;
            }
        }
    }

    decoded
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
