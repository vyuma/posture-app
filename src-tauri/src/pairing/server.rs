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
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    while !buffer.ends_with(b"\r\n\r\n") {
        if buffer.len() >= 8192 {
            return Err("request headers too large".into());
        }
        let mut byte = [0u8; 1];
        stream.read_exact(&mut byte).map_err(|e| e.to_string())?;
        buffer.push(byte[0]);
    }
    stream.set_read_timeout(None).map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buffer);
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

    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    let ws_writer = stream.try_clone().map_err(|error| error.to_string())?;
    {
        // Serialize initial snapshot/replay with broadcasts to avoid interleaved frames.
        let mut clients = ws_sink.lock().expect("ws sink poisoned");
        write_ws_event(&mut stream, &state.build_ws_event("snapshot"))?;
        for event in state.build_pending_resend_events() {
            write_ws_event(&mut stream, &event)?;
        }
        clients.push(ws_writer);
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
    for client in clients.iter() {
        let _ = client.shutdown(std::net::Shutdown::Both);
    }
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
        if event_type == "disconnected" {
            broadcast_ws_event(ws_sink, &event);
            return;
        }
        let sink = ws_sink.clone();
        thread::spawn(move || broadcast_ws_event(&sink, &event));
    }
}

pub fn broadcast_ws_acquired_event(state: &PairingStateHandle, payload: AcquiredCharacterPayload) {
    if let Some(ws_sink) = WS_SINK.get() {
        let event = state.create_acquired_event(payload);
        state.mark_acquired_event_sent(&event.event_id);
        let sink = ws_sink.clone();
        thread::spawn(move || broadcast_ws_event(&sink, &event));
    }
}

