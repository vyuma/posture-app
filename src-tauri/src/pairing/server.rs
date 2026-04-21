use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread,
};

use super::state::{timestamp_string, ErrorResponse, PairingStateHandle};

pub fn start_pairing_server(state: PairingStateHandle) -> Result<(), String> {
    let listener = TcpListener::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    state.set_port(port);

    thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let request_state = state.clone();
                    thread::spawn(move || {
                        if let Err(error) = handle_connection(stream, request_state) {
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

    match path {
        "/health" => write_json(&mut stream, 200, &state.build_health_response()),
        "/pair" => handle_pair(&mut stream, &state, &query_map),
        "/poll" => handle_poll(&mut stream, &state, &query_map),
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
    write_json(stream, 200, &response)
}

fn handle_poll(
    stream: &mut TcpStream,
    state: &PairingStateHandle,
    query_map: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    match validate_token(state, query_map)? {
        Some(error) => return write_json(stream, 400, &error),
        None => {}
    }

    if !state.snapshot().paired {
        return write_json(stream, 400, &state.not_paired_error());
    }

    let last_sequence = query_map
        .get("lastSequence")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);

    state.update_last_seen();
    let response = state.build_poll_response(last_sequence);
    write_json(stream, 200, &response)
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
