//! Verify release artifacts against the public key already shipped to Tauri users.
use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};
use std::{env, error::Error, fs};

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = env::args().collect();
    if args.len() != 4 {
        return Err("usage: verify_tauri ARCHIVE TAURI_CONFIG VERSION".into());
    }
    let config: serde_json::Value = serde_json::from_slice(&fs::read(&args[2])?)?;
    let public_key = config["plugins"]["updater"]["pubkey"]
        .as_str()
        .ok_or("missing Tauri updater public key")?;
    let public_key = PublicKey::decode(&String::from_utf8(STANDARD.decode(public_key)?)?)?;
    let signature = fs::read_to_string(format!("{}.sig", args[1]))?;
    let signature = Signature::decode(&String::from_utf8(STANDARD.decode(signature.trim())?)?)?;
    public_key.verify(&fs::read(&args[1])?, &signature, true)?;
    let expected_version = format!("version:{}", args[3]);
    if !signature
        .trusted_comment()
        .split_whitespace()
        .any(|field| field == expected_version)
    {
        return Err("signature is not bound to the requested release version".into());
    }
    println!("Verified Tauri update signature and version");
    Ok(())
}