pub fn broadcast_ws_completed_event(
    state: &PairingStateHandle,
    result: super::state::CompletedMeasurement,
) {
    let event = state.create_completed_event(result);
    state.mark_acquired_event_sent(&event.event_id);
    if let Some(sink) = WS_SINK.get() {
        let sink = sink.clone();
        thread::spawn(move || broadcast_ws_event(&sink, &event));
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
    let read_outcome = (|| -> Result<(), String> {
        loop {
            // read_exact handles split TCP packets and multiple frames per packet.
            let mut header = [0u8; 2];
            if let Err(e) = stream.read_exact(&mut header) {
                return if e.kind() == std::io::ErrorKind::UnexpectedEof {
                    Ok(())
                } else {
                    Err(e.to_string())
                };
            }
            if header[0] & 0x0f == 8 {
                return Ok(());
            }
            if header[0] & 0x80 == 0 || header[1] & 0x80 == 0 {
                return Err("unsupported websocket frame".into());
            }
            let mut frame = header.to_vec();
            let length = match header[1] & 0x7f {
                126 => {
                    let mut n = [0u8; 2];
                    stream.read_exact(&mut n).map_err(|e| e.to_string())?;
                    frame.extend(n);
                    u16::from_be_bytes(n) as usize
                }
                127 => return Err("client frame too large".into()),
                n => n as usize,
            };
            if length > 4096 {
                return Err("client frame too large".into());
            }
            let mut body = vec![0u8; length + 4];
            stream.read_exact(&mut body).map_err(|e| e.to_string())?;
            frame.extend(body);
            if let Some(text) = parse_websocket_text_frame(&frame) {
                if serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|v| v.get("type").and_then(|t| t.as_str()).map(str::to_owned))
                    .as_deref()
                    == Some("ping")
                {
                    let _guard = ws_sink.lock().expect("ws sink poisoned");
                    write_websocket_text_frame(&mut stream, "{\"type\":\"pong\"}")?;
                } else {
                    handle_websocket_client_message(state, &text);
                }
            }
        }
    })();

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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn connect(port: u16) -> TcpStream {
        let s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        s
    }
    fn headers(s: &mut TcpStream) -> String {
        let mut b = Vec::new();
        while !b.ends_with(b"\r\n\r\n") {
            let mut c = [0];
            s.read_exact(&mut c).unwrap();
            b.push(c[0]);
        }
        String::from_utf8(b).unwrap()
    }
    fn event(s: &mut TcpStream) -> Value {
        let mut h = [0; 2];
        s.read_exact(&mut h).unwrap();
        let n = if h[1] == 126 {
            let mut b = [0; 2];
            s.read_exact(&mut b).unwrap();
            u16::from_be_bytes(b) as usize
        } else {
            h[1] as usize
        };
        let mut b = vec![0; n];
        s.read_exact(&mut b).unwrap();
        serde_json::from_slice(&b).unwrap()
    }
    fn frame(value: Value) -> Vec<u8> {
        let b = value.to_string().into_bytes();
        assert!(b.len() < 126);
        let mut f = vec![0x81, 0x80 | b.len() as u8, 1, 2, 3, 4];
        f.extend(b.iter().enumerate().map(|(i, b)| b ^ [1, 2, 3, 4][i % 4]));
        f
    }
    fn ws(port: u16, token: &str) -> TcpStream {
        let mut s = connect(port);
        write!(s, "GET /ws?token={token} HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").unwrap();
        assert!(headers(&mut s).contains("101"));
        s
    }
    #[test]
    fn lan_pair_measure_reward_retry_ack_reconnect_disconnect() {
        let state = PairingStateHandle::new();
        start_pairing_server(state.clone()).unwrap();
        let info = state.get_pairing_info();
        let mut bad = connect(info.port);
        write!(
            bad,
            "GET /pair?token=wrong&deviceName=test HTTP/1.1\r\n\r\n"
        )
        .unwrap();
        assert!(headers(&mut bad).contains("400"));
        let mut http = connect(info.port);
        write!(
            http,
            "GET /pair?token={}&deviceName=test HTTP/1.1\r\n\r\n",
            info.token
        )
        .unwrap();
        let mut response = String::new();
        http.read_to_string(&mut response).unwrap();
        assert!(response.contains("\"paired\":true"));
        let mut socket = ws(info.port, &info.token);
        assert_eq!(event(&mut socket)["type"], "snapshot");
        state.set_measuring_session_active(true);
        broadcast_ws_state_event(&state, "measuring_started");
        assert_eq!(event(&mut socket)["measuringSessionActive"], true);
        state.set_posture(true);
        broadcast_ws_state_event(&state, "posture_bad");
        assert_eq!(event(&mut socket)["isBadPosture"], true);
        socket.shutdown(std::net::Shutdown::Both).unwrap();
        let mut socket = ws(info.port, &info.token);
        let snapshot = event(&mut socket);
        assert_eq!(snapshot["measuringSessionActive"], true);
        assert_eq!(snapshot["isBadPosture"], true);
        state.set_measuring_session_active(false);
        broadcast_ws_state_event(&state, "measuring_stopped");
        assert_eq!(event(&mut socket)["isBadPosture"], false);
        let payload = AcquiredCharacterPayload {
            measurement_id: "test-measurement".into(),
            acquired_at: "2026-09-19T00:00:00Z".into(),
            character_id: "normal-nago".into(),
            character_name: "test".into(),
            rarity: "common".into(),
            active_measurement_ms: Some(60000.25),
            good_ms: Some(60000.25),
            good_ratio: Some(1.0),
            posture_timeline: None,
            story: None,
            portrait_src: None,
            personality_tags: None,
            character_color: None,
            tone_class: None,
        };
        broadcast_ws_acquired_event(&state, payload);
        let reward = event(&mut socket);
        assert_eq!(reward["type"], "acquired_character");
        assert!(reward["payload"].get("postureTimeline").is_none());
        assert!(!state.ack_event(reward["eventId"].as_str().unwrap(), 99999));
        let retry =
            state.build_retry_due_events(timestamp_string().parse::<u64>().unwrap() + 6, 5, 5);
        assert_eq!(retry.len(), 1);
        broadcast_ws_events(WS_SINK.get().unwrap(), &retry);
        assert_eq!(event(&mut socket)["eventId"], reward["eventId"]);
        socket.shutdown(std::net::Shutdown::Both).unwrap();
        let mut socket = ws(info.port, &info.token);
        event(&mut socket);
        assert_eq!(event(&mut socket)["eventId"], reward["eventId"]);
        let ack = frame(
            json!({"type":"ack_event", "ackEventId":reward["eventId"], "ackSequence":reward["sequence"]}),
        );
        // Deliberately split ACK across TCP writes and coalesce its tail with a ping.
        socket.write_all(&ack[..3]).unwrap();
        thread::sleep(Duration::from_millis(20));
        let mut tail = ack[3..].to_vec();
        tail.extend(frame(json!({"type":"ping"})));
        socket.write_all(&tail).unwrap();
        assert_eq!(event(&mut socket)["type"], "pong");
        assert!(state.build_pending_resend_events().is_empty());
        let completed: super::super::state::CompletedMeasurement = serde_json::from_value(json!({
            "id": "measurement-A", "sourceId": "test-pc", "startedAt": "2026-09-19T00:00:00Z", "endedAt": "2026-09-19T00:01:00Z",
            "activeMeasurementMs": 60000.25, "goodMs": 10000.125, "goodRatio": 0.1667,
            "rewardQualified": false, "acquiredCharacterId": null, "postureTimeline": [], "character": null
        })).unwrap();
        socket.shutdown(std::net::Shutdown::Both).unwrap();
        broadcast_ws_completed_event(&state, completed);
        state.set_measurement_id(Some("measurement-B".into()));
        state.set_measuring_session_active(true);
        state.mark_posture_signal();
        let mut socket = ws(info.port, &info.token);
        let current = event(&mut socket);
        assert_eq!(current["measurementId"], "measurement-B");
        assert_eq!(current["measuringSessionActive"], true);
        let completion = event(&mut socket);
        assert_eq!(completion["type"], "measurement_completed");
        assert_eq!(completion["result"]["id"], "measurement-A");
        assert_eq!(completion["result"]["rewardQualified"], false);
        socket.write_all(&frame(json!({"type":"ack_event", "ackEventId":completion["eventId"], "ackSequence":completion["sequence"]}))).unwrap();
        socket.write_all(&frame(json!({"type":"ping"}))).unwrap();
        while event(&mut socket)["type"] != "pong" {}
        assert!(state.build_pending_resend_events().is_empty());
        let mut http = connect(info.port);
        write!(
            http,
            "GET /disconnect?token={} HTTP/1.1\r\n\r\n",
            info.token
        )
        .unwrap();
        assert!(headers(&mut http).contains("200"));
        assert_eq!(event(&mut socket)["type"], "disconnected");
        assert!(!state.is_paired());
    }
}
