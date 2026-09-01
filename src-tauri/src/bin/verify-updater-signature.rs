//! Release-only verification command which mirrors Tauri updater's Minisign
//! decoding contract. It receives a public key at runtime; no production key is
//! committed to this repository.

use std::env;
use std::fs;
use std::process::ExitCode;

use base64::Engine;
use minisign_verify::{PublicKey, Signature};

fn decode_tauri_encoded(value: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value.trim())
        .map_err(|_| "invalid base64 updater signature material".to_owned())?;
    String::from_utf8(bytes).map_err(|_| "updater signature material is not UTF-8".to_owned())
}

fn verify(public_key: &str, artifact: &[u8], signature: &str) -> Result<(), String> {
    let public_key = PublicKey::decode(&decode_tauri_encoded(public_key)?)
        .map_err(|_| "invalid updater public key".to_owned())?;
    let signature = Signature::decode(&decode_tauri_encoded(signature)?)
        .map_err(|_| "invalid updater signature".to_owned())?;
    public_key
        .verify(artifact, &signature, true)
        .map_err(|_| "updater signature verification failed".to_owned())
}

fn main() -> ExitCode {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 3 {
        eprintln!("usage: verify-updater-signature <artifact> <signature-file>");
        return ExitCode::from(2);
    }
    let public_key = match env::var("TAURI_UPDATER_PUBLIC_KEY") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            eprintln!("TAURI_UPDATER_PUBLIC_KEY is required");
            return ExitCode::from(2);
        }
    };
    let artifact = match fs::read(&args[1]) {
        Ok(value) => value,
        Err(_) => {
            eprintln!("could not read updater artifact");
            return ExitCode::FAILURE;
        }
    };
    let signature = match fs::read_to_string(&args[2]) {
        Ok(value) => value,
        Err(_) => {
            eprintln!("could not read updater signature");
            return ExitCode::FAILURE;
        }
    };
    match verify(&public_key, &artifact, &signature) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_tauri_wrapped_minisign_material_and_rejects_tampering() {
        // These are the upstream minisign-verify 0.2.5 test fixtures, wrapped
        // exactly as the Tauri updater's `base64_to_string` path requires.
        let raw_public_key = "untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
        let raw_signature = "untrusted comment: signature from minisign secret key\nRWQf6LRCGA9i59SLOFxz6NxvASXDJeRtuZykwQepbDEGt87ig1BNpWaVWuNrm73YiIiJbq71Wi+dP9eKL8OC351vwIasSSbXxwA=\ntrusted comment: timestamp:1555779966\tfile:test\nQtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==";
        let public_key = base64::engine::general_purpose::STANDARD.encode(raw_public_key);
        let signature = base64::engine::general_purpose::STANDARD.encode(raw_signature);

        assert!(verify(&public_key, b"test", &signature).is_ok());
        assert!(verify(&public_key, b"changed", &signature).is_err());

        // This is still well-formed base64 and Minisign text, so it proves the
        // cryptographic verification rejects a CDN-delivered signature whose
        // content was altered rather than merely rejecting malformed input.
        let tampered_signature = base64::engine::general_purpose::STANDARD.encode(
            raw_signature.replacen(
                "QtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==",
                "AtKMXWyYcwdpZAlPF7tE2ENJkRd1ujvKjlj1m9RtHTBnZPa5WKU5uWRs5GoP5M/VqE81QFuMKI5k/SfNQUaOAA==",
                1,
            ),
        );
        assert!(verify(&public_key, b"test", &tampered_signature).is_err());
    }

    #[test]
    fn rejects_malformed_tauri_material() {
        assert!(verify("not base64", b"artifact", "not base64").is_err());
    }
}
