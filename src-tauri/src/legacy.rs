//! One-time import from the Electron app (v1). It kept connections in an electron-store file,
//! encrypted by `conf` with a fixed key: 16-byte IV, ':', then AES-256-CBC with a key derived by
//! PBKDF2-SHA512 (10,000 rounds) from the fixed key and the IV decoded as UTF-8 text.

use std::path::PathBuf;

use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use serde_json::Value;

const ELECTRON_STORE_KEY: &str = "kafka-suite-local-encryption-key";

/// Electron's userData folder for the app name "kafka-suite".
fn legacy_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("kafka-suite").join("kafka-suite-config.json"))
}

/// The v1 document (`{ "connections": [...] }`, passwords included), or None when there is none.
pub fn read() -> Result<Option<Value>, String> {
    let Some(path) = legacy_path() else { return Ok(None) };
    let data = match std::fs::read(&path) {
        Ok(d) => d,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("{}: {e}", path.display())),
    };
    let text = decrypt(&data, ELECTRON_STORE_KEY)?;
    serde_json::from_str(&text).map(Some).map_err(|e| format!("{}: {e}", path.display()))
}

fn decrypt(data: &[u8], key: &str) -> Result<String, String> {
    // conf writes plain JSON when encryption is off; same check it makes itself.
    if data.len() < 17 || data[16] != b':' {
        return String::from_utf8(data.to_vec()).map_err(|e| e.to_string());
    }
    let iv = &data[..16];
    // Node turns the IV into a string first (invalid bytes become U+FFFD), and that string is the salt.
    let salt = String::from_utf8_lossy(iv);
    let mut derived = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<sha2::Sha512>(key.as_bytes(), salt.as_bytes(), 10_000, &mut derived);
    let plain = cbc::Decryptor::<aes::Aes256>::new(&derived.into(), iv.into())
        .decrypt_padded_vec_mut::<Pkcs7>(&data[17..])
        .map_err(|_| "could not decrypt the v1 connection file".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    /// Made by Node with conf's own algorithm; the IV holds bytes that are not valid UTF-8.
    const FIXTURE: &str = "ff00c3a9e28228fe41f0908d42c0af7f3adf8eef895468f87697212e9af310c73fe1f9e6b475206d1f28419059bf3fa1c4d0805b6cfcab779f1be9577be38d380315dbde087cbfdf0474797e2af4aa24581879c4a5961ce6c3d92b03babcd1d337455a5809e26545b2cb934ffa51672105503dc95d89e7e330075c0e7b2c3792680b548fccc68bc3fa6ec832b0aa0ea9d08d575daca9d1aa19f9cb999f265c00390a1c3380736d697310e23c22a0e8a770ed6ea81f5c1472cd2b4c208eaf2c084f7e68680e2f58dab59a317c6a74cb6dbc68abd95584055ccc69e5e1ab84a5604f8fccec031090a27fe38772c2f15075467737162e1b2e4ba459f2c5a8d4cbfa9f";

    #[test]
    fn decrypts_electron_store_files() {
        let text = decrypt(&hex(FIXTURE), ELECTRON_STORE_KEY).unwrap();
        let doc: Value = serde_json::from_str(&text).unwrap();
        let c = &doc["connections"][0];
        assert_eq!(c["name"], "local");
        assert_eq!(c["saslMechanism"], "scram-sha-256");
        assert_eq!(c["saslPassword"], "p");
    }

    #[test]
    fn plain_json_passes_through() {
        assert_eq!(decrypt(br#"{"connections":[]}"#, ELECTRON_STORE_KEY).unwrap(), r#"{"connections":[]}"#);
    }

    #[test]
    fn wrong_key_is_an_error() {
        assert!(decrypt(&hex(FIXTURE), "another-key").is_err());
    }
}
